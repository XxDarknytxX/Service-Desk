// src/services/approvalWorkflow.js
// Approval Workflow Logic

/**
 * Check if a ticket requires approval based on active approval rules
 * Returns the matching rule with highest priority
 */
export async function checkApprovalRequired(pool, ticketData) {
  const { priority_key, type_key, team_id, department_id, estimated_cost } = ticketData;

  // Find all matching active rules, ordered by priority
  const [rules] = await pool.query(
    `SELECT * FROM approval_rules
     WHERE is_active = TRUE
     AND (
       (applies_to_priority_key IS NULL OR applies_to_priority_key = ?)
       AND (applies_to_type_key IS NULL OR applies_to_type_key = ?)
       AND (applies_to_department_id IS NULL OR applies_to_department_id = ?)
       AND (applies_to_team_id IS NULL OR applies_to_team_id = ?)
       AND (min_estimated_cost IS NULL OR ? >= min_estimated_cost)
     )
     ORDER BY priority_order DESC, id ASC
     LIMIT 1`,
    [
      priority_key || null,
      type_key || null,
      department_id || null,
      team_id || null,
      estimated_cost || 0,
    ]
  );

  return rules.length > 0 ? rules[0] : null;
}

/**
 * Create approval records for a ticket based on the approval rule
 * This builds the approval chain using the user's hierarchy
 */
export async function createApprovalChain(pool, ticketId, requesterId, approvalRule) {
  const levelsNeeded = approvalRule.approval_levels || 1;

  // Get the requester's reporting chain
  const [hierarchy] = await pool.query(
    `SELECT manager_id, level FROM user_hierarchy
     WHERE user_id = ? AND is_active = TRUE
     ORDER BY level ASC
     LIMIT ?`,
    [requesterId, levelsNeeded]
  );

  if (hierarchy.length === 0) {
    throw new Error("No manager found in hierarchy. Ticket cannot be approved.");
  }

  const approvals = [];

  // Create approval records for each level
  for (let i = 0; i < Math.min(levelsNeeded, hierarchy.length); i++) {
    const manager = hierarchy[i];

    const [result] = await pool.query(
      `INSERT INTO ticket_approvals (
        ticket_id, approval_rule_id, approval_level, total_levels, approver_id, status
      ) VALUES (?, ?, ?, ?, ?, 'pending')`,
      [ticketId, approvalRule.id, i + 1, levelsNeeded, manager.manager_id]
    );

    approvals.push({
      id: result.insertId,
      approval_level: i + 1,
      approver_id: manager.manager_id,
    });

    // Log to history
    await pool.query(
      `INSERT INTO approval_history (
        ticket_id, approval_id, actor_id, action, comments, new_status
      ) VALUES (?, ?, ?, 'requested', ?, 'pending')`,
      [
        ticketId,
        result.insertId,
        requesterId,
        `Approval requested from level ${i + 1} manager`,
      ]
    );
  }

  return approvals;
}

/**
 * Resolve a single dynamic approver entry to actual user IDs.
 * Supports: specific_user, manager_chain, department_head, team_lead
 * Legacy entries without a `type` field are treated as specific_user.
 */
async function resolveRuleApprover(pool, entry, requesterId, teamId) {
  const type = entry.type || "specific_user";

  switch (type) {
    case "specific_user": {
      if (!entry.user_id) return [];
      const [users] = await pool.query(
        "SELECT id FROM users WHERE id = ? AND is_active = 1", [entry.user_id]
      );
      return users.map(u => u.id);
    }

    case "manager_chain": {
      const level = entry.manager_level || 1;
      const [h] = await pool.query(
        "SELECT manager_id FROM user_hierarchy WHERE user_id = ? AND level = ? AND is_active = 1",
        [requesterId, level]
      );
      return h.length > 0 ? [h[0].manager_id] : [];
    }

    case "department_head": {
      const [depts] = await pool.query(
        `SELECT d.head_user_id FROM users u
         INNER JOIN departments d ON d.id = u.department_id
         WHERE u.id = ? AND d.head_user_id IS NOT NULL`,
        [requesterId]
      );
      return depts.length > 0 ? [depts[0].head_user_id] : [];
    }

    case "team_lead": {
      if (!teamId) return [];
      const [leads] = await pool.query(
        `SELECT tm.user_id FROM team_members tm
         INNER JOIN users u ON u.id = tm.user_id
         WHERE tm.team_id = ? AND tm.is_lead = 1 AND u.is_active = 1 LIMIT 1`,
        [teamId]
      );
      return leads.length > 0 ? [leads[0].user_id] : [];
    }

    default:
      return [];
  }
}

