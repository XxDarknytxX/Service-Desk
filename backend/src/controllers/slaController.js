// src/controllers/slaController.js
import { makeSlaService } from "../services/slaService.js";
import { makeApprovalSlaService } from "../services/approvalSlaService.js";

export function makeSlaController(pool) {
  const slaService = makeSlaService(pool);
  const approvalSlaService = makeApprovalSlaService(pool);

  return {
    async getPolicies(req, res) {
      try {
        const { type } = req.query;
        let typeFilter = "";
        const params = [];
        if (type === "team" || type === "approval") {
          typeFilter = "WHERE sp.policy_type = ?";
          params.push(type);
        }

        const [rows] = await pool.query(
          `SELECT sp.*,
                  tp.label as priority_label,
                  t.name as team_name,
                  bh.name as business_hours_name
           FROM sla_policies sp
           LEFT JOIN ticket_priorities tp ON sp.applies_to_priority_id = tp.id
           LEFT JOIN teams t ON sp.applies_to_team_id = t.id
           LEFT JOIN business_hours bh ON sp.business_hours_id = bh.id
           ${typeFilter}
           ORDER BY sp.policy_type, sp.is_default DESC, sp.name`,
          params
        );

        // For approval policies, attach their stage configurations
        for (const policy of rows) {
          if (policy.policy_type === "approval") {
            const [stages] = await pool.query(
              `SELECT asp.*,
                      ar.name as approval_rule_name
               FROM approval_sla_policies asp
               LEFT JOIN approval_rules ar ON asp.applies_to_approval_rule_id = ar.id
               WHERE asp.sla_policy_id = ?
               ORDER BY asp.sort_order ASC`,
              [policy.id]
            );
            policy.approval_stages = stages;
          }
        }

        res.json(rows);
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to fetch SLA policies" });
      }
    },

    async getPolicy(req, res) {
      try {
        const { id } = req.params;
        const [rows] = await pool.query(
          `SELECT sp.*,
                  tp.label as priority_label,
                  t.name as team_name
           FROM sla_policies sp
           LEFT JOIN ticket_priorities tp ON sp.applies_to_priority_id = tp.id
           LEFT JOIN teams t ON sp.applies_to_team_id = t.id
           WHERE sp.id = ?`,
          [id]
        );
        if (rows.length === 0) {
          return res.status(404).json({ error: "Policy not found" });
        }
        const policy = rows[0];

        // Load approval stages if applicable
        if (policy.policy_type === "approval") {
          const [stages] = await pool.query(
            `SELECT asp.*, ar.name as approval_rule_name
             FROM approval_sla_policies asp
             LEFT JOIN approval_rules ar ON asp.applies_to_approval_rule_id = ar.id
             WHERE asp.sla_policy_id = ?
             ORDER BY asp.sort_order ASC`,
            [policy.id]
          );
          policy.approval_stages = stages;
        }

        res.json(policy);
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to fetch policy" });
      }
    },

    async createPolicy(req, res) {
      try {
        const {
          name,
          description,
          policy_type,
          response_minutes,
          resolve_minutes,
          applies_to_priority_id,
          applies_to_team_id,
          is_default,
          business_hours_id,
          use_business_hours,
          escalation_minutes,
          notify_at_risk_minutes,
          approval_stages,
          approval_sla_mode,
        } = req.body;

        const pType = policy_type === "approval" ? "approval" : "team";
        const aslMode = pType === "approval" ? (approval_sla_mode === "hierarchy" ? "hierarchy" : "stage") : null;

        // If setting as default, unset other defaults of same type
        if (is_default) {
          await pool.query(`UPDATE sla_policies SET is_default = 0 WHERE policy_type = ?`, [pType]);
        }

        const [result] = await pool.query(
          `INSERT INTO sla_policies (
            policy_type, approval_sla_mode, name, description, response_minutes, resolve_minutes,
            applies_to_priority_id, applies_to_team_id, is_default,
            business_hours_id, use_business_hours, escalation_minutes, notify_at_risk_minutes
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            pType,
            aslMode,
            name,
            description,
            response_minutes || 0,
            resolve_minutes || 0,
            applies_to_priority_id || null,
            applies_to_team_id || null,
            is_default || 0,
            business_hours_id || null,
            use_business_hours || 0,
            escalation_minutes || null,
            notify_at_risk_minutes || 60,
          ]
        );

        const policyId = result.insertId;

        // Save approval stages if this is an approval policy
        if (pType === "approval" && Array.isArray(approval_stages) && approval_stages.length > 0) {
          for (let i = 0; i < approval_stages.length; i++) {
            const stage = approval_stages[i];
            await pool.query(
              `INSERT INTO approval_sla_policies (
                sla_policy_id, mode, applies_to_approval_level, applies_to_approver_type,
                applies_to_approval_rule_id, applies_to_org_level, applies_to_org_level_and_below,
                target_minutes, warning_minutes,
                escalation_action, escalation_to_user_id, sort_order, is_active
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                policyId,
                aslMode || "stage",
                stage.applies_to_approval_level || null,
                stage.applies_to_approver_type || null,
                stage.applies_to_approval_rule_id || null,
                stage.applies_to_org_level || null,
                stage.applies_to_org_level_and_below ? 1 : 0,
                stage.target_minutes || 60,
                stage.warning_minutes || 30,
                stage.escalation_action || "notify_only",
                stage.escalation_to_user_id || null,
                stage.sort_order ?? i,
                stage.is_active !== false ? 1 : 0,
              ]
            );
          }
        }

        res.status(201).json({ id: policyId });
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to create policy" });
      }
    },

    async updatePolicy(req, res) {
      try {
        const { id } = req.params;
        const {
          name,
          description,
          policy_type,
          response_minutes,
          resolve_minutes,
          applies_to_priority_id,
          applies_to_team_id,
          is_default,
          business_hours_id,
          use_business_hours,
          escalation_minutes,
          notify_at_risk_minutes,
          approval_stages,
          approval_sla_mode,
        } = req.body;

        // Get current policy type
        const [current] = await pool.query(`SELECT policy_type FROM sla_policies WHERE id = ?`, [id]);
        const pType = policy_type || (current.length > 0 ? current[0].policy_type : "team");
        const aslMode = pType === "approval" ? (approval_sla_mode === "hierarchy" ? "hierarchy" : "stage") : null;

        // If setting as default, unset other defaults of same type
        if (is_default) {
          await pool.query(`UPDATE sla_policies SET is_default = 0 WHERE id != ? AND policy_type = ?`, [id, pType]);
        }

        await pool.query(
          `UPDATE sla_policies SET
            policy_type = ?, approval_sla_mode = ?, name = ?, description = ?, response_minutes = ?, resolve_minutes = ?,
            applies_to_priority_id = ?, applies_to_team_id = ?, is_default = ?,
            business_hours_id = ?, use_business_hours = ?, escalation_minutes = ?,
            notify_at_risk_minutes = ?
           WHERE id = ?`,
          [
            pType,
            aslMode,
            name,
            description,
            response_minutes || 0,
            resolve_minutes || 0,
            applies_to_priority_id || null,
            applies_to_team_id || null,
            is_default || 0,
            business_hours_id || null,
            use_business_hours || 0,
            escalation_minutes || null,
            notify_at_risk_minutes || 60,
            id,
          ]
        );

        // Replace approval stages if this is an approval policy
        if (pType === "approval" && Array.isArray(approval_stages)) {
          await pool.query(`DELETE FROM approval_sla_policies WHERE sla_policy_id = ?`, [id]);
          for (let i = 0; i < approval_stages.length; i++) {
            const stage = approval_stages[i];
            await pool.query(
              `INSERT INTO approval_sla_policies (
                sla_policy_id, mode, applies_to_approval_level, applies_to_approver_type,
                applies_to_approval_rule_id, applies_to_org_level, applies_to_org_level_and_below,
                target_minutes, warning_minutes,
                escalation_action, escalation_to_user_id, sort_order, is_active
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                id,
                aslMode || "stage",
                stage.applies_to_approval_level || null,
                stage.applies_to_approver_type || null,
                stage.applies_to_approval_rule_id || null,
                stage.applies_to_org_level || null,
                stage.applies_to_org_level_and_below ? 1 : 0,
                stage.target_minutes || 60,
                stage.warning_minutes || 30,
                stage.escalation_action || "notify_only",
                stage.escalation_to_user_id || null,
                stage.sort_order ?? i,
                stage.is_active !== false ? 1 : 0,
              ]
            );
          }
        }

        res.json({ id: Number(id) });
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to update policy" });
      }
    },

    async deletePolicy(req, res) {
      try {
        const { id } = req.params;
        await pool.query(`DELETE FROM sla_policies WHERE id = ?`, [id]);
        res.json({ success: true });
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to delete policy" });
      }
    },

    async getTicketSlas(req, res) {
      try {
        const { status, policyId, assigneeId } = req.query;
        let query = `
          SELECT ts.*, t.ticket_number, t.subject, t.status_id,
                 sp.name as policy_name,
                 tstatus.label as status_label,
                 tstatus.\`key\` as status_key,
                 u.full_name as assignee_name
          FROM ticket_slas ts
          JOIN tickets t ON ts.ticket_id = t.id
          JOIN sla_policies sp ON ts.policy_id = sp.id
          LEFT JOIN ticket_statuses tstatus ON t.status_id = tstatus.id
          LEFT JOIN users u ON t.assignee_id = u.id
          WHERE 1=1
        `;
        const params = [];

        if (status === "breached") {
          query += ` AND (ts.response_breached = 1 OR ts.resolve_breached = 1)`;
        } else if (status === "at_risk") {
          query += ` AND (
            (ts.response_due_at IS NOT NULL AND ts.response_due_at <= DATE_ADD(NOW(), INTERVAL 1 HOUR) AND ts.response_breached = 0 AND ts.response_met_at IS NULL)
            OR (ts.resolve_due_at IS NOT NULL AND ts.resolve_due_at <= DATE_ADD(NOW(), INTERVAL 4 HOUR) AND ts.resolve_breached = 0 AND ts.resolve_met_at IS NULL)
          )`;
        } else if (status === "paused") {
          query += ` AND ts.paused_at IS NOT NULL`;
        } else if (status === "active") {
          query += ` AND ts.paused_at IS NULL AND tstatus.is_closed = 0`;
        }

        if (policyId) {
          query += ` AND ts.policy_id = ?`;
          params.push(policyId);
        }

        if (assigneeId) {
          query += ` AND t.assignee_id = ?`;
          params.push(assigneeId);
        }

        query += ` ORDER BY
          CASE WHEN ts.response_breached = 1 OR ts.resolve_breached = 1 THEN 0 ELSE 1 END,
          LEAST(COALESCE(ts.response_due_at, '9999-12-31'), COALESCE(ts.resolve_due_at, '9999-12-31'))`;

        const [rows] = await pool.query(query, params);
        res.json(rows);
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to fetch ticket SLAs" });
      }
    },

    // Get SLA details for a specific ticket
    async getTicketSla(req, res) {
      try {
        const { ticketId } = req.params;
        const [rows] = await pool.query(
          `SELECT ts.*, sp.name as policy_name, sp.response_minutes, sp.resolve_minutes,
                  sp.use_business_hours, sp.escalation_minutes, sp.notify_at_risk_minutes
           FROM ticket_slas ts
           JOIN sla_policies sp ON ts.policy_id = sp.id
           WHERE ts.ticket_id = ?`,
          [ticketId]
        );

        if (rows.length === 0) {
          return res.json({ sla: null });
        }

        const sla = rows[0];
        const now = new Date();

        // Calculate remaining time and status
        const responseRemaining = sla.response_due_at
          ? new Date(sla.response_due_at) - now
          : null;
        const resolveRemaining = sla.resolve_due_at
          ? new Date(sla.resolve_due_at) - now
          : null;

        const getStatus = (met, breached, remaining) => {
          if (met) return "met";
          if (breached) return "breached";
          if (remaining !== null && remaining < 0) return "breached";
          if (remaining !== null && remaining < 3600000) return "at_risk";
          return "on_track";
        };

        res.json({
          sla: {
            ...sla,
            response_remaining_ms: responseRemaining,
            resolve_remaining_ms: resolveRemaining,
            response_status: getStatus(sla.response_met_at, sla.response_breached, responseRemaining),
            resolve_status: getStatus(sla.resolve_met_at, sla.resolve_breached, resolveRemaining),
            is_paused: !!sla.paused_at,
          }
        });
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to fetch ticket SLA" });
      }
    },

    // Pause SLA for a ticket
    async pauseTicketSla(req, res) {
      try {
        const { ticketId } = req.params;
        const result = await slaService.pauseSla(ticketId);
        if (!result) {
          return res.status(404).json({ error: "No SLA found for this ticket" });
        }
        res.json({ success: true, ...result });
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to pause SLA" });
      }
    },

    // Resume SLA for a ticket
    async resumeTicketSla(req, res) {
      try {
        const { ticketId } = req.params;
        const result = await slaService.resumeSla(ticketId);
        if (!result) {
          return res.status(404).json({ error: "No SLA found for this ticket" });
        }
        res.json({ success: true, ...result });
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to resume SLA" });
      }
    },

    // Extend SLA due dates
    async extendTicketSla(req, res) {
      try {
        const { ticketId } = req.params;
        const { response_extend_minutes, resolve_extend_minutes, reason } = req.body;
        const result = await slaService.extendSla(
          ticketId,
          response_extend_minutes || 0,
          resolve_extend_minutes || 0,
          reason,
          req.user?.id
        );
        if (!result) {
          return res.status(404).json({ error: "No SLA found for this ticket" });
        }
        res.json({ success: true, ...result });
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to extend SLA" });
      }
    },

    // Get SLA history for a ticket
    async getTicketSlaHistory(req, res) {
      try {
        const { ticketId } = req.params;
        const history = await slaService.getSlaHistory(ticketId);
        res.json({ items: history });
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to fetch SLA history" });
      }
    },

    // Get at-risk tickets
    async getAtRiskTickets(req, res) {
      try {
        const { responseThreshold, resolveThreshold } = req.query;
        const tickets = await slaService.getAtRiskTickets(
          parseInt(responseThreshold) || 60,
          parseInt(resolveThreshold) || 240
        );
        res.json({ items: tickets });
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to fetch at-risk tickets" });
      }
    },

    // Run breach check (admin only, or called by cron)
    async checkBreaches(req, res) {
      try {
        const results = await slaService.checkAndMarkBreaches();
        res.json({ success: true, ...results });
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to check breaches" });
      }
    },

    // Get SLA statistics
    async getSlaStats(req, res) {
      try {
        const { dateFrom, dateTo } = req.query;
        const stats = await slaService.getSlaStats(dateFrom, dateTo);
        res.json(stats);
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to fetch SLA stats" });
      }
    },

    // Get SLA stats by policy
    async getSlaStatsByPolicy(req, res) {
      try {
        const { dateFrom, dateTo } = req.query;
        const stats = await slaService.getSlaStatsByPolicy(dateFrom, dateTo);
        res.json({ items: stats });
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to fetch SLA stats by policy" });
      }
    },

    // Get business hours
    async getBusinessHours(req, res) {
      try {
        const [rows] = await pool.query(
          `SELECT bh.*, GROUP_CONCAT(
             CONCAT(bhs.day_of_week, ':', bhs.start_time, '-', bhs.end_time)
             ORDER BY bhs.day_of_week SEPARATOR ','
           ) as schedule
           FROM business_hours bh
           LEFT JOIN business_hours_schedules bhs ON bh.id = bhs.business_hours_id
           GROUP BY bh.id
           ORDER BY bh.is_default DESC, bh.name`
        );
        res.json(rows);
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to fetch business hours" });
      }
    },

    // Create business hours
    async createBusinessHours(req, res) {
      try {
        const { name, timezone, is_default, schedules } = req.body;

        if (is_default) {
          await pool.query(`UPDATE business_hours SET is_default = 0`);
        }

        const [result] = await pool.query(
          `INSERT INTO business_hours (name, timezone, is_default)
           VALUES (?, ?, ?)`,
          [name, timezone || "UTC", is_default || 0]
        );

        const bhId = result.insertId;

        // Insert schedules
        if (schedules && schedules.length > 0) {
          const scheduleValues = schedules.map(s =>
            [bhId, s.day_of_week, s.start_time, s.end_time]
          );
          await pool.query(
            `INSERT INTO business_hours_schedules (business_hours_id, day_of_week, start_time, end_time)
             VALUES ?`,
            [scheduleValues]
          );
        }

        res.status(201).json({ id: bhId });
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to create business hours" });
      }
    },

    // Update business hours
    async updateBusinessHours(req, res) {
      try {
        const { id } = req.params;
        const { name, timezone, is_default, schedules } = req.body;

        if (is_default) {
          await pool.query(`UPDATE business_hours SET is_default = 0 WHERE id != ?`, [id]);
        }

        await pool.query(
          `UPDATE business_hours SET name = ?, timezone = ?, is_default = ?
           WHERE id = ?`,
          [name, timezone || "UTC", is_default || 0, id]
        );

        // Replace schedules
        if (schedules) {
          await pool.query(
            `DELETE FROM business_hours_schedules WHERE business_hours_id = ?`,
            [id]
          );

          if (schedules.length > 0) {
            const scheduleValues = schedules.map(s =>
              [id, s.day_of_week, s.start_time, s.end_time]
            );
            await pool.query(
              `INSERT INTO business_hours_schedules (business_hours_id, day_of_week, start_time, end_time)
               VALUES ?`,
              [scheduleValues]
            );
          }
        }

        res.json({ id: Number(id) });
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to update business hours" });
      }
    },

    // Delete business hours
    async deleteBusinessHours(req, res) {
      try {
        const { id } = req.params;
        await pool.query(`DELETE FROM business_hours WHERE id = ?`, [id]);
        res.json({ success: true });
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to delete business hours" });
      }
    },

    // ── Approval SLA endpoints ────────────────────────────────────

    // Get approval SLA tracking for a specific ticket
    async getApprovalSlas(req, res) {
      try {
        const { ticketId } = req.params;
        const slas = await approvalSlaService.getApprovalSlasForTicket(ticketId);
        res.json(slas);
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to fetch approval SLAs" });
      }
    },

    // Get approval SLA tracking list (all tickets)
    async getApprovalSlaList(req, res) {
      try {
        const { status, limit } = req.query;
        const slas = await approvalSlaService.getApprovalSlaList({
          status,
          limit: parseInt(limit) || 50,
        });
        res.json(slas);
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to fetch approval SLA list" });
      }
    },

    // Get approval SLA stats
    async getApprovalSlaStats(req, res) {
      try {
        const { dateFrom, dateTo } = req.query;
        const stats = await approvalSlaService.getApprovalSlaStats(dateFrom, dateTo);
        res.json(stats);
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to fetch approval SLA stats" });
      }
    },

    // Check approval SLA breaches (admin or cron)
    async checkApprovalSlaBreaches(req, res) {
      try {
        const results = await approvalSlaService.checkApprovalSlaBreaches();
        res.json({ success: true, ...results });
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to check approval SLA breaches" });
      }
    },

    // Get approval rules for dropdown (used in stage config)
    async getApprovalRules(req, res) {
      try {
        const [rows] = await pool.query(
          `SELECT id, name, description, approval_levels, applies_to_team_id
           FROM approval_rules WHERE is_active = 1 ORDER BY name`
        );
        res.json(rows);
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to fetch approval rules" });
      }
    },

    // Reassign SLA for a ticket
    async reassignTicketSla(req, res) {
      try {
        const { ticketId } = req.params;
        const { use_business_hours, business_hours_id } = req.body;

        // Get ticket details
        const [tickets] = await pool.query(
          `SELECT priority_id, team_id FROM tickets WHERE id = ?`,
          [ticketId]
        );

        if (tickets.length === 0) {
          return res.status(404).json({ error: "Ticket not found" });
        }

        const ticket = tickets[0];
        const result = await slaService.assignSlaWithBusinessHours(
          ticketId,
          ticket.priority_id,
          ticket.team_id,
          use_business_hours || false,
          business_hours_id || null
        );

        if (!result) {
          return res.status(400).json({ error: "No matching SLA policy found" });
        }

        res.json({ success: true, ...result });
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to reassign SLA" });
      }
    },
  };
}
