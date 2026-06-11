// src/services/slaService.js
// Complete SLA Service with breach detection, business hours, and pause/resume

/**
 * SLA Service handles:
 * - Automatic breach detection and marking
 * - Business hours calculations
 * - SLA pause/resume for on-hold tickets
 * - SLA notifications
 * - SLA history tracking
 */

export function makeSlaService(pool) {
  return {
    /**
     * Check and mark breached SLAs
     * This should be called periodically (every 1-5 minutes)
     */
    async checkAndMarkBreaches() {
      const now = new Date();
      const results = { responseBreaches: 0, resolveBreaches: 0 };

      try {
        // Mark response SLA breaches (where not already met, not paused, and past due)
        const [responseResult] = await pool.query(
          `UPDATE ticket_slas ts
           INNER JOIN tickets t ON t.id = ts.ticket_id
           INNER JOIN ticket_statuses s ON s.id = t.status_id
           SET ts.response_breached = 1, ts.updated_at = NOW()
           WHERE ts.response_breached = 0
             AND ts.response_met_at IS NULL
             AND ts.response_due_at IS NOT NULL
             AND ts.response_due_at < NOW()
             AND ts.paused_at IS NULL
             AND s.is_closed = 0`
        );
        results.responseBreaches = responseResult.affectedRows;

        // Mark resolve SLA breaches (where not already met, not paused, and past due)
        const [resolveResult] = await pool.query(
          `UPDATE ticket_slas ts
           INNER JOIN tickets t ON t.id = ts.ticket_id
           INNER JOIN ticket_statuses s ON s.id = t.status_id
           SET ts.resolve_breached = 1, ts.updated_at = NOW()
           WHERE ts.resolve_breached = 0
             AND ts.resolve_met_at IS NULL
             AND ts.resolve_due_at IS NOT NULL
             AND ts.resolve_due_at < NOW()
             AND ts.paused_at IS NULL
             AND s.is_closed = 0`
        );
        results.resolveBreaches = resolveResult.affectedRows;

        if (results.responseBreaches > 0 || results.resolveBreaches > 0) {
          console.log(`[SLA Service] Marked breaches - Response: ${results.responseBreaches}, Resolve: ${results.resolveBreaches}`);
        }

        return results;
      } catch (error) {
        console.error("[SLA Service] Error checking breaches:", error);
        throw error;
      }
    },

    /**
     * Get tickets that are at risk of breaching SLA
     */
    async getAtRiskTickets(responseThresholdMinutes = 60, resolveThresholdMinutes = 240) {
      try {
        const [rows] = await pool.query(
          `SELECT ts.*, t.ticket_number, t.subject, t.assignee_id,
                  sp.name as policy_name,
                  u.full_name as assignee_name, u.email as assignee_email,
                  TIMESTAMPDIFF(MINUTE, NOW(), ts.response_due_at) as response_minutes_remaining,
                  TIMESTAMPDIFF(MINUTE, NOW(), ts.resolve_due_at) as resolve_minutes_remaining
           FROM ticket_slas ts
           JOIN tickets t ON ts.ticket_id = t.id
           JOIN sla_policies sp ON ts.policy_id = sp.id
           JOIN ticket_statuses s ON t.status_id = s.id
           LEFT JOIN users u ON t.assignee_id = u.id
           WHERE s.is_closed = 0
             AND ts.paused_at IS NULL
             AND (
               (ts.response_met_at IS NULL AND ts.response_breached = 0
                AND ts.response_due_at IS NOT NULL
                AND ts.response_due_at <= DATE_ADD(NOW(), INTERVAL ? MINUTE))
               OR
               (ts.resolve_met_at IS NULL AND ts.resolve_breached = 0
                AND ts.resolve_due_at IS NOT NULL
                AND ts.resolve_due_at <= DATE_ADD(NOW(), INTERVAL ? MINUTE))
             )
           ORDER BY
             LEAST(
               COALESCE(ts.response_due_at, '9999-12-31'),
               COALESCE(ts.resolve_due_at, '9999-12-31')
             ) ASC`,
          [responseThresholdMinutes, resolveThresholdMinutes]
        );
        return rows;
      } catch (error) {
        console.error("[SLA Service] Error getting at-risk tickets:", error);
        throw error;
      }
    },

    /**
     * Pause SLA timer for a ticket (when going on-hold)
     */
    async pauseSla(ticketId) {
      try {
        // Get current SLA state
        const [slas] = await pool.query(
          `SELECT * FROM ticket_slas WHERE ticket_id = ?`,
          [ticketId]
        );

        if (slas.length === 0) return null;

        const sla = slas[0];
        const now = new Date();

        // Calculate remaining time for both SLAs
        const responseRemaining = sla.response_due_at && !sla.response_met_at
          ? Math.max(0, new Date(sla.response_due_at) - now)
          : null;
        const resolveRemaining = sla.resolve_due_at && !sla.resolve_met_at
          ? Math.max(0, new Date(sla.resolve_due_at) - now)
          : null;

        // Store pause state in a JSON field or separate table
        // For simplicity, we'll store remaining milliseconds in the SLA record
        await pool.query(
          `UPDATE ticket_slas
           SET paused_at = NOW(),
               response_remaining_ms = ?,
               resolve_remaining_ms = ?,
               updated_at = NOW()
           WHERE ticket_id = ?`,
          [responseRemaining, resolveRemaining, ticketId]
        );

        // Log the pause event
        await pool.query(
          `INSERT INTO ticket_events (ticket_id, event_type, payload_json)
           VALUES (?, 'sla.paused', ?)`,
          [ticketId, JSON.stringify({
            response_remaining_ms: responseRemaining,
            resolve_remaining_ms: resolveRemaining
          })]
        );

        return { responseRemaining, resolveRemaining };
      } catch (error) {
        console.error("[SLA Service] Error pausing SLA:", error);
        throw error;
      }
    },

    /**
     * Resume SLA timer for a ticket (when leaving on-hold)
     */
    async resumeSla(ticketId) {
      try {
        const [slas] = await pool.query(
          `SELECT * FROM ticket_slas WHERE ticket_id = ?`,
          [ticketId]
        );

        if (slas.length === 0) return null;

        const sla = slas[0];
        if (!sla.paused_at) return sla; // Not paused

        const now = new Date();

        // Check if the SLA policy uses business hours
        let useBusinessHours = false;
        let businessHoursId = null;
        if (sla.policy_id) {
          const [policyRows] = await pool.query(
            "SELECT use_business_hours, business_hours_id FROM sla_policies WHERE id = ?",
            [sla.policy_id]
          );
          if (policyRows.length > 0) {
            useBusinessHours = !!policyRows[0].use_business_hours;
            businessHoursId = policyRows[0].business_hours_id;
          }
        }

        // Calculate new due dates based on remaining time
        let newResponseDue = sla.response_due_at;
        let newResolveDue = sla.resolve_due_at;

        if (sla.response_remaining_ms && !sla.response_met_at) {
          if (useBusinessHours && businessHoursId) {
            newResponseDue = await this.calculateDueDateWithBusinessHours(
              now, Math.ceil(sla.response_remaining_ms / 60000), businessHoursId
            );
          } else {
            newResponseDue = new Date(now.getTime() + sla.response_remaining_ms);
          }
        }
        if (sla.resolve_remaining_ms && !sla.resolve_met_at) {
          if (useBusinessHours && businessHoursId) {
            newResolveDue = await this.calculateDueDateWithBusinessHours(
              now, Math.ceil(sla.resolve_remaining_ms / 60000), businessHoursId
            );
          } else {
            newResolveDue = new Date(now.getTime() + sla.resolve_remaining_ms);
          }
        }

        await pool.query(
          `UPDATE ticket_slas
           SET paused_at = NULL,
               response_remaining_ms = NULL,
               resolve_remaining_ms = NULL,
               response_due_at = ?,
               resolve_due_at = ?,
               updated_at = NOW()
           WHERE ticket_id = ?`,
          [newResponseDue, newResolveDue, ticketId]
        );

        // Log the resume event
        await pool.query(
          `INSERT INTO ticket_events (ticket_id, event_type, payload_json)
           VALUES (?, 'sla.resumed', ?)`,
          [ticketId, JSON.stringify({
            new_response_due: newResponseDue,
            new_resolve_due: newResolveDue
          })]
        );

        return { response_due_at: newResponseDue, resolve_due_at: newResolveDue };
      } catch (error) {
        console.error("[SLA Service] Error resuming SLA:", error);
        throw error;
      }
    },

    /**
     * Calculate SLA due date with business hours
     */
    async calculateDueDateWithBusinessHours(startTime, minutes, businessHoursId = null) {
      try {
        // Get business hours schedule
        let scheduleQuery = `
          SELECT bhs.*, bh.timezone
          FROM business_hours bh
          JOIN business_hours_schedules bhs ON bh.id = bhs.business_hours_id
          WHERE `;

        if (businessHoursId) {
          scheduleQuery += `bh.id = ?`;
        } else {
          scheduleQuery += `bh.is_default = 1`;
        }
        scheduleQuery += ` ORDER BY bhs.day_of_week, bhs.start_time`;

        const [schedules] = await pool.query(scheduleQuery, businessHoursId ? [businessHoursId] : []);

        if (schedules.length === 0) {
          // No business hours configured, use calendar time
          return new Date(startTime.getTime() + minutes * 60000);
        }

        const tz = schedules[0]?.timezone || "Pacific/Fiji";

        // Build schedule map: dayOfWeek (0-6) -> [{sh, sm, eh, em}]
        const scheduleMap = {};
        for (const s of schedules) {
          const dow = s.day_of_week % 7;
          if (!scheduleMap[dow]) scheduleMap[dow] = [];
          const [sh, sm] = s.start_time.split(":").map(Number);
          const [eh, em] = s.end_time.split(":").map(Number);
          scheduleMap[dow].push({ sh, sm, eh, em });
        }

        // Helper: get local hour/minute/weekday in business timezone
        function getLocalParts(date) {
          const parts = new Intl.DateTimeFormat("en-US", {
            timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false, weekday: "short"
          }).formatToParts(date);
          const get = (type) => parts.find(p => p.type === type)?.value;
          const weekdayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
          return {
            dow: weekdayMap[get("weekday")] ?? date.getDay(),
            hour: parseInt(get("hour")),
            minute: parseInt(get("minute")),
          };
        }

        let remaining = minutes;
        let cursor = new Date(startTime);
        cursor.setSeconds(0, 0); // Zero out seconds for exact minute calculations
        let maxIter = 400;

        while (remaining > 0 && maxIter-- > 0) {
          const local = getLocalParts(cursor);
          const slots = scheduleMap[local.dow];

          if (slots && slots.length > 0) {
            for (const slot of slots) {
              const curMin = local.hour * 60 + local.minute;
              const startMin = slot.sh * 60 + slot.sm;
              const endMin = slot.eh * 60 + slot.em;

              if (curMin < startMin) {
                cursor = new Date(cursor.getTime() + (startMin - curMin) * 60000);
                const available = endMin - startMin;
                if (available >= remaining) {
                  return new Date(cursor.getTime() + remaining * 60000);
                }
                remaining -= available;
                cursor = new Date(cursor.getTime() + available * 60000);
              } else if (curMin >= startMin && curMin < endMin) {
                const available = endMin - curMin;
                if (available >= remaining) {
                  return new Date(cursor.getTime() + remaining * 60000);
                }
                remaining -= available;
                cursor = new Date(cursor.getTime() + available * 60000);
              }
            }
          }

          // Advance to next day
          cursor = new Date(cursor.getTime() + 24 * 60 * 60000);
          const nextLocal = getLocalParts(cursor);
          const minsIntoDay = nextLocal.hour * 60 + nextLocal.minute;
          cursor = new Date(cursor.getTime() - minsIntoDay * 60000);
        }

        // Fallback
        return new Date(startTime.getTime() + minutes * 60000);
      } catch (error) {
        console.error("[SLA Service] Error calculating business hours due date:", error);
        // Fallback to calendar time
        return new Date(startTime.getTime() + minutes * 60000);
      }
    },

    /**
     * Assign SLA to a ticket with optional business hours
     */
    async assignSlaWithBusinessHours(ticketId, priorityId, teamId, useBusinessHours = false, businessHoursId = null) {
      try {
        // Find matching SLA policy
        const [policies] = await pool.query(
          `SELECT id, response_minutes, resolve_minutes FROM sla_policies
           WHERE (applies_to_priority_id = ? AND applies_to_team_id = ?)
              OR (applies_to_priority_id = ? AND applies_to_team_id IS NULL)
              OR (applies_to_priority_id IS NULL AND applies_to_team_id = ?)
              OR (is_default = 1)
           ORDER BY
             CASE WHEN applies_to_priority_id = ? AND applies_to_team_id = ? THEN 1
                  WHEN applies_to_priority_id = ? AND applies_to_team_id IS NULL THEN 2
                  WHEN applies_to_priority_id IS NULL AND applies_to_team_id = ? THEN 3
                  ELSE 4 END
           LIMIT 1`,
          [priorityId, teamId, priorityId, teamId, priorityId, teamId, priorityId, teamId]
        );

        if (policies.length === 0) return null;

        const policy = policies[0];
        const now = new Date();

        let responseDue, resolveDue;

        if (useBusinessHours) {
          responseDue = await this.calculateDueDateWithBusinessHours(now, policy.response_minutes, businessHoursId);
          resolveDue = await this.calculateDueDateWithBusinessHours(now, policy.resolve_minutes, businessHoursId);
        } else {
          responseDue = new Date(now.getTime() + policy.response_minutes * 60000);
          resolveDue = new Date(now.getTime() + policy.resolve_minutes * 60000);
        }

        // Upsert ticket_slas
        await pool.query(
          `INSERT INTO ticket_slas (ticket_id, policy_id, response_due_at, resolve_due_at)
           VALUES (?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             policy_id = VALUES(policy_id),
             response_due_at = VALUES(response_due_at),
             resolve_due_at = VALUES(resolve_due_at),
             response_breached = 0,
             resolve_breached = 0,
             response_met_at = NULL,
             resolve_met_at = NULL,
             paused_at = NULL,
             response_remaining_ms = NULL,
             resolve_remaining_ms = NULL,
             updated_at = NOW()`,
          [ticketId, policy.id, responseDue, resolveDue]
        );

        // Log the SLA assignment
        await pool.query(
          `INSERT INTO ticket_events (ticket_id, event_type, payload_json)
           VALUES (?, 'sla.assigned', ?)`,
          [ticketId, JSON.stringify({
            policy_id: policy.id,
            response_due_at: responseDue,
            resolve_due_at: resolveDue,
            use_business_hours: useBusinessHours
          })]
        );

        return { policy_id: policy.id, response_due_at: responseDue, resolve_due_at: resolveDue };
      } catch (error) {
        console.error("[SLA Service] Error assigning SLA:", error);
        throw error;
      }
    },

    /**
     * Extend SLA due dates manually
     */
    async extendSla(ticketId, responseExtendMinutes = 0, resolveExtendMinutes = 0, reason = null, actorId = null) {
      try {
        const [slas] = await pool.query(
          `SELECT * FROM ticket_slas WHERE ticket_id = ?`,
          [ticketId]
        );

        if (slas.length === 0) return null;

        const sla = slas[0];

        const newResponseDue = sla.response_due_at && responseExtendMinutes > 0
          ? new Date(new Date(sla.response_due_at).getTime() + responseExtendMinutes * 60000)
          : sla.response_due_at;
        const newResolveDue = sla.resolve_due_at && resolveExtendMinutes > 0
          ? new Date(new Date(sla.resolve_due_at).getTime() + resolveExtendMinutes * 60000)
          : sla.resolve_due_at;

        await pool.query(
          `UPDATE ticket_slas
           SET response_due_at = ?,
               resolve_due_at = ?,
               updated_at = NOW()
           WHERE ticket_id = ?`,
          [newResponseDue, newResolveDue, ticketId]
        );

        // Log the extension event
        await pool.query(
          `INSERT INTO ticket_events (ticket_id, actor_id, event_type, payload_json)
           VALUES (?, ?, 'sla.extended', ?)`,
          [ticketId, actorId, JSON.stringify({
            response_extend_minutes: responseExtendMinutes,
            resolve_extend_minutes: resolveExtendMinutes,
            new_response_due: newResponseDue,
            new_resolve_due: newResolveDue,
            reason
          })]
        );

        return { response_due_at: newResponseDue, resolve_due_at: newResolveDue };
      } catch (error) {
        console.error("[SLA Service] Error extending SLA:", error);
        throw error;
      }
    },

    /**
     * Get SLA history for a ticket
     */
    async getSlaHistory(ticketId) {
      try {
        const [events] = await pool.query(
          `SELECT e.*, u.full_name as actor_name
           FROM ticket_events e
           LEFT JOIN users u ON e.actor_id = u.id
           WHERE e.ticket_id = ?
             AND e.event_type LIKE 'sla.%'
           ORDER BY e.created_at ASC`,
          [ticketId]
        );

        return events.map(e => {
          let payload = e.payload_json || null;
          if (typeof payload === "string") {
            try { payload = JSON.parse(payload); } catch { /* keep as string */ }
          }
          return { ...e, payload };
        });
      } catch (error) {
        console.error("[SLA Service] Error getting SLA history:", error);
        throw error;
      }
    },

    /**
     * Get SLA summary statistics
     */
    async getSlaStats(dateFrom = null, dateTo = null) {
      try {
        let whereClause = '';
        const params = [];

        if (dateFrom) {
          whereClause += ' AND ts.created_at >= ?';
          params.push(dateFrom);
        }
        if (dateTo) {
          whereClause += ' AND ts.created_at <= ?';
          params.push(dateTo);
        }

        const [stats] = await pool.query(
          `SELECT
             COUNT(*) as total_tickets,
             SUM(CASE WHEN response_met_at IS NOT NULL THEN 1 ELSE 0 END) as response_met,
             SUM(CASE WHEN response_breached = 1 THEN 1 ELSE 0 END) as response_breached,
             SUM(CASE WHEN response_met_at IS NULL AND response_breached = 0 AND response_due_at > NOW() THEN 1 ELSE 0 END) as response_pending,
             SUM(CASE WHEN resolve_met_at IS NOT NULL THEN 1 ELSE 0 END) as resolve_met,
             SUM(CASE WHEN resolve_breached = 1 THEN 1 ELSE 0 END) as resolve_breached,
             SUM(CASE WHEN resolve_met_at IS NULL AND resolve_breached = 0 AND resolve_due_at > NOW() THEN 1 ELSE 0 END) as resolve_pending,
             AVG(CASE WHEN response_met_at IS NOT NULL
               THEN TIMESTAMPDIFF(MINUTE, ts.created_at, response_met_at)
               ELSE NULL END) as avg_response_time_minutes,
             AVG(CASE WHEN resolve_met_at IS NOT NULL
               THEN TIMESTAMPDIFF(MINUTE, ts.created_at, resolve_met_at)
               ELSE NULL END) as avg_resolve_time_minutes
           FROM ticket_slas ts
           WHERE 1=1 ${whereClause}`,
          params
        );

        const result = stats[0];

        // Calculate compliance percentages
        const respondedCount = (result.response_met || 0) + (result.response_breached || 0);
        const resolvedCount = (result.resolve_met || 0) + (result.resolve_breached || 0);

        return {
          ...result,
          response_compliance_pct: respondedCount > 0
            ? Math.round((result.response_met / respondedCount) * 100)
            : 100,
          resolve_compliance_pct: resolvedCount > 0
            ? Math.round((result.resolve_met / resolvedCount) * 100)
            : 100
        };
      } catch (error) {
        console.error("[SLA Service] Error getting SLA stats:", error);
        throw error;
      }
    },

    /**
     * Get SLA stats grouped by policy
     */
    async getSlaStatsByPolicy(dateFrom = null, dateTo = null) {
      try {
        let whereClause = '';
        const params = [];

        if (dateFrom) {
          whereClause += ' AND ts.created_at >= ?';
          params.push(dateFrom);
        }
        if (dateTo) {
          whereClause += ' AND ts.created_at <= ?';
          params.push(dateTo);
        }

        const [stats] = await pool.query(
          `SELECT
             sp.id as policy_id,
             sp.name as policy_name,
             COUNT(*) as total_tickets,
             SUM(CASE WHEN ts.response_met_at IS NOT NULL THEN 1 ELSE 0 END) as response_met,
             SUM(CASE WHEN ts.response_breached = 1 THEN 1 ELSE 0 END) as response_breached,
             SUM(CASE WHEN ts.resolve_met_at IS NOT NULL THEN 1 ELSE 0 END) as resolve_met,
             SUM(CASE WHEN ts.resolve_breached = 1 THEN 1 ELSE 0 END) as resolve_breached
           FROM ticket_slas ts
           JOIN sla_policies sp ON ts.policy_id = sp.id
           WHERE 1=1 ${whereClause}
           GROUP BY sp.id, sp.name
           ORDER BY sp.name`,
          params
        );

        return stats.map(s => {
          const respondedCount = (s.response_met || 0) + (s.response_breached || 0);
          const resolvedCount = (s.resolve_met || 0) + (s.resolve_breached || 0);

          return {
            ...s,
            response_compliance_pct: respondedCount > 0
              ? Math.round((s.response_met / respondedCount) * 100)
              : 100,
            resolve_compliance_pct: resolvedCount > 0
              ? Math.round((s.resolve_met / resolvedCount) * 100)
              : 100
          };
        });
      } catch (error) {
        console.error("[SLA Service] Error getting SLA stats by policy:", error);
        throw error;
      }
    },

    /**
     * Create notifications for SLA events
     */
    async createSlaNotification(ticketId, type, data = {}) {
      try {
        // Get ticket details
        const [tickets] = await pool.query(
          `SELECT t.*, u.full_name as assignee_name, u.id as assignee_user_id
           FROM tickets t
           LEFT JOIN users u ON t.assignee_id = u.id
           WHERE t.id = ?`,
          [ticketId]
        );

        if (tickets.length === 0) return;

        const ticket = tickets[0];

        let title, message, notificationType;

        switch (type) {
          case 'response_at_risk':
            title = `SLA Response At Risk: ${ticket.ticket_number}`;
            message = `The response SLA for "${ticket.subject}" is at risk. ${data.minutesRemaining} minutes remaining.`;
            notificationType = 'warning';
            break;
          case 'resolve_at_risk':
            title = `SLA Resolution At Risk: ${ticket.ticket_number}`;
            message = `The resolution SLA for "${ticket.subject}" is at risk. ${data.minutesRemaining} minutes remaining.`;
            notificationType = 'warning';
            break;
          case 'response_breached':
            title = `SLA Response Breached: ${ticket.ticket_number}`;
            message = `The response SLA for "${ticket.subject}" has been breached.`;
            notificationType = 'error';
            break;
          case 'resolve_breached':
            title = `SLA Resolution Breached: ${ticket.ticket_number}`;
            message = `The resolution SLA for "${ticket.subject}" has been breached.`;
            notificationType = 'error';
            break;
          default:
            return;
        }

        // Notify assignee if exists
        if (ticket.assignee_user_id) {
          await pool.query(
            `INSERT INTO notifications (user_id, ticket_id, title, message, type)
             VALUES (?, ?, ?, ?, ?)`,
            [ticket.assignee_user_id, ticketId, title, message, notificationType]
          );
        }

        // Also notify admins
        const [admins] = await pool.query(
          `SELECT u.id FROM users u
           JOIN user_roles ur ON u.id = ur.user_id
           JOIN roles r ON ur.role_id = r.id
           WHERE r.name = 'admin' AND u.is_active = 1
             AND u.id != ?`,
          [ticket.assignee_user_id || 0]
        );

        for (const admin of admins) {
          await pool.query(
            `INSERT INTO notifications (user_id, ticket_id, title, message, type)
             VALUES (?, ?, ?, ?, ?)`,
            [admin.id, ticketId, title, message, notificationType]
          );
        }

        return true;
      } catch (error) {
        console.error("[SLA Service] Error creating notification:", error);
        // Don't throw - notifications shouldn't break the flow
        return false;
      }
    }
  };
}