/**
 * Process ticket creation with approval workflow
 * Call this after ticket is created to set up approvals
 */
export async function processTicketApproval(pool, ticketId, ticketData, requesterId) {
  try {
    // Check if approval is required
    const approvalRule = await checkApprovalRequired(pool, ticketData);

    if (!approvalRule || !approvalRule.requires_approval) {
      // No explicit rule matched — try default approval chain:
      // L1 = requester's direct manager, L2 = assigned team's lead
      const defaultResult = await _buildDefaultApprovalChain(pool, ticketId, ticketData, requesterId);
      if (defaultResult && defaultResult.requiresApproval) {
        return defaultResult;
      }
      // No approval needed
      await pool.query(
        `UPDATE tickets SET requires_approval = FALSE, approval_status = 'not_required' WHERE id = ?`,
        [ticketId]
      );
      return { requiresApproval: false };
    }

    // Approval is required, mark ticket
    await pool.query(
      `UPDATE tickets SET requires_approval = TRUE, approval_status = 'pending' WHERE id = ?`,
      [ticketId]
    );

    let approvals = [];

    // Check if rule has pre-configured default approvers
    let ruleDefaultApprovers = approvalRule.default_approvers;
    if (ruleDefaultApprovers && typeof ruleDefaultApprovers === "string") {
      ruleDefaultApprovers = JSON.parse(ruleDefaultApprovers);
    }

    if (Array.isArray(ruleDefaultApprovers) && ruleDefaultApprovers.length > 0) {
      // Use rule's pre-configured approvers — resolve dynamic types at runtime
      const levelGroups = {};

      for (const entry of ruleDefaultApprovers) {
        const level = entry.approval_level || entry.level || 1;
        const resolvedIds = await resolveRuleApprover(
          pool, entry, requesterId, ticketData.team_id
        );
        if (resolvedIds.length > 0) {
          if (!levelGroups[level]) levelGroups[level] = [];
          levelGroups[level].push(...resolvedIds);
        }
      }

      const allLevels = Object.keys(levelGroups).map(Number);
      if (allLevels.length === 0) {
        // None of the dynamic approvers could be resolved — fall through to hierarchy
        console.warn(`[Approval] Rule "${approvalRule.name}" - no approvers resolved, falling back to hierarchy`);
        approvals = await createApprovalChain(pool, ticketId, requesterId, approvalRule);
      } else {
        const totalLevels = Math.max(...allLevels);
        const ruleRequireAll = approvalRule.require_all_approvers ? 1 : 0;

        for (const [level, userIds] of Object.entries(levelGroups)) {
          // Deduplicate user IDs within the same level
          const uniqueIds = [...new Set(userIds)];
          for (const userId of uniqueIds) {
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
                approvalRule.after_approval_agent_id || null,
                approvalRule.after_approval_team_id || null,
              ]
            );

            approvals.push({
              id: result.insertId,
              approval_level: parseInt(level),
              approver_id: userId,
            });

            // Log to history
            await pool.query(
              `INSERT INTO approval_history (
                ticket_id, approval_id, actor_id, action, comments, new_status
              ) VALUES (?, ?, ?, 'requested', ?, 'pending')`,
              [
                ticketId,
                result.insertId,
                requesterId,
                approvalRule.notes_template || `Rule "${approvalRule.name}" - Level ${level} approval`,
              ]
            );
          }
        }
      }
    } else {
      // Fallback to hierarchy-based approval chain
      approvals = await createApprovalChain(pool, ticketId, requesterId, approvalRule);

      // Apply rule's after-approval settings if configured
      if (approvalRule.after_approval_agent_id || approvalRule.after_approval_team_id) {
        await pool.query(
          `UPDATE ticket_approvals
           SET return_to_agent_id = COALESCE(return_to_agent_id, ?),
               return_to_team_id = COALESCE(return_to_team_id, ?)
           WHERE ticket_id = ? AND status = 'pending'`,
          [
            approvalRule.after_approval_agent_id || null,
            approvalRule.after_approval_team_id || null,
            ticketId,
          ]
        );
      }
    }

    // Log audit event for the approval trigger
    await pool.query(
      `INSERT INTO ticket_events (ticket_id, actor_id, event_type, payload_json)
       VALUES (?, ?, 'ticket.sent_for_approval', ?)`,
      [
        ticketId,
        requesterId,
        JSON.stringify({
          mode: "automatic",
          rule_name: approvalRule.name,
          approvers_count: approvals.length,
          return_to_agent: approvalRule.after_approval_agent_id || null,
          return_to_queue: approvalRule.after_approval_team_id || null,
          notes: approvalRule.notes_template || null,
        }),
      ]
    );

    return {
      requiresApproval: true,
      approvalRule: approvalRule.name,
      approvalLevels: approvalRule.approval_levels,
      approvers: approvals.map((a) => a.approver_id),
    };
  } catch (error) {
    console.error("Approval workflow error:", error);
    // Don't fail ticket creation, just log the error
    await pool.query(
      `UPDATE tickets SET requires_approval = FALSE, approval_status = 'not_required' WHERE id = ?`,
      [ticketId]
    );
    return { requiresApproval: false, error: error.message };
  }
}

