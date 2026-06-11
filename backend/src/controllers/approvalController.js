// src/controllers/approvalController.js
import { validationResult } from "express-validator";
import { checkApprovalRequired, createApprovalChain } from "../services/approvalWorkflow.js";
import { makeApprovalSlaService } from "../services/approvalSlaService.js";

const send = {
  ok: (res, data = {}) => res.json(data),
  created: (res, data = {}) => res.status(201).json(data),
  bad: (res, msg = "Bad request") => res.status(400).json({ error: msg }),
  notFound: (res, msg = "Not found") => res.status(404).json({ error: msg }),
  serverErr: (res, msg = "Internal server error") => res.status(500).json({ error: msg }),
};

export function makeApprovalController(pool) {
  const approvalSlaService = makeApprovalSlaService(pool);

  // Helper: check if a user is authorized to act on an approval (direct or via delegation)
  async function isAuthorizedApprover(approvalId, userId) {
    const [approvals] = await pool.query(
      `SELECT * FROM ticket_approvals WHERE id = ?`,
      [approvalId]
    );
    if (approvals.length === 0) return { authorized: false, approval: null };
    const approval = approvals[0];

    // Direct approver
    if (approval.approver_id === userId) {
      return { authorized: true, approval, isDelegated: false };
    }

    // Check active delegations from the approver to this user
    const [delegations] = await pool.query(
      `SELECT * FROM approval_delegations
       WHERE delegator_id = ? AND delegate_id = ? AND is_active = 1
       AND (
         delegation_type = 'permanent'
         OR (delegation_type = 'temporary' AND NOW() BETWEEN start_date AND end_date)
         OR (delegation_type = 'specific_ticket' AND ticket_id = ?)
       )
       LIMIT 1`,
      [approval.approver_id, userId, approval.ticket_id]
    );

    if (delegations.length > 0) {
      return { authorized: true, approval, isDelegated: true };
    }

    return { authorized: false, approval: null };
  }

  return {
    // ===== APPROVAL RULES =====

    // GET /api/approval-rules
    listRules: async (req, res) => {
      try {
        const [rows] = await pool.query(
          `SELECT ar.*,
                  u.full_name as created_by_name,
                  d.name as department_name,
                  t.name as team_name,
                  aa.full_name as after_agent_name,
                  at2.name as after_team_name
           FROM approval_rules ar
           LEFT JOIN users u ON u.id = ar.created_by
           LEFT JOIN departments d ON d.id = ar.applies_to_department_id
           LEFT JOIN teams t ON t.id = ar.applies_to_team_id
           LEFT JOIN users aa ON aa.id = ar.after_approval_agent_id
           LEFT JOIN teams at2 ON at2.id = ar.after_approval_team_id
           ORDER BY ar.priority_order DESC, ar.created_at DESC`
        );
        // Parse default_approvers JSON and ensure all fields are included
        const parsed = rows.map(r => {
          const plain = { ...r };
          // Explicitly copy alias fields that may be null from LEFT JOINs
          plain.after_agent_name = r.after_agent_name || null;
          plain.after_team_name = r.after_team_name || null;
          if (plain.default_approvers && typeof plain.default_approvers === "string") {
            plain.default_approvers = JSON.parse(plain.default_approvers);
          } else {
            plain.default_approvers = plain.default_approvers || null;
          }
          return plain;
        });
        return send.ok(res, { rules: parsed });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },

    // GET /api/approval-rules/:id
    getRule: async (req, res) => {
      const ruleId = Number(req.params.id);
      try {
        const [rows] = await pool.query(
          `SELECT ar.*,
                  u.full_name as created_by_name,
                  d.name as department_name,
                  t.name as team_name,
                  aa.full_name as after_agent_name,
                  at2.name as after_team_name
           FROM approval_rules ar
           LEFT JOIN users u ON u.id = ar.created_by
           LEFT JOIN departments d ON d.id = ar.applies_to_department_id
           LEFT JOIN teams t ON t.id = ar.applies_to_team_id
           LEFT JOIN users aa ON aa.id = ar.after_approval_agent_id
           LEFT JOIN teams at2 ON at2.id = ar.after_approval_team_id
           WHERE ar.id = ?`,
          [ruleId]
        );
        if (rows.length === 0) return send.bad(res, "Rule not found");
        const rule = rows[0];
        // Parse default_approvers JSON
        if (rule.default_approvers && typeof rule.default_approvers === "string") {
          rule.default_approvers = JSON.parse(rule.default_approvers);
        }
        return send.ok(res, { rule });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },

    // POST /api/approval-rules
    createRule: async (req, res) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return send.bad(res, errors.array()[0].msg);

      const {
        name,
        description,
        applies_to_priority_key,
        applies_to_type_key,
        applies_to_department_id,
        applies_to_team_id,
        min_estimated_cost,
        approval_levels,
        auto_approve_after_hours,
        priority_order,
        after_approval_agent_id,
        after_approval_team_id,
        default_approvers,
        notes_template,
        require_all_approvers,
      } = req.body;

      try {
        const [result] = await pool.query(
          `INSERT INTO approval_rules (
            name, description, applies_to_priority_key, applies_to_type_key,
            applies_to_department_id, applies_to_team_id, min_estimated_cost,
            approval_levels, auto_approve_after_hours, priority_order,
            after_approval_agent_id, after_approval_team_id, default_approvers,
            notes_template, require_all_approvers, created_by
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            name,
            description || null,
            applies_to_priority_key || null,
            applies_to_type_key || null,
            applies_to_department_id || null,
            applies_to_team_id || null,
            min_estimated_cost || null,
            approval_levels || 1,
            auto_approve_after_hours || null,
            priority_order || 0,
            after_approval_agent_id || null,
            after_approval_team_id || null,
            default_approvers ? JSON.stringify(default_approvers) : null,
            notes_template || null,
            require_all_approvers ? 1 : 0,
            req.user.id,
          ]
        );
        return send.created(res, { id: result.insertId, name });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },

    // PATCH /api/approval-rules/:id
    updateRule: async (req, res) => {
      const ruleId = Number(req.params.id);
      const updates = [];
      const values = [];

      const fields = [
        "name",
        "description",
        "applies_to_priority_key",
        "applies_to_type_key",
        "applies_to_department_id",
        "applies_to_team_id",
        "min_estimated_cost",
        "approval_levels",
        "auto_approve_after_hours",
        "priority_order",
        "is_active",
        "after_approval_agent_id",
        "after_approval_team_id",
        "notes_template",
        "require_all_approvers",
      ];

      fields.forEach((field) => {
        if (req.body[field] !== undefined) {
          updates.push(`${field} = ?`);
          values.push(req.body[field]);
        }
      });

      // Handle default_approvers JSON separately
      if (req.body.default_approvers !== undefined) {
        updates.push("default_approvers = ?");
        values.push(req.body.default_approvers ? JSON.stringify(req.body.default_approvers) : null);
      }

      if (updates.length === 0) return send.bad(res, "No fields to update");

      try {
        await pool.query(
          `UPDATE approval_rules SET ${updates.join(", ")} WHERE id = ?`,
          [...values, ruleId]
        );
        return send.ok(res, { ok: true });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },

    // DELETE /api/approval-rules/:id
    deleteRule: async (req, res) => {
      const ruleId = Number(req.params.id);
      try {
        const [result] = await pool.query(`DELETE FROM approval_rules WHERE id = ?`, [ruleId]);
        if (result.affectedRows === 0) return send.bad(res, "Rule not found");
        return send.ok(res, { ok: true });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },

    // ===== TICKET APPROVALS =====

    // GET /api/tickets/:id/approvals
    getTicketApprovals: async (req, res) => {
      const ticketId = Number(req.params.id);
      try {
        const [rows] = await pool.query(
          `SELECT ta.*,
                  u.full_name as approver_name,
                  u.email as approver_email,
                  ar.name as rule_name,
                  tas.due_at as sla_due_at,
                  tas.started_at as sla_started_at,
                  tas.completed_at as sla_completed_at,
                  tas.met as sla_met,
                  tas.breached as sla_breached,
                  tas.remaining_ms as sla_remaining_ms,
                  tas.escalated as sla_escalated,
                  asp.target_minutes as sla_target_minutes
           FROM ticket_approvals ta
           LEFT JOIN users u ON u.id = ta.approver_id
           LEFT JOIN approval_rules ar ON ar.id = ta.approval_rule_id
           LEFT JOIN ticket_approval_slas tas ON tas.ticket_approval_id = ta.id
           LEFT JOIN approval_sla_policies asp ON asp.id = tas.approval_sla_policy_id
           WHERE ta.ticket_id = ?
           ORDER BY ta.approval_level ASC, ta.created_at ASC`,
          [ticketId]
        );
        return send.ok(res, { approvals: rows });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },

    // GET /api/approvals/pending - get all pending approvals for current user
    getPendingApprovals: async (req, res) => {
      try {
        const [rows] = await pool.query(
          `SELECT ta.*,
                  t.ticket_number, t.subject, p.\`key\` AS priority_key, t.created_at as ticket_created_at,
                  u.full_name as requester_name,
                  ar.name as rule_name,
                  CASE WHEN ta.approver_id = ? THEN 0 ELSE 1 END as is_delegated,
                  del_user.full_name as delegator_name
           FROM ticket_approvals ta
           INNER JOIN tickets t ON t.id = ta.ticket_id
           LEFT JOIN ticket_priorities p ON p.id = t.priority_id
           LEFT JOIN users u ON u.id = t.requester_id
           LEFT JOIN approval_rules ar ON ar.id = ta.approval_rule_id
           LEFT JOIN users del_user ON del_user.id = ta.approver_id AND ta.approver_id != ?
           WHERE (ta.approver_id = ? OR ta.approver_id IN (
             SELECT delegator_id FROM approval_delegations
             WHERE delegate_id = ? AND is_active = 1
             AND (delegation_type = 'permanent'
               OR (delegation_type = 'temporary' AND NOW() BETWEEN start_date AND end_date)
               OR (delegation_type = 'specific_ticket' AND ticket_id = ta.ticket_id))
           )) AND ta.status = 'pending'
           AND NOT EXISTS (
             SELECT 1 FROM ticket_approvals prev
             WHERE prev.ticket_id = ta.ticket_id
               AND prev.approval_level < ta.approval_level
               AND prev.status = 'pending'
           )
           ORDER BY ta.created_at DESC`,
          [req.user.id, req.user.id, req.user.id, req.user.id]
        );
        return send.ok(res, { approvals: rows });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },

    // POST /api/approvals/:id/approve
    approveTicket: async (req, res) => {
      const approvalId = Number(req.params.id);
      const { comments } = req.body;

      try {
        // Get the approval — check direct or delegated authorization
        const auth = await isAuthorizedApprover(approvalId, req.user.id);

        if (!auth.authorized) {
          return send.bad(res, "Approval not found or not assigned to you");
        }

        const approval = auth.approval;

        if (approval.status !== "pending") {
          return send.bad(res, "Approval already processed");
        }

        // Update approval
        await pool.query(
          `UPDATE ticket_approvals
           SET status = 'approved', approved_at = NOW(), approver_comments = ?
           WHERE id = ?`,
          [comments || null, approvalId]
        );

        // Log to history
        await pool.query(
          `INSERT INTO approval_history (ticket_id, approval_id, actor_id, action, comments, previous_status, new_status)
           VALUES (?, ?, ?, 'approved', ?, 'pending', 'approved')`,
          [approval.ticket_id, approvalId, req.user.id, comments || null]
        );

        // Log to ticket events for activity trail
        await pool.query(
          `INSERT INTO ticket_events (ticket_id, actor_id, event_type, payload_json)
           VALUES (?, ?, 'approval.approved', ?)`,
          [
            approval.ticket_id,
            req.user.id,
            JSON.stringify({
              approval_id: approvalId,
              level: approval.approval_level,
              total_levels: approval.total_levels,
              approver_name: req.user.full_name || req.user.email,
              comments: comments || null,
            }),
          ]
        );

        // Complete approval SLA for this approval record
        try {
          await approvalSlaService.completeApprovalSla(approvalId);
        } catch (aslErr) {
          console.error("Approval SLA complete error:", aslErr);
        }

        // For "any one" mode: if require_all_at_level = 0, skip other approvers at this level
        if (!approval.require_all_at_level) {
          await pool.query(
            `UPDATE ticket_approvals
             SET status = 'auto_approved', approved_at = NOW(),
                 approver_comments = 'Skipped: another approver at this level already approved'
             WHERE ticket_id = ? AND approval_level = ? AND status = 'pending' AND id != ?`,
            [approval.ticket_id, approval.approval_level, approvalId]
          );
        }

        // Check if all approvals for this level are done
        const [pending] = await pool.query(
          `SELECT COUNT(*) as count FROM ticket_approvals
           WHERE ticket_id = ? AND approval_level = ? AND status = 'pending'`,
          [approval.ticket_id, approval.approval_level]
        );

        if (pending[0].count === 0) {
          // This level is complete — check if any pending approvals remain across all levels
          const [remainingPending] = await pool.query(
            `SELECT COUNT(*) as count FROM ticket_approvals
             WHERE ticket_id = ? AND status = 'pending'`,
            [approval.ticket_id]
          );

          if (remainingPending[0].count > 0) {
            // More levels still pending — log the level advancement
            await pool.query(
              `INSERT INTO ticket_events (ticket_id, actor_id, event_type, payload_json)
               VALUES (?, ?, 'approval.level_advanced', ?)`,
              [approval.ticket_id, req.user.id, JSON.stringify({
                completed_level: approval.approval_level,
                next_level: approval.approval_level + 1,
              })]
            );

            // Assign approval SLA to the NEXT level now that this level is complete
            try {
              await approvalSlaService.assignApprovalSlas(approval.ticket_id);
            } catch (nextSlaErr) {
              console.error("Next-level approval SLA assignment error:", nextSlaErr);
            }
          } else if (remainingPending[0].count === 0) {
            // All approvals complete, update ticket
            await pool.query(
              `UPDATE tickets SET approval_status = 'approved' WHERE id = ?`,
              [approval.ticket_id]
            );

            // Apply after-approval actions: assign agent and/or move to team
            try {
              // Get after-approval settings from the last approval record
              const [afterSettings] = await pool.query(
                `SELECT return_to_agent_id, return_to_team_id FROM ticket_approvals
                 WHERE ticket_id = ? ORDER BY approval_level DESC LIMIT 1`,
                [approval.ticket_id]
              );
              if (afterSettings.length > 0) {
                const { return_to_agent_id, return_to_team_id } = afterSettings[0];
                const setParts = [];
                const setVals = [];
                if (return_to_agent_id) { setParts.push("assignee_id = ?"); setVals.push(return_to_agent_id); }
                if (return_to_team_id)  { setParts.push("team_id = ?");     setVals.push(return_to_team_id); }
                if (setParts.length > 0) {
                  await pool.query(
                    `UPDATE tickets SET ${setParts.join(", ")} WHERE id = ?`,
                    [...setVals, approval.ticket_id]
                  );
                  await pool.query(
                    `INSERT INTO ticket_events (ticket_id, actor_id, event_type, payload_json)
                     VALUES (?, ?, 'approval.post_actions_applied', ?)`,
                    [approval.ticket_id, req.user.id, JSON.stringify({
                      assigned_to: return_to_agent_id || null,
                      moved_to_team: return_to_team_id || null,
                    })]
                  );
                }
              }
            } catch (afterErr) {
              console.error("After-approval actions error:", afterErr);
            }

            // Resume SLA — approval is done, team can now work on the ticket
            try {
              const [slas] = await pool.query(
                `SELECT paused_at, response_remaining_ms, resolve_remaining_ms,
                        response_met_at, resolve_met_at, response_due_at, resolve_due_at
                 FROM ticket_slas WHERE ticket_id = ?`,
                [approval.ticket_id]
              );
              if (slas.length > 0 && slas[0].paused_at) {
                const sla = slas[0];
                const now = new Date();

                const newResponseDue = sla.response_remaining_ms && !sla.response_met_at
                  ? new Date(now.getTime() + Number(sla.response_remaining_ms))
                  : sla.response_due_at;
                const newResolveDue = sla.resolve_remaining_ms && !sla.resolve_met_at
                  ? new Date(now.getTime() + Number(sla.resolve_remaining_ms))
                  : sla.resolve_due_at;

                await pool.query(
                  `UPDATE ticket_slas
                   SET paused_at = NULL,
                       response_remaining_ms = NULL,
                       resolve_remaining_ms = NULL,
                       response_due_at = ?,
                       resolve_due_at = ?,
                       updated_at = NOW()
                   WHERE ticket_id = ?`,
                  [newResponseDue, newResolveDue, approval.ticket_id]
                );

                await pool.query(
                  `INSERT INTO ticket_events (ticket_id, event_type, payload_json)
                   VALUES (?, 'sla.resumed', ?)`,
                  [approval.ticket_id, JSON.stringify({
                    reason: "approval_completed",
                    new_response_due: newResponseDue,
                    new_resolve_due: newResolveDue,
                  })]
                );
              }
            } catch (slaErr) {
              console.error("SLA resume on approval error:", slaErr);
            }
          }
        }

        return send.ok(res, { ok: true, message: "Ticket approved" });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },

    // POST /api/approvals/:id/reject
    rejectTicket: async (req, res) => {
      const approvalId = Number(req.params.id);
      const { reason, comments } = req.body;

      if (!reason) {
        return send.bad(res, "Rejection reason is required");
      }

      try {
        // Get the approval — check direct or delegated authorization
        const auth = await isAuthorizedApprover(approvalId, req.user.id);

        if (!auth.authorized) {
          return send.bad(res, "Approval not found or not assigned to you");
        }

        const approval = auth.approval;

        if (approval.status !== "pending") {
          return send.bad(res, "Approval already processed");
        }

        // Update approval
        await pool.query(
          `UPDATE ticket_approvals
           SET status = 'rejected', approved_at = NOW(), rejection_reason = ?, approver_comments = ?
           WHERE id = ?`,
          [reason, comments || null, approvalId]
        );

        // Log to history
        await pool.query(
          `INSERT INTO approval_history (ticket_id, approval_id, actor_id, action, comments, previous_status, new_status)
           VALUES (?, ?, ?, 'rejected', ?, 'pending', 'rejected')`,
          [approval.ticket_id, approvalId, req.user.id, reason]
        );

        // Log to ticket events for activity trail
        await pool.query(
          `INSERT INTO ticket_events (ticket_id, actor_id, event_type, payload_json)
           VALUES (?, ?, 'approval.rejected', ?)`,
          [
            approval.ticket_id,
            req.user.id,
            JSON.stringify({
              approval_id: approvalId,
              level: approval.approval_level,
              approver_name: req.user.full_name || req.user.email,
              reason,
              comments: comments || null,
            }),
          ]
        );

        // Complete approval SLA for this approval record
        try {
          await approvalSlaService.completeApprovalSla(approvalId);
        } catch (aslErr) {
          console.error("Approval SLA complete error:", aslErr);
        }

        // Cancel all other pending approvals on this ticket
        await pool.query(
          `UPDATE ticket_approvals SET status = 'rejected', approved_at = NOW(),
           rejection_reason = 'Rejected at a prior level'
           WHERE ticket_id = ? AND status = 'pending' AND id != ?`,
          [approval.ticket_id, approvalId]
        );

        // Update ticket status to rejected
        await pool.query(
          `UPDATE tickets SET approval_status = 'rejected' WHERE id = ?`,
          [approval.ticket_id]
        );

        return send.ok(res, { ok: true, message: "Ticket rejected" });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },

    // GET /api/approvals/history/:ticketId
    getApprovalHistory: async (req, res) => {
      const ticketId = Number(req.params.ticketId);
      try {
        const [rows] = await pool.query(
          `SELECT ah.*,
                  u.full_name as actor_name,
                  ta.approver_id,
                  approver.full_name as approver_name
           FROM approval_history ah
           LEFT JOIN users u ON u.id = ah.actor_id
           LEFT JOIN ticket_approvals ta ON ta.id = ah.approval_id
           LEFT JOIN users approver ON approver.id = ta.approver_id
           WHERE ah.ticket_id = ?
           ORDER BY ah.created_at DESC`,
          [ticketId]
        );
        return send.ok(res, { history: rows });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },

    // POST /api/tickets/:id/send-for-approval
    // Agents can manually send a ticket for approval
    // Supports both automatic (rule-based) and manual (custom approvers) modes
    sendForApproval: async (req, res) => {
      const ticketId = Number(req.params.id);
      const {
        rule_id,           // Optional: specific rule ID for automatic mode
        approvers,         // Optional: array of { user_id, level } for manual mode
        require_all,       // Optional: if true, all approvers at same level must approve (default: false = any one)
        return_to_agent,   // Optional: agent ID to return ticket to after approval
        return_to_queue,   // Optional: team ID queue to return ticket to after approval
        notes,             // Optional: notes about the approval request
      } = req.body;

      try {
        // Get the ticket
        const [tickets] = await pool.query(
          `SELECT t.*, ts.key as status_key
           FROM tickets t
           LEFT JOIN ticket_statuses ts ON ts.id = t.status_id
           WHERE t.id = ?`,
          [ticketId]
        );

        if (tickets.length === 0) {
          return send.notFound(res, "Ticket not found");
        }

        const ticket = tickets[0];

        // Check if ticket is already pending approval or approved
        if (ticket.approval_status === "pending") {
          return send.bad(res, "Ticket is already pending approval");
        }
        if (ticket.approval_status === "approved") {
          return send.bad(res, "Ticket has already been approved");
        }

        let createdApprovals = [];
        let approvalMode = "automatic";
        let ruleName = null;

        // MANUAL MODE: Custom approvers specified
        if (approvers && Array.isArray(approvers) && approvers.length > 0) {
          approvalMode = "manual";

          // Validate approvers exist
          const approverIds = approvers.map(a => a.user_id);
          const [validUsers] = await pool.query(
            `SELECT id, full_name FROM users WHERE id IN (?) AND is_active = TRUE`,
            [approverIds]
          );

          if (validUsers.length !== approverIds.length) {
            return send.bad(res, "One or more selected approvers are invalid");
          }

          // Group approvers by level
          const levelGroups = {};
          approvers.forEach(a => {
            const level = a.level || 1;
            if (!levelGroups[level]) levelGroups[level] = [];
            levelGroups[level].push(a.user_id);
          });

          const totalLevels = Math.max(...Object.keys(levelGroups).map(Number));

          // Create approval records for each approver
          for (const [level, userIds] of Object.entries(levelGroups)) {
            for (const userId of userIds) {
              const [result] = await pool.query(
                `INSERT INTO ticket_approvals (
                  ticket_id, approval_rule_id, approval_level, total_levels, approver_id,
                  status, require_all_at_level, return_to_agent_id, return_to_team_id
                ) VALUES (?, NULL, ?, ?, ?, 'pending', ?, ?, ?)`,
                [
                  ticketId,
                  parseInt(level),
                  totalLevels,
                  userId,
                  require_all ? 1 : 0,
                  return_to_agent || null,
                  return_to_queue || null,
                ]
              );

              createdApprovals.push({
                id: result.insertId,
                level: parseInt(level),
                approver_id: userId,
              });

              // Log to history
              await pool.query(
                `INSERT INTO approval_history (
                  ticket_id, approval_id, actor_id, action, comments, new_status
                ) VALUES (?, ?, ?, 'requested', ?, 'pending')`,
                [ticketId, result.insertId, req.user.id, notes || `Manual approval requested - Level ${level}`]
              );
            }
          }

          ruleName = "Manual Approval";

        } else {
          // AUTOMATIC MODE: Use rules or hierarchy
          let approvalRule;
          if (rule_id) {
            const [rules] = await pool.query(
              `SELECT * FROM approval_rules WHERE id = ? AND is_active = TRUE`,
              [rule_id]
            );
            if (rules.length === 0) {
              return send.bad(res, "Approval rule not found or inactive");
            }
            approvalRule = rules[0];
          } else {
            // Auto-match based on ticket properties
            approvalRule = await checkApprovalRequired(pool, {
              priority_key: ticket.priority_key,
              type_key: ticket.type_key,
              team_id: ticket.team_id,
              department_id: ticket.department_id,
              estimated_cost: ticket.estimated_cost,
            });

            if (!approvalRule) {
              return send.bad(res, "No matching approval rule found. Use manual mode to select approvers.");
            }
          }

          // Check if rule has default approvers configured
          let ruleDefaultApprovers = approvalRule.default_approvers;
          if (ruleDefaultApprovers && typeof ruleDefaultApprovers === "string") {
            ruleDefaultApprovers = JSON.parse(ruleDefaultApprovers);
          }

          if (Array.isArray(ruleDefaultApprovers) && ruleDefaultApprovers.length > 0) {
            // Use rule's pre-configured approvers instead of hierarchy
            const levelGroups = {};
            ruleDefaultApprovers.forEach(a => {
              const level = a.approval_level || a.level || 1;
              if (!levelGroups[level]) levelGroups[level] = [];
              levelGroups[level].push(a.user_id);
            });

            const totalLevels = Math.max(...Object.keys(levelGroups).map(Number));
            const ruleRequireAll = approvalRule.require_all_approvers ? 1 : 0;

            for (const [level, userIds] of Object.entries(levelGroups)) {
              for (const userId of userIds) {
                const [result] = await pool.query(
                  `INSERT INTO ticket_approvals (
                    ticket_id, approval_rule_id, approval_level, total_levels, approver_id,
                    status, require_all_at_level, return_to_agent_id, return_to_team_id
                  ) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?)`,
                  [
                    ticketId,
                    approvalRule.id,
                    parseInt(level),
                    totalLevels,
                    userId,
                    ruleRequireAll,
                    return_to_agent || approvalRule.after_approval_agent_id || null,
                    return_to_queue || approvalRule.after_approval_team_id || null,
                  ]
                );
                createdApprovals.push({ id: result.insertId, level: parseInt(level), approver_id: userId });

                await pool.query(
                  `INSERT INTO approval_history (
                    ticket_id, approval_id, actor_id, action, comments, new_status
                  ) VALUES (?, ?, ?, 'requested', ?, 'pending')`,
                  [ticketId, result.insertId, req.user.id, notes || approvalRule.notes_template || `Rule-based approval - Level ${level}`]
                );
              }
            }
          } else {
            // Fallback to hierarchy-based approval chain
            createdApprovals = await createApprovalChain(
              pool,
              ticketId,
              ticket.requester_id,
              approvalRule
            );
          }

          // Update return-to settings (user override > rule config > null)
          const effectiveAgent = return_to_agent || approvalRule.after_approval_agent_id || null;
          const effectiveTeam = return_to_queue || approvalRule.after_approval_team_id || null;
          if (effectiveAgent || effectiveTeam) {
            await pool.query(
              `UPDATE ticket_approvals
               SET return_to_agent_id = COALESCE(return_to_agent_id, ?),
                   return_to_team_id = COALESCE(return_to_team_id, ?)
               WHERE ticket_id = ? AND status = 'pending'`,
              [effectiveAgent, effectiveTeam, ticketId]
            );
          }

          ruleName = approvalRule.name;
        }

        // Update ticket status
        await pool.query(
          `UPDATE tickets SET requires_approval = TRUE, approval_status = 'pending' WHERE id = ?`,
          [ticketId]
        );

        // Log audit event
        await pool.query(
          `INSERT INTO ticket_events (ticket_id, actor_id, event_type, payload_json)
           VALUES (?, ?, 'ticket.sent_for_approval', ?)`,
          [
            ticketId,
            req.user.id,
            JSON.stringify({
              mode: approvalMode,
              rule_name: ruleName,
              approvers_count: createdApprovals.length,
              return_to_agent: return_to_agent || null,
              return_to_queue: return_to_queue || null,
              notes: notes || null,
            }),
          ]
        );

        return send.ok(res, {
          ok: true,
          message: "Ticket sent for approval",
          mode: approvalMode,
          rule: ruleName,
          approvals: createdApprovals.length,
        });
      } catch (e) {
        console.error(e);
        if (e.message && e.message.includes("No manager found")) {
          return send.bad(res, e.message);
        }
        return send.serverErr(res);
      }
    },

    // GET /api/users/approvers - Get list of potential approvers
    getApprovers: async (req, res) => {
      try {
        // Get all users who can be approvers (managers, admins, agents)
        const [users] = await pool.query(
          `SELECT DISTINCT u.id, u.full_name, u.email
           FROM users u
           WHERE u.is_active = TRUE
           AND (
             u.id IN (SELECT DISTINCT manager_id FROM user_hierarchy WHERE is_active = TRUE)
             OR u.id IN (SELECT user_id FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE r.name IN ('admin', 'agent'))
           )
           ORDER BY u.full_name`
        );
        return send.ok(res, { approvers: users });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },

    // ===== APPROVAL DELEGATIONS =====

    // GET /api/approvals/delegations - get delegations for current user
    getDelegations: async (req, res) => {
      try {
        const [rows] = await pool.query(
          `SELECT ad.*,
                  delegator.full_name as delegator_name,
                  delegator.email as delegator_email,
                  delegate.full_name as delegate_name,
                  delegate.email as delegate_email
           FROM approval_delegations ad
           LEFT JOIN users delegator ON delegator.id = ad.delegator_id
           LEFT JOIN users delegate ON delegate.id = ad.delegate_id
           WHERE ad.delegator_id = ? OR ad.delegate_id = ?
           ORDER BY ad.created_at DESC`,
          [req.user.id, req.user.id]
        );
        return send.ok(res, { delegations: rows });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },

    // POST /api/approvals/delegate - create a new delegation
    createDelegation: async (req, res) => {
      const { delegate_id, delegation_type, start_date, end_date, ticket_id, reason } = req.body;

      if (!delegate_id) {
        return send.bad(res, "Delegate user is required");
      }
      if (delegate_id === req.user.id) {
        return send.bad(res, "Cannot delegate to yourself");
      }
      if (delegation_type === "temporary") {
        if (!start_date || !end_date) {
          return send.bad(res, "Start date and end date are required for temporary delegations");
        }
      }

      try {
        const [result] = await pool.query(
          `INSERT INTO approval_delegations (delegator_id, delegate_id, delegation_type, start_date, end_date, ticket_id, reason)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            req.user.id,
            delegate_id,
            delegation_type || "temporary",
            start_date || null,
            end_date || null,
            ticket_id || null,
            reason || null,
          ]
        );

        // Fetch the created record with user names
        const [rows] = await pool.query(
          `SELECT ad.*,
                  delegator.full_name as delegator_name,
                  delegate.full_name as delegate_name
           FROM approval_delegations ad
           LEFT JOIN users delegator ON delegator.id = ad.delegator_id
           LEFT JOIN users delegate ON delegate.id = ad.delegate_id
           WHERE ad.id = ?`,
          [result.insertId]
        );

        return send.created(res, { delegation: rows[0] });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },

    // DELETE /api/approvals/delegations/:id - revoke a delegation
    revokeDelegation: async (req, res) => {
      const delegationId = Number(req.params.id);
      try {
        const [result] = await pool.query(
          `UPDATE approval_delegations SET is_active = 0 WHERE id = ? AND delegator_id = ?`,
          [delegationId, req.user.id]
        );
        if (result.affectedRows === 0) {
          return send.bad(res, "Delegation not found or you are not the delegator");
        }
        return send.ok(res, { ok: true, message: "Delegation revoked" });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },

    // POST /api/approvals/:id/delegate - delegate a specific pending approval to another user
    delegateApproval: async (req, res) => {
      const approvalId = Number(req.params.id);
      const { delegate_id, reason } = req.body;

      if (!delegate_id) {
        return send.bad(res, "Delegate user is required");
      }

      try {
        // Check the approval exists and the current user is authorized
        const auth = await isAuthorizedApprover(approvalId, req.user.id);
        if (!auth.authorized) {
          return send.bad(res, "Approval not found or not assigned to you");
        }

        const approval = auth.approval;

        if (approval.status !== "pending") {
          return send.bad(res, "Can only delegate pending approvals");
        }

        // Check can_delegate flag from template_approval_steps (if template-based)
        // Link: ticket.template_id → template_approval_flows.template_id → template_approval_steps (by step_order = approval_level)
        try {
          const [steps] = await pool.query(
            `SELECT tas.can_delegate
             FROM template_approval_steps tas
             INNER JOIN template_approval_flows taf ON taf.id = tas.flow_id
             INNER JOIN tickets t ON t.template_id = taf.template_id
             WHERE t.id = ? AND tas.step_order = ? AND tas.is_active = 1
             LIMIT 1`,
            [approval.ticket_id, approval.approval_level]
          );
          if (steps.length > 0 && steps[0].can_delegate === 0) {
            return res.status(403).json({
              error: "DELEGATION_NOT_ALLOWED",
              message: "This approval step does not allow delegation. The template configuration restricts delegation for this level.",
            });
          }
        } catch (checkErr) {
          // If template step lookup fails, allow delegation by default
          console.warn("can_delegate check skipped:", checkErr.message);
        }

        // Change the approver on the ticket_approvals record
        await pool.query(
          `UPDATE ticket_approvals SET approver_id = ? WHERE id = ?`,
          [delegate_id, approvalId]
        );

        // Log to approval_history
        await pool.query(
          `INSERT INTO approval_history (ticket_id, approval_id, actor_id, action, comments, previous_status, new_status)
           VALUES (?, ?, ?, 'delegated', ?, 'pending', 'pending')`,
          [approval.ticket_id, approvalId, req.user.id, reason || `Delegated to user ${delegate_id}`]
        );

        // Log to ticket activity/events
        const [delegateUser] = await pool.query(`SELECT full_name FROM users WHERE id = ?`, [delegate_id]);
        const delegateName = delegateUser.length > 0 ? delegateUser[0].full_name : `User #${delegate_id}`;
        await pool.query(
          `INSERT INTO ticket_events (ticket_id, actor_id, event_type, payload_json)
           VALUES (?, ?, 'approval.delegated', ?)`,
          [approval.ticket_id, req.user.id, JSON.stringify({
            approval_id: approvalId,
            approval_level: approval.approval_level,
            delegated_to_id: delegate_id,
            delegated_to_name: delegateName,
            reason: reason || null,
          })]
        );

        return send.ok(res, { ok: true, message: "Approval delegated successfully" });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },
  };
}