/**
 * Process template-specific approval flow for a ticket.
 * Called after ticket creation when the ticket was created from a template that has an approval flow.
 * Evaluates step conditions, resolves approvers, and creates ticket_approvals records.
 */
export async function processTemplateApprovalFlow(pool, ticketId, templateId, ticketData, requesterId) {
  try {
    // Check if template has an active approval flow
    const [flows] = await pool.query(
      "SELECT * FROM template_approval_flows WHERE template_id = ? AND is_enabled = 1",
      [templateId]
    );
    if (flows.length === 0) return { requiresApproval: false };

    const flow = flows[0];

    // Get active steps ordered by step_order
    const [steps] = await pool.query(
      "SELECT * FROM template_approval_steps WHERE flow_id = ? AND is_active = 1 ORDER BY step_order ASC",
      [flow.id]
    );
    if (steps.length === 0) return { requiresApproval: false };

    // Get template response data (form field values) for condition evaluation
    let formData = {};
    const [responses] = await pool.query(
      "SELECT response_data FROM ticket_template_responses WHERE ticket_id = ?",
      [ticketId]
    );
    if (responses.length > 0) {
      formData = typeof responses[0].response_data === "string"
        ? JSON.parse(responses[0].response_data)
        : responses[0].response_data || {};
    }

    const contextData = {
      priority: ticketData.priority_key || ticketData.priority || null,
      type: ticketData.type_key || ticketData.type || null,
      channel: ticketData.channel_key || ticketData.channel || null,
      team_id: ticketData.team_id || null,
      department_id: ticketData.department_id || null,
      requester_id: requesterId,
      form_data: formData,
    };

    // Evaluate each step's conditions
    const activeSteps = [];
    for (const step of steps) {
      const conditions = typeof step.conditions === "string" ? JSON.parse(step.conditions) : step.conditions || [];

      // AND logic — all conditions must pass for step to execute
      let conditionsMet = true;
      for (const cond of conditions) {
        const actual = _getFieldValue(cond.field, contextData);
        if (!_evalCondition(actual, cond.operator, cond.value)) {
          conditionsMet = false;
          break;
        }
      }

      if (conditionsMet) {
        activeSteps.push(step);
      }
    }

    if (activeSteps.length === 0) return { requiresApproval: false };

    // Mark ticket as requiring approval
    await pool.query(
      "UPDATE tickets SET requires_approval = TRUE, approval_status = 'pending' WHERE id = ?",
      [ticketId]
    );

    // Pre-resolve all approvers so we know the actual count of levels with approvers
    const resolvedSteps = [];
    const seenApproverIds = new Set();
    for (let i = 0; i < activeSteps.length; i++) {
      const step = activeSteps[i];
      const approverIds = await _resolveApprover(pool, step, contextData);
      // Deduplicate: if an approver already appears in an earlier level, skip them
      // (e.g. requester's manager IS the team lead — no need to approve twice)
      const uniqueIds = approverIds.filter(id => !seenApproverIds.has(id));
      if (uniqueIds.length > 0) {
        uniqueIds.forEach(id => seenApproverIds.add(id));
        resolvedSteps.push({ step, approverIds: uniqueIds, originalIndex: i });
      }
    }

    if (resolvedSteps.length === 0) return { requiresApproval: false };

    const approvals = [];
    const totalLevels = resolvedSteps.length;

    for (let lvl = 0; lvl < resolvedSteps.length; lvl++) {
      const { step, approverIds } = resolvedSteps[lvl];

      for (const approverId of approverIds) {
        const [result] = await pool.query(
          `INSERT INTO ticket_approvals (
            ticket_id, approval_rule_id, approval_level, total_levels,
            approver_id, status, require_all_at_level
          ) VALUES (?, NULL, ?, ?, ?, 'pending', ?)`,
          [
            ticketId,
            lvl + 1,
            totalLevels,
            approverId,
            step.require_all || flow.require_all_approvers ? 1 : 0,
          ]
        );

        approvals.push({
          id: result.insertId,
          level: lvl + 1,
          approver_id: approverId,
          step_name: step.name,
        });

        // Log to approval history
        await pool.query(
          `INSERT INTO approval_history (
            ticket_id, approval_id, actor_id, action, comments, new_status
          ) VALUES (?, ?, ?, 'requested', ?, 'pending')`,
          [ticketId, result.insertId, requesterId, `Template approval: ${step.name}`]
        );
      }
    }

    // Log audit event for the template approval trigger
    await pool.query(
      `INSERT INTO ticket_events (ticket_id, actor_id, event_type, payload_json)
       VALUES (?, ?, 'ticket.sent_for_approval', ?)`,
      [
        ticketId,
        requesterId,
        JSON.stringify({
          mode: "template",
          template_id: templateId,
          flow_type: flow.approval_type,
          approvers_count: approvals.length,
          steps: activeSteps.map((s) => s.name),
        }),
      ]
    );

    return {
      requiresApproval: true,
      flowType: flow.approval_type,
      totalSteps: activeSteps.length,
      approvals,
    };
  } catch (error) {
    console.error("Template approval flow error:", error);
    // Don't fail ticket creation
    await pool.query(
      "UPDATE tickets SET requires_approval = FALSE, approval_status = 'not_required' WHERE id = ?",
      [ticketId]
    );
    return { requiresApproval: false, error: error.message };
  }
}

/* ── Internal helpers for template flow ── */

function _getFieldValue(fieldKey, ctx) {
  if (["priority", "type", "channel", "team_id", "department_id"].includes(fieldKey)) {
    return ctx[fieldKey] ?? null;
  }
  return ctx.form_data?.[fieldKey] ?? null;
}

function _evalCondition(actual, operator, expected) {
  if (actual === null || actual === undefined) {
    return operator === "empty" ? true : operator === "not_empty" ? false : false;
  }
  const a = String(actual).toLowerCase();
  const e = String(expected || "").toLowerCase();
  switch (operator) {
    case "equals": return a === e;
    case "not_equals": return a !== e;
    case "contains": return a.includes(e);
    case "greater_than": return Number(actual) > Number(expected);
    case "less_than": return Number(actual) < Number(expected);
    case "in": {
      const list = Array.isArray(expected) ? expected.map(v => String(v).toLowerCase()) : e.split(",").map(v => v.trim());
      return list.includes(a);
    }
    case "not_empty": return actual !== "" && actual !== null;
    case "empty": return actual === "" || actual === null;
    default: return true;
  }
}

function _parseUserIds(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  try { return JSON.parse(val); } catch { return []; }
}

/**
 * Default approval chain when no rule matches:
 * L1 = requester's direct manager, L2 = assigned team's lead
 */
async function _buildDefaultApprovalChain(pool, ticketId, ticketData, requesterId) {
  const teamId = ticketData.team_id;

  // L1: Requester's direct manager
  const [managerRows] = await pool.query(
    "SELECT manager_id FROM user_hierarchy WHERE user_id = ? AND level = 1 AND is_active = 1",
    [requesterId]
  );
  const managerId = managerRows.length > 0 ? managerRows[0].manager_id : null;
  if (!managerId) return null; // No manager → no default approval

  // L2: Team lead (if team assigned and lead is different from manager)
  let teamLeadId = null;
  if (teamId) {
    const [leadRows] = await pool.query(
      `SELECT tm.user_id FROM team_members tm
       INNER JOIN users u ON u.id = tm.user_id
       WHERE tm.team_id = ? AND tm.is_lead = 1 AND u.is_active = 1 LIMIT 1`,
      [teamId]
    );
    if (leadRows.length > 0 && leadRows[0].user_id !== managerId) {
      teamLeadId = leadRows[0].user_id;
    }
  }

  const totalLevels = teamLeadId ? 2 : 1;
  const approvals = [];

  // Mark ticket as requiring approval
  await pool.query(
    `UPDATE tickets SET requires_approval = TRUE, approval_status = 'pending' WHERE id = ?`,
    [ticketId]
  );

  // Create L1 approval (requester's manager)
  const [r1] = await pool.query(
    `INSERT INTO ticket_approvals (
      ticket_id, approval_rule_id, approval_level, total_levels,
      approver_id, status, require_all_at_level
    ) VALUES (?, NULL, 1, ?, ?, 'pending', 0)`,
    [ticketId, totalLevels, managerId]
  );
  approvals.push({ id: r1.insertId, level: 1, approver_id: managerId });

  // Create L2 approval (team lead) if different from L1
  if (teamLeadId) {
    const [r2] = await pool.query(
      `INSERT INTO ticket_approvals (
        ticket_id, approval_rule_id, approval_level, total_levels,
        approver_id, status, require_all_at_level
      ) VALUES (?, NULL, 2, ?, ?, 'pending', 0)`,
      [ticketId, totalLevels, teamLeadId]
    );
    approvals.push({ id: r2.insertId, level: 2, approver_id: teamLeadId });
  }

  // Log audit event
  await pool.query(
    `INSERT INTO ticket_events (ticket_id, actor_id, event_type, payload_json)
     VALUES (?, ?, 'ticket.sent_for_approval', ?)`,
    [
      ticketId,
      requesterId,
      JSON.stringify({
        mode: "automatic",
        rule_name: "Default Approval (Manager → Team Lead)",
        approvers_count: approvals.length,
      }),
    ]
  );

  return {
    requiresApproval: true,
    approvalRule: "Default Approval (Manager → Team Lead)",
    approvalLevels: totalLevels,
    approvers: approvals.map((a) => a.approver_id),
  };
}

async function _resolveApprover(pool, step, ctx) {
  switch (step.approver_type) {
    case "specific_user": {
      const userIds = _parseUserIds(step.approver_user_ids);
      if (userIds.length === 0) return [];
      const [users] = await pool.query(
        `SELECT id FROM users WHERE id IN (${userIds.map(() => "?").join(",")}) AND is_active = 1`,
        userIds
      );
      return users.map(u => u.id);
    }
    case "manager_chain": {
      const level = step.manager_level || 1;
      const [h] = await pool.query(
        "SELECT manager_id FROM user_hierarchy WHERE user_id = ? AND level = ? AND is_active = 1",
        [ctx.requester_id, level]
      );
      return h.length > 0 ? [h[0].manager_id] : [];
    }
    case "team_lead": {
      if (!ctx.team_id) return [];
      const [leads] = await pool.query(
        `SELECT tm.user_id FROM team_members tm
         INNER JOIN users u ON u.id = tm.user_id
         WHERE tm.team_id = ? AND tm.is_lead = 1 AND u.is_active = 1 LIMIT 1`,
        [ctx.team_id]
      );
      if (leads.length > 0) return [leads[0].user_id];
      // Fallback to approver_user_ids if no team lead found
      const fallbackIds = _parseUserIds(step.approver_user_ids);
      if (fallbackIds.length > 0) {
        const [users] = await pool.query(
          `SELECT id FROM users WHERE id IN (${fallbackIds.map(() => "?").join(",")}) AND is_active = 1`,
          fallbackIds
        );
        return users.map(u => u.id);
      }
      return [];
    }
    case "department_head": {
      const [depts] = await pool.query(
        `SELECT d.head_user_id FROM users req
         INNER JOIN departments d ON d.id = req.department_id
         WHERE req.id = ? AND d.head_user_id IS NOT NULL`,
        [ctx.requester_id]
      );
      return depts.length > 0 ? [depts[0].head_user_id] : [];
    }
    case "role": {
      if (!step.approver_role) return [];
      const [users] = await pool.query(
        `SELECT u.id FROM users u
         INNER JOIN user_roles ur ON ur.user_id = u.id
         INNER JOIN roles r ON r.id = ur.role_id
         WHERE r.name = ? AND u.is_active = 1 ORDER BY u.id LIMIT 10`,
        [step.approver_role]
      );
      return users.map(u => u.id);
    }
    case "dynamic_field": {
      if (!step.dynamic_field_id) return [];
      const userId = ctx.form_data?.[step.dynamic_field_id];
      if (!userId) return [];
      const [u] = await pool.query("SELECT id FROM users WHERE id = ? AND is_active = 1", [userId]);
      return u.length > 0 ? [u[0].id] : [];
    }
    default: return [];
  }
}

/**
 * Check auto-approval timeout for pending approvals
 * Call this periodically (e.g., from a cron job)
 */
export async function processAutoApprovals(pool) {
  // Find approvals that have exceeded auto-approve timeout
  const [expiredApprovals] = await pool.query(
    `SELECT ta.*, ar.auto_approve_after_hours
     FROM ticket_approvals ta
     INNER JOIN approval_rules ar ON ar.id = ta.approval_rule_id
     WHERE ta.status = 'pending'
     AND ar.auto_approve_after_hours IS NOT NULL
     AND TIMESTAMPDIFF(HOUR, ta.created_at, NOW()) >= ar.auto_approve_after_hours`
  );

  for (const approval of expiredApprovals) {
    // Auto-approve
    await pool.query(
      `UPDATE ticket_approvals
       SET status = 'auto_approved', approved_at = NOW(),
           approver_comments = 'Auto-approved due to timeout'
       WHERE id = ?`,
      [approval.id]
    );

    // Log to history
    await pool.query(
      `INSERT INTO approval_history (
        ticket_id, approval_id, actor_id, action, comments, previous_status, new_status
      ) VALUES (?, ?, ?, 'auto_approved', ?, 'pending', 'auto_approved')`,
      [
        approval.ticket_id,
        approval.id,
        approval.approver_id,
        `Auto-approved after ${approval.auto_approve_after_hours} hours`,
      ]
    );

    // Check if this completes the ticket approval
    const [pending] = await pool.query(
      `SELECT COUNT(*) as count FROM ticket_approvals
       WHERE ticket_id = ? AND status = 'pending'`,
      [approval.ticket_id]
    );

    if (pending[0].count === 0) {
      // All approvals complete
      await pool.query(
        `UPDATE tickets SET approval_status = 'approved' WHERE id = ?`,
        [approval.ticket_id]
      );
    }
  }

  return expiredApprovals.length;
}
