// src/controllers/ticketController.js
import { validationResult } from "express-validator";
import { processTicketApproval, processTemplateApprovalFlow } from "../services/approvalWorkflow.js";
import { makeApprovalSlaService } from "../services/approvalSlaService.js";

const send = {
  ok: (res, data = {}) => res.json(data),
  created: (res, data = {}) => res.status(201).json(data),
  bad: (res, msg = "Bad request") => res.status(400).json({ error: msg }),
  forbidden: (res, msg = "Forbidden") => res.status(403).json({ error: msg }),
  notFound: (res, msg = "Not found") => res.status(404).json({ error: msg }),
  serverErr: (res, msg = "Internal server error") => res.status(500).json({ error: msg }),
};

function isAgent(user) {
  return (user.roles || []).includes("admin") || (user.roles || []).includes("agent");
}

// The NOC team is the triage queue — only its members (and admins) may move a
// ticket from one team to another. Everyone else flags it back to NOC instead.
async function isNocMember(pool, userId) {
  const [rows] = await pool.query(
    `SELECT 1 FROM team_members tm JOIN teams t ON t.id = tm.team_id
     WHERE t.name = 'NOC' AND tm.user_id = ? LIMIT 1`,
    [userId]
  );
  return rows.length > 0;
}

const ALLOWED_LOOKUP_TABLES = ["ticket_statuses", "ticket_priorities", "ticket_types", "ticket_channels"];

async function getLookupId(pool, table, key) {
  if (!ALLOWED_LOOKUP_TABLES.includes(table)) {
    throw new Error(`Invalid lookup table: ${table}`);
  }
  const [rows] = await pool.query(`SELECT id FROM ${table} WHERE \`key\` = ?`, [key]);
  return rows[0]?.id || null;
}

async function buildTicketNumber(ticketId) {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return `SD-${date}-${String(ticketId).padStart(5, "0")}`;
}

async function insertEvent(pool, { ticketId, actorId, type, payload }) {
  await pool.query(
    `INSERT INTO ticket_events (ticket_id, actor_id, event_type, payload_json)
     VALUES (?, ?, ?, ?)`,
    [ticketId, actorId || null, type, payload ? JSON.stringify(payload) : null]
  );
}

// Valid status transitions: from -> [allowed destinations]
const STATUS_TRANSITIONS = {
  draft:       ["open"],                                                  // submit
  open:        ["pending", "in_progress", "on_hold", "solved", "closed"], // NOC triage → route / work / resolve
  pending:     ["in_progress", "on_hold", "open", "solved", "closed"],    // queue → pickup / park / re-triage
  in_progress: ["on_hold", "pending", "open", "solved", "closed"],        // working → park / hand back / resolve
  on_hold:     ["in_progress", "pending", "open", "solved", "closed"],    // resume / re-route / resolve
  solved:      ["in_progress", "closed"],                                 // reopen → in_progress; confirm → closed
  closed:      ["in_progress"],                                           // reopen → in_progress
};

// Human-readable field labels for audit trail resolution
const FIELD_LABELS = {
  status_id: "Status",
  priority_id: "Priority",
  type_id: "Type",
  channel_id: "Channel",
  assignee_id: "Assignee",
  team_id: "Team",
  organization_id: "Organization",
  subject: "Subject",
  description: "Description",
  due_at: "Due Date",
  closed_at: "Closed Date",
  status: "Status",
};

// Status keys → human labels (auto-transition events log the raw key as "status").
const STATUS_LABELS = {
  draft: "Draft", open: "Open", pending: "Pending", in_progress: "In Progress",
  on_hold: "On Hold", solved: "Solved", closed: "Closed",
};

// Lookup table configs for batch ID resolution in audit trail
const LOOKUP_CONFIGS = {
  status_id:       { table: "ticket_statuses",   labelCol: "label" },
  priority_id:     { table: "ticket_priorities",  labelCol: "label" },
  type_id:         { table: "ticket_types",       labelCol: "label" },
  channel_id:      { table: "ticket_channels",    labelCol: "label" },
  assignee_id:     { table: "users",              labelCol: "full_name" },
  team_id:         { table: "teams",              labelCol: "name" },
  organization_id: { table: "organizations",      labelCol: "name" },
};

async function getStatusKey(pool, statusId) {
  const [rows] = await pool.query("SELECT `key` FROM ticket_statuses WHERE id = ?", [statusId]);
  return rows[0]?.key || null;
}

async function getPriorityKey(pool, priorityId) {
  const [rows] = await pool.query("SELECT `key` FROM ticket_priorities WHERE id = ?", [priorityId]);
  return rows[0]?.key || null;
}

// Auto-assign SLA when ticket is created or priority/team changes
async function assignSla(pool, ticketId, priorityId, teamId) {
  try {
    // Find matching SLA policy: prefer specific match, then priority-only, then default
    const [policies] = await pool.query(
      `SELECT id, response_minutes, resolve_minutes, use_business_hours, business_hours_id FROM sla_policies
       WHERE policy_type = 'team'
         AND ((applies_to_priority_id = ? AND applies_to_team_id = ?)
          OR (applies_to_priority_id = ? AND applies_to_team_id IS NULL)
          OR (applies_to_priority_id IS NULL AND applies_to_team_id = ?)
          OR (is_default = 1))
       ORDER BY
         CASE WHEN applies_to_priority_id = ? AND applies_to_team_id = ? THEN 1
              WHEN applies_to_priority_id = ? AND applies_to_team_id IS NULL THEN 2
              WHEN applies_to_priority_id IS NULL AND applies_to_team_id = ? THEN 3
              ELSE 4 END
       LIMIT 1`,
      [priorityId, teamId, priorityId, teamId, priorityId, teamId, priorityId, teamId]
    );

    if (policies.length === 0) return;

    const policy = policies[0];
    const now = new Date();
    let responseDue, resolveDue;

    if (policy.use_business_hours) {
      responseDue = await calculateBusinessHoursDue(pool, now, policy.response_minutes, policy.business_hours_id);
      resolveDue = await calculateBusinessHoursDue(pool, now, policy.resolve_minutes, policy.business_hours_id);
    } else {
      responseDue = new Date(now.getTime() + policy.response_minutes * 60000);
      resolveDue = new Date(now.getTime() + policy.resolve_minutes * 60000);
    }

    // Upsert ticket_slas
    await pool.query(
      `INSERT INTO ticket_slas (ticket_id, policy_id, response_due_at, resolve_due_at)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE policy_id = VALUES(policy_id),
         response_due_at = VALUES(response_due_at),
         resolve_due_at = VALUES(resolve_due_at),
         response_breached = 0, resolve_breached = 0`,
      [ticketId, policy.id, responseDue, resolveDue]
    );

    // Log an SLA line item on the Activity timeline (fires on create + every re-assign).
    await pool.query(
      `INSERT INTO ticket_events (ticket_id, event_type, payload_json) VALUES (?, 'sla.assigned', ?)`,
      [ticketId, JSON.stringify({
        policy_id: policy.id,
        response_due_at: responseDue,
        resolve_due_at: resolveDue,
        team_id: teamId,
      })]
    );
  } catch (e) {
    console.error("SLA assignment error:", e);
  }
}

// ── NOC triage SLA ────────────────────────────────────────────────────────
// A second SLA, separate from the team response/resolve SLA: how long the NOC
// queue has to route a ticket out to the correct team ("reassign on time").
// Tracked in its own table (ticket_triage_slas) so the team SLA re-point on
// (re)assign can never clobber it. Priority-based calendar minutes.
const TRIAGE_SLA_MINUTES = { 1: 120, 2: 60, 3: 30, 4: 15 }; // low / normal / high / urgent
const DEFAULT_TRIAGE_MINUTES = 60;

// Manager review SLA — the window a team manager (lead) has to act once a ticket
// is escalated to them (reassign it back to an engineer, or resolve it). Its own
// calendar minutes, priority-based. Urgent 30m / High 60m / Normal 120m / Low 240m.
const MANAGER_SLA_MINUTES = { 1: 240, 2: 120, 3: 60, 4: 30 }; // low / normal / high / urgent
const DEFAULT_MANAGER_MINUTES = 120;

async function getNocTeamId(pool) {
  const [[row]] = await pool.query(`SELECT id FROM teams WHERE name = 'NOC' LIMIT 1`);
  return row?.id || null;
}

// The team's manager is its lead (team_members.is_lead). Only the manager (or an
// admin) may freeze a ticket's SLA; regular engineers escalate to them instead.
async function getTeamLeadId(pool, teamId) {
  if (!teamId) return null;
  const [[row]] = await pool.query(
    "SELECT user_id FROM team_members WHERE team_id = ? AND is_lead = 1 LIMIT 1", [teamId]
  );
  return row?.user_id || null;
}

// Is this user a member of the given team? Used to keep "work the ticket" actions
// (resolve, escalate to manager) scoped to the team that currently owns it — once
// NOC routes a ticket out of its queue, NOC can no longer resolve it.
async function isTeamMember(pool, userId, teamId) {
  if (!teamId || !userId) return false;
  const [rows] = await pool.query(
    "SELECT 1 FROM team_members WHERE team_id = ? AND user_id = ? LIMIT 1", [teamId, userId]
  );
  return rows.length > 0;
}

// Pause the team SLA — store the remaining time so it can be resumed later.
// No-op if there's no team SLA row or it's already paused. Returns true if paused.
async function pauseTicketSla(pool, ticketId, actorId) {
  try {
    const [slas] = await pool.query(
      `SELECT response_due_at, resolve_due_at, response_met_at, resolve_met_at, paused_at
       FROM ticket_slas WHERE ticket_id = ?`, [ticketId]
    );
    if (slas.length === 0 || slas[0].paused_at) return false;
    const sla = slas[0];
    const now = new Date();
    const responseRemaining = sla.response_due_at && !sla.response_met_at
      ? Math.max(0, new Date(sla.response_due_at) - now) : null;
    const resolveRemaining = sla.resolve_due_at && !sla.resolve_met_at
      ? Math.max(0, new Date(sla.resolve_due_at) - now) : null;
    await pool.query(
      `UPDATE ticket_slas SET paused_at = NOW(), response_remaining_ms = ?, resolve_remaining_ms = ?, updated_at = NOW()
       WHERE ticket_id = ?`,
      [responseRemaining, resolveRemaining, ticketId]
    );
    await insertEvent(pool, { ticketId, actorId, type: "sla.paused", payload: { response_remaining_ms: responseRemaining, resolve_remaining_ms: resolveRemaining } });
    return true;
  } catch (e) { console.error("Pause SLA error:", e); return false; }
}

// Resume a paused (on-hold) SLA — recompute due dates from the stored remaining time.
async function resumeTicketSla(pool, ticketId, actorId) {
  try {
    const [slas] = await pool.query(
      `SELECT paused_at, response_remaining_ms, resolve_remaining_ms,
              response_met_at, resolve_met_at, response_due_at, resolve_due_at
       FROM ticket_slas WHERE ticket_id = ?`, [ticketId]
    );
    if (slas.length === 0 || !slas[0].paused_at) return false;
    const sla = slas[0];
    const now = new Date();
    const newResponseDue = sla.response_remaining_ms && !sla.response_met_at
      ? new Date(now.getTime() + Number(sla.response_remaining_ms)) : sla.response_due_at;
    const newResolveDue = sla.resolve_remaining_ms && !sla.resolve_met_at
      ? new Date(now.getTime() + Number(sla.resolve_remaining_ms)) : sla.resolve_due_at;
    await pool.query(
      `UPDATE ticket_slas SET paused_at = NULL, response_remaining_ms = NULL,
         resolve_remaining_ms = NULL, response_due_at = ?, resolve_due_at = ?, updated_at = NOW()
       WHERE ticket_id = ?`,
      [newResponseDue, newResolveDue, ticketId]
    );
    await insertEvent(pool, { ticketId, actorId, type: "sla.resumed", payload: { new_response_due: newResponseDue, new_resolve_due: newResolveDue } });
    return true;
  } catch (e) { console.error("Resume SLA error:", e); return false; }
}

// Start (or restart) the triage clock when a ticket enters the NOC queue.
async function startTriageSla(pool, ticketId, priorityId, actorId) {
  try {
    const minutes = TRIAGE_SLA_MINUTES[priorityId] || DEFAULT_TRIAGE_MINUTES;
    const dueAt = new Date(Date.now() + minutes * 60000);
    await pool.query(
      `INSERT INTO ticket_triage_slas (ticket_id, priority_id, target_minutes, due_at, started_at, met_at, breached)
       VALUES (?, ?, ?, ?, NOW(), NULL, 0)
       ON DUPLICATE KEY UPDATE priority_id = VALUES(priority_id), target_minutes = VALUES(target_minutes),
         due_at = VALUES(due_at), started_at = NOW(), met_at = NULL, breached = 0, updated_at = NOW()`,
      [ticketId, priorityId || null, minutes, dueAt]
    );
    // Starting the triage clock is automatic — attribute it to System, not the
    // person who created/routed the ticket.
    await insertEvent(pool, { ticketId, actorId: null, type: "triage_sla.assigned", payload: { target_minutes: minutes, due_at: dueAt } });
  } catch (e) {
    console.error("Triage SLA start error:", e);
  }
}

// Re-target an in-flight triage clock when NOC re-prioritises during triage —
// keeps the original started_at, just recomputes due_at from the new priority.
async function recomputeTriageSla(pool, ticketId, priorityId) {
  try {
    const minutes = TRIAGE_SLA_MINUTES[priorityId] || DEFAULT_TRIAGE_MINUTES;
    await pool.query(
      `UPDATE ticket_triage_slas
       SET target_minutes = ?, priority_id = ?, due_at = DATE_ADD(started_at, INTERVAL ? MINUTE), updated_at = NOW()
       WHERE ticket_id = ? AND met_at IS NULL`,
      [minutes, priorityId || null, minutes, ticketId]
    );
  } catch (e) { console.error("Triage SLA recompute error:", e); }
}

// Mark the triage clock met when NOC routes the ticket out of the queue.
async function meetTriageSla(pool, ticketId, actorId) {
  try {
    const [res] = await pool.query(
      `UPDATE ticket_triage_slas SET met_at = NOW(), updated_at = NOW()
       WHERE ticket_id = ? AND met_at IS NULL`,
      [ticketId]
    );
    if (res.affectedRows > 0) {
      const [[row]] = await pool.query(`SELECT due_at, breached FROM ticket_triage_slas WHERE ticket_id = ?`, [ticketId]);
      const onTime = row ? (!row.breached && new Date() <= new Date(row.due_at)) : null;
      await insertEvent(pool, { ticketId, actorId, type: "triage_sla.met", payload: { on_time: onTime } });
    }
  } catch (e) {
    console.error("Triage SLA meet error:", e);
  }
}

// Start (or restart) the manager review clock when a ticket is escalated to its
// team manager. Upserted on ticket_id so a re-escalation restarts it.
async function startManagerSla(pool, ticketId, priorityId, managerId) {
  try {
    const minutes = MANAGER_SLA_MINUTES[priorityId] || DEFAULT_MANAGER_MINUTES;
    const dueAt = new Date(Date.now() + minutes * 60000);
    await pool.query(
      `INSERT INTO ticket_manager_slas (ticket_id, manager_id, priority_id, target_minutes, due_at, started_at, met_at, breached, outcome)
       VALUES (?, ?, ?, ?, ?, NOW(), NULL, 0, 'pending')
       ON DUPLICATE KEY UPDATE manager_id = VALUES(manager_id), priority_id = VALUES(priority_id),
         target_minutes = VALUES(target_minutes), due_at = VALUES(due_at), started_at = NOW(),
         met_at = NULL, breached = 0, outcome = 'pending', updated_at = NOW()`,
      [ticketId, managerId || null, priorityId || null, minutes, dueAt]
    );
    await insertEvent(pool, { ticketId, actorId: null, type: "manager_sla.started", payload: { target_minutes: minutes, due_at: dueAt, manager_id: managerId || null } });
  } catch (e) {
    console.error("Manager SLA start error:", e);
  }
}

// Mark the manager clock met when the manager acts (reassigns back / resolves).
// outcome ∈ {reassigned_back, resolved}. No-op if there's no open manager SLA.
async function meetManagerSla(pool, ticketId, outcome, actorId) {
  try {
    const [res] = await pool.query(
      `UPDATE ticket_manager_slas SET met_at = NOW(), outcome = ?, updated_at = NOW()
       WHERE ticket_id = ? AND met_at IS NULL`,
      [outcome, ticketId]
    );
    if (res.affectedRows > 0) {
      const [[row]] = await pool.query(`SELECT due_at, breached FROM ticket_manager_slas WHERE ticket_id = ?`, [ticketId]);
      const onTime = row ? (!row.breached && new Date() <= new Date(row.due_at)) : null;
      await insertEvent(pool, { ticketId, actorId, type: "manager_sla.met", payload: { outcome, on_time: onTime } });
      return true;
    }
    return false;
  } catch (e) {
    console.error("Manager SLA meet error:", e);
    return false;
  }
}

// Is there an open (unmet) manager SLA for this ticket? (i.e. it's with the manager)
async function hasOpenManagerSla(pool, ticketId) {
  try {
    const [rows] = await pool.query(
      `SELECT 1 FROM ticket_manager_slas WHERE ticket_id = ? AND met_at IS NULL LIMIT 1`, [ticketId]
    );
    return rows.length > 0;
  } catch (_) { return false; }
}

/**
 * Calculate SLA due date respecting business hours.
 * Uses the timezone from business_hours table to convert correctly.
 */
async function calculateBusinessHoursDue(pool, startTime, minutes, businessHoursId) {
  try {
    let query = `SELECT bhs.day_of_week, bhs.start_time, bhs.end_time, bh.timezone
      FROM business_hours bh
      JOIN business_hours_schedules bhs ON bh.id = bhs.business_hours_id
      WHERE `;
    query += businessHoursId ? `bh.id = ?` : `bh.is_default = 1`;
    query += ` ORDER BY bhs.day_of_week, bhs.start_time`;

    const [schedules] = await pool.query(query, businessHoursId ? [businessHoursId] : []);
    if (schedules.length === 0) {
      return new Date(startTime.getTime() + minutes * 60000);
    }

    const tz = schedules[0].timezone || "Pacific/Fiji";

    // Build schedule map: dayOfWeek (0=Sun..6=Sat) -> [{startH, startM, endH, endM}]
    const scheduleMap = {};
    for (const s of schedules) {
      const dow = s.day_of_week % 7; // Ensure 0-6 range
      if (!scheduleMap[dow]) scheduleMap[dow] = [];
      const [sh, sm] = s.start_time.split(":").map(Number);
      const [eh, em] = s.end_time.split(":").map(Number);
      scheduleMap[dow].push({ sh, sm, eh, em });
    }

    // Helper: get local hour/minute in the business timezone
    function getLocalParts(date) {
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", hour12: false, weekday: "short"
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
    // Zero out seconds/ms so calculations are exact to the minute
    let cursor = new Date(startTime);
    cursor.setSeconds(0, 0);
    let maxIter = 400; // safety

    while (remaining > 0 && maxIter-- > 0) {
      const local = getLocalParts(cursor);
      const slots = scheduleMap[local.dow];

      if (slots && slots.length > 0) {
        for (const slot of slots) {
          const curMin = local.hour * 60 + local.minute;
          const startMin = slot.sh * 60 + slot.sm;
          const endMin = slot.eh * 60 + slot.em;

          if (curMin < startMin) {
            // Before business hours — fast-forward to exact slot start
            cursor = new Date(cursor.getTime() + (startMin - curMin) * 60000);
            const available = endMin - startMin;
            if (available >= remaining) {
              return new Date(cursor.getTime() + remaining * 60000);
            }
            remaining -= available;
            cursor = new Date(cursor.getTime() + available * 60000);
          } else if (curMin >= startMin && curMin < endMin) {
            // Within business hours
            const available = endMin - curMin;
            if (available >= remaining) {
              return new Date(cursor.getTime() + remaining * 60000);
            }
            remaining -= available;
            cursor = new Date(cursor.getTime() + available * 60000);
          }
          // else: past this slot, try next
        }
      }

      // Advance to next day at midnight (local tz)
      // Jump forward ~24 hours, then we'll re-check
      cursor = new Date(cursor.getTime() + 24 * 60 * 60000);
      // Snap to midnight in local tz by zeroing out hours
      const nextLocal = getLocalParts(cursor);
      const minsIntoDay = nextLocal.hour * 60 + nextLocal.minute;
      cursor = new Date(cursor.getTime() - minsIntoDay * 60000);
    }

    // Fallback
    return new Date(startTime.getTime() + minutes * 60000);
  } catch (err) {
    console.error("Business hours due calc error:", err);
    return new Date(startTime.getTime() + minutes * 60000);
  }
}

/**
 * Calculate how many business-hours milliseconds remain between now and dueAt.
 * Returns actual working time remaining, not wall-clock difference.
 */
async function calcBusinessMsRemaining(pool, now, dueAt, businessHoursId) {
  if (dueAt <= now) return 0;
  try {
    let query = `SELECT bhs.day_of_week, bhs.start_time, bhs.end_time, bh.timezone
      FROM business_hours bh JOIN business_hours_schedules bhs ON bh.id = bhs.business_hours_id
      WHERE `;
    query += businessHoursId ? `bh.id = ?` : `bh.is_default = 1`;
    const [schedules] = await pool.query(query, businessHoursId ? [businessHoursId] : []);
    if (schedules.length === 0) return Math.max(0, dueAt - now);

    const tz = schedules[0].timezone || "Pacific/Fiji";
    const scheduleMap = {};
    for (const s of schedules) {
      const dow = s.day_of_week % 7;
      if (!scheduleMap[dow]) scheduleMap[dow] = [];
      const [sh, sm] = s.start_time.split(":").map(Number);
      const [eh, em] = s.end_time.split(":").map(Number);
      scheduleMap[dow].push({ sh, sm, eh, em });
    }

    function getLocalParts(date) {
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false, weekday: "short"
      }).formatToParts(date);
      const get = (type) => parts.find(p => p.type === type)?.value;
      const wm = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
      return { dow: wm[get("weekday")] ?? date.getDay(), hour: parseInt(get("hour")), minute: parseInt(get("minute")) };
    }

    let totalBizMinutes = 0;
    let cursor = new Date(now);
    cursor.setSeconds(0, 0); // Zero out seconds for exact minute calculations
    let maxIter = 400;

    while (cursor < dueAt && maxIter-- > 0) {
      const local = getLocalParts(cursor);
      const slots = scheduleMap[local.dow];
      let advanced = false;

      if (slots) {
        for (const slot of slots) {
          if (cursor >= dueAt) break;
          const curMin = local.hour * 60 + local.minute;
          const startMin = slot.sh * 60 + slot.sm;
          const endMin = slot.eh * 60 + slot.em;

          if (curMin < startMin) {
            cursor = new Date(cursor.getTime() + (startMin - curMin) * 60000);
            advanced = true;
            if (cursor >= dueAt) break;
            const effectiveEnd = new Date(cursor.getTime() + (endMin - startMin) * 60000);
            const slotEnd = effectiveEnd < dueAt ? effectiveEnd : dueAt;
            totalBizMinutes += Math.floor((slotEnd - cursor) / 60000);
            cursor = effectiveEnd;
            advanced = true;
          } else if (curMin >= startMin && curMin < endMin) {
            const effectiveEnd = new Date(cursor.getTime() + (endMin - curMin) * 60000);
            const slotEnd = effectiveEnd < dueAt ? effectiveEnd : dueAt;
            totalBizMinutes += Math.floor((slotEnd - cursor) / 60000);
            cursor = effectiveEnd;
            advanced = true;
          }
        }
      }

      if (!advanced || cursor < dueAt) {
        cursor = new Date(cursor.getTime() + 24 * 60 * 60000);
        const nl = getLocalParts(cursor);
        cursor = new Date(cursor.getTime() - (nl.hour * 60 + nl.minute) * 60000);
      }
    }

    return totalBizMinutes * 60000;
  } catch (err) {
    console.error("calcBusinessMsRemaining error:", err);
    return Math.max(0, dueAt - now);
  }
}

export function makeTicketController(pool) {
  const approvalSlaService = makeApprovalSlaService(pool);

  return {
    // GET /api/tickets
    list: async (req, res) => {
      try {
        const page = Math.max(parseInt(req.query.page || "1", 10), 1);
        const pageSize = Math.min(Math.max(parseInt(req.query.pageSize || "20", 10), 1), 100);
        const offset = (page - 1) * pageSize;

        const where = [];
        const params = [];

        if (!isAgent(req.user)) {
          where.push("t.requester_id = ?");
          params.push(req.user.id);
        }

        if (req.query.status) {
          // Support multiple statuses separated by comma
          if (req.query.status.includes(',')) {
            const statuses = req.query.status.split(',');
            where.push(`s.\`key\` IN (${statuses.map(() => '?').join(',')})`);
            params.push(...statuses);
          } else {
            where.push("s.`key` = ?");
            params.push(req.query.status);
          }
        }

        // Exclude closed/resolved tickets for active queues
        if (req.query.excludeResolved === 'true') {
          where.push("s.is_closed = 0");
        }

        // Drafts are private, unsubmitted requests. Exclude them from EVERY list by
        // default (agents must not see other users' drafts); a caller opts in only by
        // explicitly filtering status=draft (the owner's Drafts queue) or includeDrafts=true.
        const statusReq = (req.query.status || "").split(",").map((s) => s.trim());
        if (!statusReq.includes("draft") && req.query.includeDrafts !== "true") {
          where.push("s.`key` <> 'draft'");
        }

        if (req.query.priority) {
          where.push("p.`key` = ?");
          params.push(req.query.priority);
        }

        if (req.query.assignee === "unassigned") {
          where.push("t.assignee_id IS NULL");
        } else if (req.query.assignee) {
          where.push("t.assignee_id = ?");
          params.push(req.query.assignee);
        }

        if (req.query.assigneeId) {
          where.push("t.assignee_id = ?");
          params.push(req.query.assigneeId);
        }

        if (req.query.requesterId) {
          where.push("t.requester_id = ?");
          params.push(req.query.requesterId);
        }

        if (req.query.teamId) {
          where.push("t.team_id = ?");
          params.push(req.query.teamId);
        }

        if (req.query.organizationId) {
          where.push("t.organization_id = ?");
          params.push(req.query.organizationId);
        }

        if (req.query.search || req.query.q) {
          const term = req.query.search || req.query.q;
          where.push("(t.subject LIKE ? OR t.ticket_number LIKE ? OR t.description LIKE ?)");
          const like = `%${term}%`;
          params.push(like, like, like);
        }

        const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

        const [countRows] = await pool.query(
          `SELECT COUNT(*) as total
           FROM tickets t
           INNER JOIN ticket_statuses s ON s.id = t.status_id
           INNER JOIN ticket_priorities p ON p.id = t.priority_id
           ${whereSql}`,
          params
        );

        const [rows] = await pool.query(
          `SELECT t.*,
            s.label AS status_label, s.\`key\` AS status_key, s.is_closed AS status_is_closed,
            p.label AS priority_label, p.\`key\` AS priority_key, p.sort_order AS priority_sort,
            ty.label AS type_label, ty.\`key\` AS type_key,
            ch.label AS channel_label, ch.\`key\` AS channel_key,
            req.full_name AS requester_name, req.email AS requester_email,
            ass.full_name AS assignee_name, ass.email AS assignee_email,
            org.name AS organization_name,
            team.name AS team_name,
            dep.name AS department_name,
            sla.response_due_at, sla.resolve_due_at,
            sla.response_breached, sla.resolve_breached,
            sla.response_met_at, sla.resolve_met_at,
            CASE
              WHEN sla.response_met_at IS NULL AND sla.response_due_at IS NOT NULL
              THEN TIMESTAMPDIFF(SECOND, NOW(), sla.response_due_at)
              ELSE NULL
            END AS response_time_remaining_seconds,
            CASE
              WHEN sla.resolve_met_at IS NULL AND sla.resolve_due_at IS NOT NULL
              THEN TIMESTAMPDIFF(SECOND, NOW(), sla.resolve_due_at)
              ELSE NULL
            END AS resolve_time_remaining_seconds,
            (SELECT COUNT(*) FROM ticket_attachments ta WHERE ta.ticket_id = t.id) AS attachment_count
          FROM tickets t
          INNER JOIN ticket_statuses s ON s.id = t.status_id
          INNER JOIN ticket_priorities p ON p.id = t.priority_id
          INNER JOIN ticket_types ty ON ty.id = t.type_id
          INNER JOIN ticket_channels ch ON ch.id = t.channel_id
          INNER JOIN users req ON req.id = t.requester_id
          LEFT JOIN users ass ON ass.id = t.assignee_id
          LEFT JOIN organizations org ON org.id = t.organization_id
          LEFT JOIN teams team ON team.id = t.team_id
          LEFT JOIN ticket_slas sla ON sla.ticket_id = t.id
          LEFT JOIN departments dep ON dep.id = req.department_id
          ${whereSql}
          ORDER BY p.sort_order DESC, t.created_at DESC
          LIMIT ? OFFSET ?`,
          [...params, pageSize, offset]
        );

        return send.ok(res, {
          items: rows,
          page,
          pageSize,
          total: countRows[0]?.total || 0,
        });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },

    // GET /api/tickets/:id
    getById: async (req, res) => {
      try {
        const ticketId = Number(req.params.id);
        const [rows] = await pool.query(
          `SELECT t.*,
            s.label AS status_label, s.\`key\` AS status_key, s.is_closed AS status_is_closed,
            p.label AS priority_label, p.\`key\` AS priority_key,
            ty.label AS type_label, ty.\`key\` AS type_key,
            ch.label AS channel_label, ch.\`key\` AS channel_key,
            req.full_name AS requester_name, req.email AS requester_email,
            req.company AS requester_company, req.title AS requester_title,
            ass.full_name AS assignee_name, ass.email AS assignee_email,
            org.name AS organization_name,
            team.name AS team_name,
            (SELECT tm.user_id FROM team_members tm WHERE tm.team_id = t.team_id AND tm.is_lead = 1 LIMIT 1) AS team_lead_id,
            EXISTS(SELECT 1 FROM team_members tmv WHERE tmv.team_id = t.team_id AND tmv.user_id = ?) AS viewer_is_team_member,
            sc.name AS service_category_name,
            tmpl.name AS template_name, tmpl.icon AS template_icon
          FROM tickets t
          INNER JOIN ticket_statuses s ON s.id = t.status_id
          INNER JOIN ticket_priorities p ON p.id = t.priority_id
          INNER JOIN ticket_types ty ON ty.id = t.type_id
          INNER JOIN ticket_channels ch ON ch.id = t.channel_id
          INNER JOIN users req ON req.id = t.requester_id
          LEFT JOIN users ass ON ass.id = t.assignee_id
          LEFT JOIN organizations org ON org.id = t.organization_id
          LEFT JOIN teams team ON team.id = t.team_id
          LEFT JOIN service_categories sc ON sc.id = t.service_category_id
          LEFT JOIN ticket_templates tmpl ON tmpl.id = t.template_id
          WHERE t.id = ?`,
          [req.user.id, ticketId]
        );
        const ticket = rows[0];
        if (!ticket) return send.notFound(res, "Ticket not found");

        if (!isAgent(req.user) && ticket.requester_id !== req.user.id) {
          return send.forbidden(res);
        }

        return send.ok(res, { ticket });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },

    // GET /api/tickets/:id/sla
    getTicketSla: async (req, res) => {
      const ticketId = Number(req.params.id);
      try {
        // First check permission - user must be agent or requester of this ticket
        const [ticketRows] = await pool.query(
          `SELECT requester_id FROM tickets WHERE id = ?`,
          [ticketId]
        );
        const ticket = ticketRows[0];
        if (!ticket) return send.notFound(res, "Ticket not found");
        if (!isAgent(req.user) && ticket.requester_id !== req.user.id) {
          return send.forbidden(res);
        }

        const [rows] = await pool.query(
          `SELECT ts.*, sp.name AS policy_name, sp.response_minutes, sp.resolve_minutes
           FROM ticket_slas ts
           INNER JOIN sla_policies sp ON sp.id = ts.policy_id
           WHERE ts.ticket_id = ?`,
          [ticketId]
        );

        // Triage SLA lives in its own table (the NOC "reassign on time" clock). A
        // NOC-routed ticket has ONLY this — its team response/resolve SLA has not
        // started yet — so fetch it BEFORE bailing on a missing team SLA row.
        const [triageRows] = await pool.query(
          `SELECT target_minutes, due_at, met_at, breached, started_at
           FROM ticket_triage_slas WHERE ticket_id = ?`,
          [ticketId]
        );
        const triage = triageRows[0] || null;

        // Manager review SLA — its own clock, started when the ticket is escalated
        // to the team manager and met when they reassign back / resolve.
        const [managerRows] = await pool.query(
          `SELECT m.target_minutes, m.due_at, m.met_at, m.breached, m.started_at, m.outcome, m.manager_id, u.full_name AS manager_name
           FROM ticket_manager_slas m LEFT JOIN users u ON u.id = m.manager_id
           WHERE m.ticket_id = ?`,
          [ticketId]
        );
        const manager = managerRows[0] || null;

        // Nothing to show only if there is no team SLA, no triage SLA, and no manager SLA.
        if (rows.length === 0 && !triage && !manager) return send.ok(res, { sla: null });

        const sla = rows[0] || null;
        const now = new Date();
        const managerRemainingMs = manager && manager.due_at && !manager.met_at ? Math.max(0, new Date(manager.due_at) - now) : null;

        // Check if the (team) policy uses business hours
        let useBH = false, bhId = null;
        if (sla) {
          const [policyRows] = await pool.query(
            "SELECT use_business_hours, business_hours_id FROM sla_policies WHERE id = ?",
            [sla.policy_id]
          );
          useBH = policyRows[0]?.use_business_hours;
          bhId = policyRows[0]?.business_hours_id;
        }

        let responseRemainingMs = sla?.response_due_at ? Math.max(0, new Date(sla.response_due_at) - now) : null;
        let resolveRemainingMs = sla?.resolve_due_at ? Math.max(0, new Date(sla.resolve_due_at) - now) : null;

        const triageRemainingMs = triage && triage.due_at ? Math.max(0, new Date(triage.due_at) - now) : null;

        // If using business hours, calculate business-minutes remaining instead of wall clock
        if (sla && useBH && bhId) {
          if (sla.response_due_at && !sla.response_met_at) {
            responseRemainingMs = await calcBusinessMsRemaining(pool, now, new Date(sla.response_due_at), bhId);
          }
          if (sla.resolve_due_at && !sla.resolve_met_at) {
            resolveRemainingMs = await calcBusinessMsRemaining(pool, now, new Date(sla.resolve_due_at), bhId);
          }
        }

        return send.ok(res, {
          sla: {
            ...(sla || {}),
            // The team response/resolve SLA is present only after the ticket is in a
            // handling team (NOC-triage tickets only have the triage SLA below).
            team_sla_present: !!sla,
            response_remaining_ms: responseRemainingMs,
            resolve_remaining_ms: resolveRemainingMs,
            use_business_hours: !!useBH,
            response_status: sla?.response_met_at ? "met" : sla?.response_breached ? "breached" : (responseRemainingMs !== null && responseRemainingMs < 3600000) ? "at_risk" : "on_track",
            resolve_status: sla?.resolve_met_at ? "met" : sla?.resolve_breached ? "breached" : (resolveRemainingMs !== null && resolveRemainingMs < 14400000) ? "at_risk" : "on_track",
            // NOC triage SLA — null/false when the ticket never passed through NOC.
            triage_present: !!triage,
            triage_minutes: triage ? triage.target_minutes : null,
            triage_due_at: triage ? triage.due_at : null,
            triage_met_at: triage ? triage.met_at : null,
            triage_breached: triage ? !!triage.breached : false,
            triage_started_at: triage ? triage.started_at : null,
            triage_remaining_ms: triageRemainingMs,
            triage_status: triage
              ? (triage.met_at ? "met" : triage.breached ? "breached"
                 : (triageRemainingMs !== null && triageRemainingMs < 300000) ? "at_risk" : "on_track")
              : null,
            // Manager review SLA — null/false unless the ticket was escalated to a
            // manager. "open" = still with the manager (frozen team SLA).
            manager_present: !!manager,
            manager_minutes: manager ? manager.target_minutes : null,
            manager_due_at: manager ? manager.due_at : null,
            manager_met_at: manager ? manager.met_at : null,
            manager_breached: manager ? (!!manager.breached || (!manager.met_at && managerRemainingMs === 0)) : false,
            manager_started_at: manager ? manager.started_at : null,
            manager_outcome: manager ? manager.outcome : null,
            manager_name: manager ? manager.manager_name : null,
            manager_remaining_ms: managerRemainingMs,
            manager_open: !!manager && !manager.met_at,
            manager_status: manager
              ? (manager.met_at ? "met"
                 : (manager.breached || managerRemainingMs === 0) ? "breached"
                 : (managerRemainingMs !== null && managerRemainingMs < 600000) ? "at_risk" : "on_track")
              : null,
          }
        });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },

    // POST /api/tickets
    create: async (req, res) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return send.bad(res, errors.array()[0].msg);

      try {
        const {
          subject,
          description,
          requesterId,
          organizationId,
          priorityKey,
          statusKey,
          typeKey,
          channelKey,
          assigneeId,
          teamId,
          serviceCategoryKey,
          dueAt,
          estimatedCost,
          templateId,
          templateResponses,
        } = req.body;

        const requester = isAgent(req.user) && requesterId ? requesterId : req.user.id;
        if (!isAgent(req.user) && requesterId && requesterId !== req.user.id) {
          return send.forbidden(res);
        }

        const requestedStatus = statusKey === "draft" ? "draft" : "open";
        const statusId =
          (await getLookupId(pool, "ticket_statuses", requestedStatus)) ||
          (await getLookupId(pool, "ticket_statuses", "open"));
        const priorityId =
          (await getLookupId(pool, "ticket_priorities", priorityKey || "normal")) || 1;
        const typeId = (await getLookupId(pool, "ticket_types", typeKey || "incident")) || 1;
        const channelId =
          (await getLookupId(pool, "ticket_channels", channelKey || "portal")) || 1;

        // Corporate self-service: the chosen service category routes the request to
        // a team queue. Customers always route by category; agents may still pass an
        // explicit teamId to override it.
        let serviceCategoryId = null;
        let routedTeamId = teamId || null;
        if (serviceCategoryKey) {
          const [[cat]] = await pool.query(
            "SELECT id, routing_team_id FROM service_categories WHERE `key` = ? AND is_active = 1 LIMIT 1",
            [serviceCategoryKey]
          );
          if (cat) {
            serviceCategoryId = cat.id;
            if (!teamId || !isAgent(req.user)) routedTeamId = cat.routing_team_id || routedTeamId;
          }
        }

        const tempNumber = `TMP-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        const [result] = await pool.query(
          `INSERT INTO tickets
            (ticket_number, subject, description, status_id, priority_id, type_id, service_category_id, channel_id,
             requester_id, assignee_id, team_id, organization_id, template_id, due_at, estimated_cost, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            tempNumber,
            subject,
            description || null,
            statusId,
            priorityId,
            typeId,
            serviceCategoryId,
            channelId,
            requester,
            isAgent(req.user) || templateId ? assigneeId || null : null,
            routedTeamId,
            organizationId || null,
            templateId || null,
            dueAt || null,
            estimatedCost || null,
            req.user.id,
          ]
        );

        const ticketId = result.insertId;
        const ticketNumber = await buildTicketNumber(ticketId);
        await pool.query("UPDATE tickets SET ticket_number = ? WHERE id = ?", [
          ticketNumber,
          ticketId,
        ]);

        const isDraft = requestedStatus === "draft";

        // DRAFT: parked, not submitted. No routing event, no SLA, no triage clock,
        // no approval flow, no notifications. Persist template responses only, return.
        if (isDraft) {
          if (templateId && templateResponses) {
            try {
              const [tmplRows] = await pool.query(
                "SELECT fields_schema FROM ticket_templates WHERE id = ?", [templateId]
              );
              const schemaSnapshot = tmplRows[0]?.fields_schema || null;
              await pool.query(
                `INSERT INTO ticket_template_responses (ticket_id, template_id, response_data, schema_snapshot)
                 VALUES (?, ?, ?, ?)`,
                [ticketId, templateId, JSON.stringify(templateResponses),
                 typeof schemaSnapshot === "string" ? schemaSnapshot : JSON.stringify(schemaSnapshot)]
              );
            } catch (tmplErr) { console.error("Draft template response save error:", tmplErr); }
          }
          await insertEvent(pool, {
            ticketId, actorId: req.user.id, type: "ticket.draft_saved",
            payload: { ticketNumber },
          });
          return send.created(res, { id: ticketId, ticketNumber, isDraft: true });
        }

        await insertEvent(pool, {
          ticketId,
          actorId: req.user.id,
          type: "ticket.created",
          payload: { ticketNumber, team_id: routedTeamId },
        });

        // SLA + status depend on where a SUBMITTED ticket lands:
        //  • NOC triage ("Not sure"): stays `open`; ONLY the triage SLA runs. The team
        //    response/resolve SLA must NOT start until NOC routes it out (reassign()).
        //  • Any handling (non-NOC) team: flip to `pending` and start the team SLA now.
        const nocTeamIdOnCreate = await getNocTeamId(pool);
        const routedToNoc = nocTeamIdOnCreate && routedTeamId === nocTeamIdOnCreate;

        if (routedToNoc) {
          await startTriageSla(pool, ticketId, priorityId, req.user.id);
        } else if (routedTeamId) {
          const pendingId = await getLookupId(pool, "ticket_statuses", "pending");
          if (pendingId) {
            await pool.query("UPDATE tickets SET status_id = ? WHERE id = ?", [pendingId, ticketId]);
            await insertEvent(pool, {
              ticketId, actorId: null, type: "ticket.updated",
              payload: { changes: { status: { from: "open", to: "pending" } }, auto: true },
            });
          }
          await assignSla(pool, ticketId, priorityId, routedTeamId);
        } else {
          // No team yet (rare agent-created path): keep `open`, start its SLA.
          await assignSla(pool, ticketId, priorityId, routedTeamId);
        }

        // Save template responses if a template was used
        if (templateId && templateResponses) {
          try {
            const [tmplRows] = await pool.query(
              "SELECT fields_schema FROM ticket_templates WHERE id = ?", [templateId]
            );
            const schemaSnapshot = tmplRows[0]?.fields_schema || null;
            await pool.query(
              `INSERT INTO ticket_template_responses (ticket_id, template_id, response_data, schema_snapshot)
               VALUES (?, ?, ?, ?)`,
              [ticketId, templateId, JSON.stringify(templateResponses),
               typeof schemaSnapshot === "string" ? schemaSnapshot : JSON.stringify(schemaSnapshot)]
            );
            // Increment usage count
            await pool.query(
              "UPDATE ticket_templates SET usage_count = usage_count + 1 WHERE id = ?", [templateId]
            );
          } catch (tmplErr) {
            console.error("Template response save error:", tmplErr);
          }
        }

        // Get requester's department_id for approval rule matching
        let requesterDepartmentId = null;
        try {
          const [reqUser] = await pool.query(
            "SELECT department_id FROM users WHERE id = ?", [requester]
          );
          requesterDepartmentId = reqUser[0]?.department_id || null;
        } catch (_) {}

        // Check and process approval workflow
        // Template-specific flows take priority over global approval rules
        let approvalResult;
        if (templateId) {
          approvalResult = await processTemplateApprovalFlow(pool, ticketId, templateId, {
            priority_key: priorityKey || "normal",
            type_key: typeKey || "incident",
            team_id: routedTeamId,
            department_id: requesterDepartmentId,
            estimated_cost: estimatedCost || null,
          }, requester);
        }
        if (!approvalResult || !approvalResult.requiresApproval) {
          // Fallback to global approval rules
          approvalResult = await processTicketApproval(pool, ticketId, {
            priority_key: priorityKey || "normal",
            type_key: typeKey || "incident",
            team_id: routedTeamId,
            department_id: requesterDepartmentId,
            estimated_cost: estimatedCost || null,
          }, requester);
        }

        // If ticket requires approval, pause SLA — team can't work until approved
        if (approvalResult && approvalResult.requiresApproval) {
          try {
            const [slas] = await pool.query(
              `SELECT response_due_at, resolve_due_at, response_met_at, resolve_met_at
               FROM ticket_slas WHERE ticket_id = ?`,
              [ticketId]
            );
            if (slas.length > 0) {
              const sla = slas[0];
              const now = new Date();
              const responseRemaining = sla.response_due_at && !sla.response_met_at
                ? Math.max(0, new Date(sla.response_due_at) - now)
                : null;
              const resolveRemaining = sla.resolve_due_at && !sla.resolve_met_at
                ? Math.max(0, new Date(sla.resolve_due_at) - now)
                : null;

              await pool.query(
                `UPDATE ticket_slas
                 SET paused_at = NOW(),
                     response_remaining_ms = ?,
                     resolve_remaining_ms = ?,
                     updated_at = NOW()
                 WHERE ticket_id = ?`,
                [responseRemaining, resolveRemaining, ticketId]
              );

              await insertEvent(pool, {
                ticketId,
                actorId: req.user.id,
                type: "sla.paused",
                payload: {
                  reason: "pending_approval",
                  response_remaining_ms: responseRemaining,
                  resolve_remaining_ms: resolveRemaining,
                },
              });
            }
          } catch (slaPauseErr) {
            console.error("SLA pause on approval error:", slaPauseErr);
          }

          // Assign approval-level SLAs to individual approval records
          try {
            await approvalSlaService.assignApprovalSlas(ticketId);
          } catch (aslErr) {
            console.error("Approval SLA assignment error:", aslErr);
          }
        }

        // Corporate-flow notifications: alert the routed queue + the Service
        // Delivery Manager so an engineer can pick it up and the SDM can re-route.
        if (serviceCategoryId && routedTeamId) {
          try {
            const [[cat]] = await pool.query("SELECT name FROM service_categories WHERE id = ?", [serviceCategoryId]);
            const [[team]] = await pool.query("SELECT name FROM teams WHERE id = ?", [routedTeamId]);
            const catName = cat?.name || "Service";
            const teamName = team?.name || "the team";
            const [members] = await pool.query(
              "SELECT user_id FROM team_members WHERE team_id = ? AND user_id <> ?",
              [routedTeamId, requester]
            );
            const [sdms] = await pool.query(
              "SELECT id FROM users WHERE title = 'Service Delivery Manager' AND is_active = 1 AND id <> ?",
              [requester]
            );
            const recips = new Map();
            for (const m of members) recips.set(m.user_id, [
              m.user_id, ticketId,
              `New ${catName} request in ${teamName}`,
              `${ticketNumber} — ${subject}`,
              "queue",
            ]);
            for (const s of sdms) recips.set(s.id, [
              s.id, ticketId,
              `Corporate request routed — ${catName}`,
              `${ticketNumber} routed to ${teamName}. Reassign if it belongs in another queue.`,
              "sdm",
            ]);
            const rows = [...recips.values()];
            if (rows.length) {
              await pool.query(
                "INSERT INTO notifications (user_id, ticket_id, title, message, type) VALUES ?",
                [rows]
              );
            }
          } catch (notifyErr) {
            console.error("Corporate routing notification error:", notifyErr);
          }
        }

        return send.created(res, {
          id: ticketId,
          ticketNumber,
          requiresApproval: approvalResult.requiresApproval,
          approvalInfo: approvalResult.requiresApproval ? {
            rule: approvalResult.approvalRule,
            levels: approvalResult.approvalLevels,
            flowType: approvalResult.flowType,
            totalSteps: approvalResult.totalSteps,
          } : null,
        });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },

    // POST /api/tickets/:id/submit  — promote a saved draft into a live ticket.
    // (?draftOnly=1 just persists edits to the draft without submitting.)
    submitDraft: async (req, res) => {
      const ticketId = Number(req.params.id);
      const draftOnly = req.query.draftOnly === "1" || req.query.draftOnly === "true";
      try {
        const [[t]] = await pool.query(
          `SELECT t.*, s.\`key\` AS status_key FROM tickets t
           JOIN ticket_statuses s ON s.id = t.status_id WHERE t.id = ?`,
          [ticketId]
        );
        if (!t) return send.notFound(res, "Ticket not found");
        // Scoped carve-out: only the owner (or an agent) may edit/submit, and only
        // while it is still a draft. This safely bypasses update()'s field lock.
        // A draft is private and unsubmitted — only its owner may edit/submit it.
        if (t.requester_id !== req.user.id) return send.forbidden(res);
        if (t.status_key !== "draft") return send.bad(res, "Only a draft can be submitted.");

        // Apply any edited fields + re-route by (possibly changed) service category.
        const { subject, description, priorityKey, typeKey, serviceCategoryKey, estimatedCost } = req.body;
        const sets = [], vals = [];
        if (subject !== undefined) { sets.push("subject = ?"); vals.push(subject); }
        if (description !== undefined) { sets.push("description = ?"); vals.push(description || null); }
        let priorityId = t.priority_id;
        if (priorityKey) { const pid = await getLookupId(pool, "ticket_priorities", priorityKey); if (pid) { priorityId = pid; sets.push("priority_id = ?"); vals.push(pid); } }
        if (typeKey) { const tid = await getLookupId(pool, "ticket_types", typeKey); if (tid) { sets.push("type_id = ?"); vals.push(tid); } }
        let serviceCategoryId = t.service_category_id;
        let routedTeamId = t.team_id;
        if (serviceCategoryKey) {
          const [[cat]] = await pool.query("SELECT id, routing_team_id FROM service_categories WHERE `key` = ? AND is_active = 1 LIMIT 1", [serviceCategoryKey]);
          if (cat) { serviceCategoryId = cat.id; routedTeamId = cat.routing_team_id || routedTeamId; sets.push("service_category_id = ?"); vals.push(cat.id); sets.push("team_id = ?"); vals.push(routedTeamId); }
        }
        if (estimatedCost !== undefined) { sets.push("estimated_cost = ?"); vals.push(estimatedCost || null); }
        if (sets.length) { vals.push(ticketId); await pool.query(`UPDATE tickets SET ${sets.join(", ")} WHERE id = ?`, vals); }

        // Autosave only — still a draft.
        if (draftOnly) {
          await insertEvent(pool, { ticketId, actorId: req.user.id, type: "ticket.draft_saved", payload: {} });
          return send.ok(res, { id: ticketId, isDraft: true });
        }

        // ── Promote to a submitted ticket (mirrors create()'s submit pipeline) ──
        const ticketNumber = t.ticket_number;
        const subjectVal = subject !== undefined ? subject : t.subject;
        const openId = await getLookupId(pool, "ticket_statuses", "open");
        if (openId) await pool.query("UPDATE tickets SET status_id = ? WHERE id = ?", [openId, ticketId]);
        await insertEvent(pool, {
          ticketId, actorId: req.user.id, type: "ticket.created",
          payload: { ticketNumber, team_id: routedTeamId, from_draft: true },
        });

        // SLA + status: NOC triage stays open (triage SLA only); handling team → pending + team SLA.
        const nocTeamId = await getNocTeamId(pool);
        if (nocTeamId && routedTeamId === nocTeamId) {
          await startTriageSla(pool, ticketId, priorityId, req.user.id);
        } else if (routedTeamId) {
          const pendingId = await getLookupId(pool, "ticket_statuses", "pending");
          if (pendingId) {
            await pool.query("UPDATE tickets SET status_id = ? WHERE id = ?", [pendingId, ticketId]);
            await insertEvent(pool, {
              ticketId, actorId: null, type: "ticket.updated",
              payload: { changes: { status: { from: "open", to: "pending" } }, auto: true },
            });
          }
          await assignSla(pool, ticketId, priorityId, routedTeamId);
        } else {
          await assignSla(pool, ticketId, priorityId, routedTeamId);
        }

        // Approval flow (pause SLA + assign approval SLAs if required).
        let requesterDepartmentId = null;
        try { const [ru] = await pool.query("SELECT department_id FROM users WHERE id = ?", [t.requester_id]); requesterDepartmentId = ru[0]?.department_id || null; } catch (_) {}
        const approvalResult = await processTicketApproval(pool, ticketId, {
          priority_key: priorityKey || "normal", type_key: typeKey || "incident",
          team_id: routedTeamId, department_id: requesterDepartmentId, estimated_cost: estimatedCost || null,
        }, t.requester_id);
        if (approvalResult && approvalResult.requiresApproval) {
          try {
            const [slas] = await pool.query(`SELECT response_due_at, resolve_due_at, response_met_at, resolve_met_at FROM ticket_slas WHERE ticket_id = ?`, [ticketId]);
            if (slas.length > 0) {
              const sla = slas[0]; const now = new Date();
              const rr = sla.response_due_at && !sla.response_met_at ? Math.max(0, new Date(sla.response_due_at) - now) : null;
              const vr = sla.resolve_due_at && !sla.resolve_met_at ? Math.max(0, new Date(sla.resolve_due_at) - now) : null;
              await pool.query(`UPDATE ticket_slas SET paused_at = NOW(), response_remaining_ms = ?, resolve_remaining_ms = ?, updated_at = NOW() WHERE ticket_id = ?`, [rr, vr, ticketId]);
              await insertEvent(pool, { ticketId, actorId: req.user.id, type: "sla.paused", payload: { reason: "pending_approval", response_remaining_ms: rr, resolve_remaining_ms: vr } });
            }
          } catch (slaPauseErr) { console.error("SLA pause on approval error:", slaPauseErr); }
          try { await approvalSlaService.assignApprovalSlas(ticketId); } catch (aslErr) { console.error("Approval SLA assignment error:", aslErr); }
        }

        // Corporate-flow notifications: alert the routed queue + the SDM.
        if (serviceCategoryId && routedTeamId) {
          try {
            const [[cat]] = await pool.query("SELECT name FROM service_categories WHERE id = ?", [serviceCategoryId]);
            const [[team]] = await pool.query("SELECT name FROM teams WHERE id = ?", [routedTeamId]);
            const catName = cat?.name || "Service"; const teamName = team?.name || "the team";
            const [members] = await pool.query("SELECT user_id FROM team_members WHERE team_id = ? AND user_id <> ?", [routedTeamId, t.requester_id]);
            const [sdms] = await pool.query("SELECT id FROM users WHERE title = 'Service Delivery Manager' AND is_active = 1 AND id <> ?", [t.requester_id]);
            const recips = new Map();
            for (const m of members) recips.set(m.user_id, [m.user_id, ticketId, `New ${catName} request in ${teamName}`, `${ticketNumber} — ${subjectVal}`, "queue"]);
            for (const s of sdms) recips.set(s.id, [s.id, ticketId, `Corporate request routed — ${catName}`, `${ticketNumber} routed to ${teamName}. Reassign if it belongs in another queue.`, "sdm"]);
            const rows = [...recips.values()];
            if (rows.length) await pool.query("INSERT INTO notifications (user_id, ticket_id, title, message, type) VALUES ?", [rows]);
          } catch (notifyErr) { console.error("Corporate routing notification error:", notifyErr); }
        }

        return send.ok(res, {
          id: ticketId, ticketNumber,
          requiresApproval: !!(approvalResult && approvalResult.requiresApproval),
        });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },

    // PATCH /api/tickets/:id
    update: async (req, res) => {
      const ticketId = Number(req.params.id);

      try {
        // Get current ticket state
        const [currentRows] = await pool.query(
          `SELECT t.*, s.\`key\` AS status_key, p.\`key\` AS priority_key
           FROM tickets t
           INNER JOIN ticket_statuses s ON s.id = t.status_id
           INNER JOIN ticket_priorities p ON p.id = t.priority_id
           WHERE t.id = ?`,
          [ticketId]
        );
        const current = currentRows[0];
        if (!current) return send.notFound(res, "Ticket not found");

        // Check if ticket requires approval and is pending
        if (current.requires_approval && current.approval_status === 'pending') {
          // Allow status changes to 'on_hold' or reopening, but not resolution/closing
          if (req.body.status_id) {
            const newStatusKey = await getStatusKey(pool, req.body.status_id);
            if (newStatusKey === 'solved' || newStatusKey === 'closed') {
              const errorMsg = "This ticket requires approval before it can be resolved or closed. Please wait for approval or cancel the approval request.";
              console.log(`[Approval Block] Ticket ${ticketId} - Status: pending, Attempted: ${newStatusKey}`);
              return send.forbidden(res, errorMsg);
            }
          }
        }

        // Check if ticket requires approval but was rejected
        if (current.requires_approval && current.approval_status === 'rejected') {
          if (req.body.status_id) {
            const newStatusKey = await getStatusKey(pool, req.body.status_id);
            if (newStatusKey === 'solved' || newStatusKey === 'closed') {
              const errorMsg = "This ticket's approval request was rejected. It cannot be resolved or closed until a new approval is granted.";
              console.log(`[Approval Block] Ticket ${ticketId} - Status: rejected, Attempted: ${newStatusKey}`);
              return send.forbidden(res, errorMsg);
            }
          }
        }

        // Requesters can only confirm-close or reopen their OWN solved ticket.
        if (!isAgent(req.user)) {
          if (current.requester_id !== req.user.id) return send.forbidden(res);
          // Only allow status_id change (confirm-close / reopen)
          const allowedFields = Object.keys(req.body).filter(k => k === "status_id");
          if (allowedFields.length === 0 || Object.keys(req.body).length !== allowedFields.length) {
            return send.forbidden(res, "Requesters can only update ticket status");
          }
        }

        // Priority (urgency) is NOC's call and drives the SLA — it can only be set
        // by NOC while the ticket is still in the triage queue (or by an admin).
        // Once it's routed to a handling team the priority is locked.
        if (req.body.priority_id !== undefined && Number(req.body.priority_id) !== current.priority_id) {
          const prIsAdmin = (req.user.roles || []).includes("admin");
          const nocTeamId = await getNocTeamId(pool);
          const inNocQueue = !!nocTeamId && current.team_id === nocTeamId;
          if (!prIsAdmin && !(inNocQueue && await isNocMember(pool, req.user.id))) {
            return send.forbidden(res, "Only NOC can set a ticket's priority, and only while it's in the triage queue.");
          }
        }

        // Validate status transitions
        if (req.body.status_id && req.body.status_id !== current.status_id) {
          const newStatusKey = await getStatusKey(pool, req.body.status_id);
          if (!newStatusKey) return send.bad(res, "Invalid status");
          const allowed = STATUS_TRANSITIONS[current.status_key] || [];
          if (!allowed.includes(newStatusKey)) {
            return send.bad(res, `Cannot transition from ${current.status_key} to ${newStatusKey}`);
          }

          // A requester may only confirm-close or reopen a SOLVED ticket (or reopen a
          // CLOSED one). They must never self-solve/close an active ticket — that would
          // falsely mark the resolve SLA met with no agent work.
          if (!isAgent(req.user)) {
            const requesterAllowed = { solved: ["closed", "in_progress"], closed: ["in_progress"] };
            if (!(requesterAllowed[current.status_key] || []).includes(newStatusKey)) {
              return send.forbidden(res, "You can only confirm or reopen a solved ticket.");
            }
          }

          // An agent can only resolve/close a ticket that's in their own team's
          // queue (or one they're assigned, or an admin) — once NOC routes a ticket
          // to another team it can no longer resolve it.
          if (isAgent(req.user) && (newStatusKey === "solved" || newStatusKey === "closed")) {
            const isAdmin = (req.user.roles || []).includes("admin");
            const isAssignee = current.assignee_id != null && current.assignee_id === req.user.id;
            if (!isAdmin && !isAssignee && !(await isTeamMember(pool, req.user.id, current.team_id))) {
              return send.forbidden(res, "You can only resolve or close a ticket that's in your team's queue.");
            }
          }

          // Resolving and closing both mean the resolution target was met.
          if (newStatusKey === "solved" || newStatusKey === "closed") {
            try {
              await pool.query(
                `UPDATE ticket_slas SET resolve_met_at = NOW()
                 WHERE ticket_id = ? AND resolve_met_at IS NULL`,
                [ticketId]
              );
            } catch (_) {}
            // If the manager resolved a ticket that was escalated to them, that
            // closes the manager review clock (the manager solved it themselves —
            // the engineer's frozen SLA stays as-is, completed by someone else).
            await meetManagerSla(pool, ticketId, "resolved", req.user.id);
          }
          // Resolve = solved_at (stamped directly so the Activity log doesn't show a
          // misleading "Closed Date changed"). closed_at is reserved for an actual close.
          if (newStatusKey === "solved") {
            try { await pool.query("UPDATE tickets SET solved_at = NOW() WHERE id = ?", [ticketId]); } catch (_) {}
          }
          if (newStatusKey === "closed") {
            req.body.closed_at = new Date();
          }

          // Only the team's manager (lead) or an admin may freeze (hold) a ticket's
          // SLA. A regular engineer must escalate to the manager instead.
          if (newStatusKey === "on_hold" && current.status_key !== "on_hold") {
            const isAdmin = (req.user.roles || []).includes("admin");
            const leadId = await getTeamLeadId(pool, current.team_id);
            if (!isAdmin && req.user.id !== leadId) {
              return send.forbidden(res, "Only the team manager can hold a ticket. Escalate to your manager instead.");
            }
          }

          // Handle on_hold: pause SLA timer
          if (newStatusKey === "on_hold" && current.status_key !== "on_hold") {
            try {
              // Get current SLA and calculate remaining time
              const [slas] = await pool.query(
                `SELECT response_due_at, resolve_due_at, response_met_at, resolve_met_at
                 FROM ticket_slas WHERE ticket_id = ?`,
                [ticketId]
              );
              if (slas.length > 0) {
                const sla = slas[0];
                const now = new Date();
                const responseRemaining = sla.response_due_at && !sla.response_met_at
                  ? Math.max(0, new Date(sla.response_due_at) - now)
                  : null;
                const resolveRemaining = sla.resolve_due_at && !sla.resolve_met_at
                  ? Math.max(0, new Date(sla.resolve_due_at) - now)
                  : null;

                await pool.query(
                  `UPDATE ticket_slas
                   SET paused_at = NOW(),
                       response_remaining_ms = ?,
                       resolve_remaining_ms = ?,
                       updated_at = NOW()
                   WHERE ticket_id = ?`,
                  [responseRemaining, resolveRemaining, ticketId]
                );

                await insertEvent(pool, {
                  ticketId,
                  actorId: req.user.id,
                  type: "sla.paused",
                  payload: { response_remaining_ms: responseRemaining, resolve_remaining_ms: resolveRemaining }
                });
              }
            } catch (_) {}
          }

          // While a ticket is held, only the manager (lead) or an admin controls
          // it — they froze it, so they unfreeze it. A regular engineer gets it
          // back via the manager's reassign, never by un-holding it themselves.
          if (current.status_key === "on_hold" && newStatusKey !== "on_hold") {
            const isAdmin = (req.user.roles || []).includes("admin");
            const leadId = await getTeamLeadId(pool, current.team_id);
            if (!isAdmin && req.user.id !== leadId) {
              return send.forbidden(res, "Only the team manager can resume a held ticket. It will come back to you when the manager reassigns it.");
            }
          }

          // Handle leaving on_hold: resume SLA timer
          if (current.status_key === "on_hold" && newStatusKey !== "on_hold") {
            try {
              const [slas] = await pool.query(
                `SELECT paused_at, response_remaining_ms, resolve_remaining_ms,
                        response_met_at, resolve_met_at, response_due_at, resolve_due_at
                 FROM ticket_slas WHERE ticket_id = ?`,
                [ticketId]
              );
              if (slas.length > 0 && slas[0].paused_at) {
                const sla = slas[0];
                const now = new Date();

                const newResponseDue = sla.response_remaining_ms && !sla.response_met_at
                  ? new Date(now.getTime() + sla.response_remaining_ms)
                  : sla.response_due_at;
                const newResolveDue = sla.resolve_remaining_ms && !sla.resolve_met_at
                  ? new Date(now.getTime() + sla.resolve_remaining_ms)
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
                  [newResponseDue, newResolveDue, ticketId]
                );

                await insertEvent(pool, {
                  ticketId,
                  actorId: req.user.id,
                  type: "sla.resumed",
                  payload: { new_response_due: newResponseDue, new_resolve_due: newResolveDue }
                });
              }
            } catch (_) {}
          }

          // Handle reopen: increment reopened_count, clear closed_at + solved_at
          if ((current.status_key === "solved" || current.status_key === "closed") && newStatusKey === "in_progress") {
            req.body.closed_at = null;
            try {
              await pool.query(
                "UPDATE tickets SET reopened_count = COALESCE(reopened_count, 0) + 1, solved_at = NULL WHERE id = ?",
                [ticketId]
              );
            } catch (_) {}
          }
        }

        const fields = [
          "subject", "description", "status_id", "priority_id", "type_id",
          "channel_id", "assignee_id", "team_id", "organization_id", "due_at", "closed_at",
        ];

        const updates = [];
        const values = [];
        const changes = {};

        for (const field of fields) {
          if (field in req.body) {
            updates.push(`${field} = ?`);
            values.push(req.body[field]);
            changes[field] = { from: current[field], to: req.body[field] };
          }
        }

        if (updates.length === 0) return send.bad(res, "No fields to update");

        const [result] = await pool.query(
          `UPDATE tickets SET ${updates.join(", ")} WHERE id = ?`,
          [...values, ticketId]
        );

        if (result.affectedRows === 0) return send.notFound(res, "Ticket not found");

        // Enhanced audit: log old->new values
        await insertEvent(pool, {
          ticketId,
          actorId: req.user.id,
          type: "ticket.updated",
          payload: { changes },
        });

        // Re-target the SLA when priority or team changed. During NOC triage the
        // live clock is the triage SLA (the team SLA hasn't started yet), so
        // re-target that; otherwise re-point the team response/resolve SLA.
        if (req.body.priority_id || req.body.team_id) {
          const newPriorityId = req.body.priority_id || current.priority_id;
          const newTeamId = req.body.team_id || current.team_id;
          const nocTeamId = await getNocTeamId(pool);
          if (req.body.priority_id && nocTeamId && newTeamId === nocTeamId) {
            await recomputeTriageSla(pool, ticketId, newPriorityId);
          } else {
            await assignSla(pool, ticketId, newPriorityId, newTeamId);
          }
        }

        return send.ok(res, { ok: true });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },

    // PATCH /api/tickets/bulk
    bulkUpdate: async (req, res) => {
      if (!isAgent(req.user)) return send.forbidden(res);
      const { ticketIds, updates } = req.body;
      if (!Array.isArray(ticketIds) || ticketIds.length === 0) return send.bad(res, "No tickets specified");
      if (!updates || Object.keys(updates).length === 0) return send.bad(res, "No updates specified");

      const allowedFields = ["status_id", "priority_id", "assignee_id", "team_id"];
      const fields = Object.keys(updates).filter(k => allowedFields.includes(k));
      if (fields.length === 0) return send.bad(res, "No valid fields to update");

      // Priority (urgency) is NOC's call — keep bulk priority changes to NOC
      // members and admins (the per-ticket triage-window rule is enforced in update()).
      if (updates.priority_id !== undefined) {
        const bulkIsAdmin = (req.user.roles || []).includes("admin");
        if (!bulkIsAdmin && !(await isNocMember(pool, req.user.id))) {
          return send.forbidden(res, "Only NOC can change ticket priority.");
        }
      }

      try {
        // If updating status, check for approval requirements
        if (updates.status_id) {
          const newStatusKey = await getStatusKey(pool, updates.status_id);

          // Hold / resume carry a manager gate + per-ticket SLA pause/resume that
          // the bulk path can't apply safely, so keep the freeze lifecycle out of
          // bulk entirely: block holding here, and block touching any ticket that
          // is currently held. Both must go through the ticket's detail page.
          if (newStatusKey === "on_hold") {
            return send.bad(res, "Put a ticket on hold from its detail page — bulk hold isn't supported.");
          }
          const [heldRows] = await pool.query(
            `SELECT t.id FROM tickets t JOIN ticket_statuses s ON s.id = t.status_id
             WHERE t.id IN (${ticketIds.map(() => "?").join(",")}) AND s.\`key\` = 'on_hold'`,
            ticketIds
          );
          if (heldRows.length > 0) {
            return send.bad(res, "Some selected tickets are on hold. Resume them from their detail page so the manager gate and SLA timer apply.");
          }

          if (newStatusKey === 'solved' || newStatusKey === 'closed') {
            // Check if any tickets require approval
            const [ticketsWithApproval] = await pool.query(
              `SELECT id FROM tickets
               WHERE id IN (${ticketIds.map(() => "?").join(",")})
               AND requires_approval = 1
               AND approval_status IN ('pending', 'rejected')`,
              ticketIds
            );
            if (ticketsWithApproval.length > 0) {
              const blockedIds = ticketsWithApproval.map(t => t.id).join(', ');
              return send.forbidden(res, `Cannot resolve/close tickets with pending or rejected approval: ${blockedIds}`);
            }
          }
        }

        const setClauses = fields.map(f => `${f} = ?`);
        const setValues = fields.map(f => updates[f]);

        const placeholders = ticketIds.map(() => "?").join(",");
        await pool.query(
          `UPDATE tickets SET ${setClauses.join(", ")} WHERE id IN (${placeholders})`,
          [...setValues, ...ticketIds]
        );

        // Log events for each ticket
        for (const tid of ticketIds) {
          await insertEvent(pool, {
            ticketId: tid,
            actorId: req.user.id,
            type: "ticket.updated",
            payload: { changes: updates, bulk: true },
          });
        }

        return send.ok(res, { ok: true, updated: ticketIds.length });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },

    // POST /api/tickets/:id/assign
    assignToMe: async (req, res) => {
      if (!isAgent(req.user)) return send.forbidden(res);
      const ticketId = Number(req.params.id);

      try {
        const [currentRows] = await pool.query(
          "SELECT assignee_id, status_id, team_id FROM tickets WHERE id = ?",
          [ticketId]
        );
        if (currentRows.length === 0) return send.notFound(res);
        const current = currentRows[0];

        // You can only pick up a ticket that's in your own team's queue (or you're
        // an admin) — an agent can't grab a ticket routed to another team.
        const isAdmin = (req.user.roles || []).includes("admin");
        if (!isAdmin && !(await isTeamMember(pool, req.user.id, current.team_id))) {
          return send.forbidden(res, "You can only pick up a ticket that's in your team's queue.");
        }

        // Assign to current user
        await pool.query("UPDATE tickets SET assignee_id = ? WHERE id = ?", [req.user.id, ticketId]);

        // Pickup records the assignee only. Status advances to in_progress on the
        // agent's first public reply (addComment), the single source of truth.

        await insertEvent(pool, {
          ticketId,
          actorId: req.user.id,
          type: "ticket.assigned",
          payload: { assignee_id: req.user.id, previous_assignee_id: current.assignee_id },
        });

        return send.ok(res, { ok: true });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },

    // POST /api/tickets/:id/escalate
    escalate: async (req, res) => {
      if (!isAgent(req.user)) return send.forbidden(res);
      const ticketId = Number(req.params.id);

      try {
        const [currentRows] = await pool.query(
          `SELECT t.priority_id, t.team_id, p.\`key\` AS priority_key
           FROM tickets t
           INNER JOIN ticket_priorities p ON p.id = t.priority_id
           WHERE t.id = ?`,
          [ticketId]
        );
        if (currentRows.length === 0) return send.notFound(res);
        const current = currentRows[0];

        // Only the owning team (or an admin) can escalate a ticket's priority —
        // once NOC routes it out of its queue it can no longer act on it.
        const escIsAdmin = (req.user.roles || []).includes("admin");
        if (!escIsAdmin && !(await isTeamMember(pool, req.user.id, current.team_id))) {
          return send.forbidden(res, "You can only act on a ticket that's in your team's queue.");
        }

        // Escalation order: low -> normal -> high -> urgent
        const escalationMap = { low: "normal", normal: "high", high: "urgent" };
        const nextKey = escalationMap[current.priority_key];
        if (!nextKey) return send.bad(res, "Ticket is already at highest priority");

        const nextId = await getLookupId(pool, "ticket_priorities", nextKey);
        if (!nextId) return send.serverErr(res);

        await pool.query("UPDATE tickets SET priority_id = ? WHERE id = ?", [nextId, ticketId]);

        await insertEvent(pool, {
          ticketId,
          actorId: req.user.id,
          type: "ticket.escalated",
          payload: { from: current.priority_key, to: nextKey },
        });

        // Recalculate SLA with new priority
        const [ticket] = await pool.query("SELECT team_id FROM tickets WHERE id = ?", [ticketId]);
        await assignSla(pool, ticketId, nextId, ticket[0]?.team_id);

        return send.ok(res, { ok: true, newPriority: nextKey });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },

    // POST /api/tickets/:id/escalate-to-manager
    // A support engineer hands the ticket to the team manager (lead) to review and,
    // if needed, freeze the SLA — then the manager reassigns it back.
    escalateToManager: async (req, res) => {
      if (!isAgent(req.user)) return send.forbidden(res);
      const ticketId = Number(req.params.id);
      const { reason } = req.body;
      try {
        const [[t]] = await pool.query(
          `SELECT team_id, priority_id, ticket_number, subject, assignee_id FROM tickets WHERE id = ?`, [ticketId]
        );
        if (!t) return send.notFound(res, "Ticket not found");

        // You can only escalate a ticket that's in your own team's queue — e.g. NOC
        // can't escalate a ticket it already routed to another team.
        const escIsAdmin = (req.user.roles || []).includes("admin");
        if (!escIsAdmin && !(await isTeamMember(pool, req.user.id, t.team_id))) {
          return send.forbidden(res, "You can only act on a ticket that's in your team's queue.");
        }

        const leadId = await getTeamLeadId(pool, t.team_id);
        if (!leadId) return send.bad(res, "This ticket's team has no manager set to escalate to.");
        if (leadId === req.user.id) return send.bad(res, "You are the team manager — you can hold this ticket directly.");

        // Hand the ticket to the manager.
        await pool.query("UPDATE tickets SET assignee_id = ? WHERE id = ?", [leadId, ticketId]);
        await insertEvent(pool, {
          ticketId, actorId: req.user.id, type: "ticket.escalated_to_manager",
          payload: { manager_id: leadId, from_assignee: t.assignee_id, reason: reason || null },
        });

        // Freeze the engineer's (team) SLA while the manager reviews, and start the
        // manager's own review clock. The manager closes it by reassigning back
        // (which resumes the team SLA) or resolving.
        await pauseTicketSla(pool, ticketId, null);
        await startManagerSla(pool, ticketId, t.priority_id, leadId);
        if (reason && reason.trim()) {
          const [cmt] = await pool.query(
            `INSERT INTO ticket_comments (ticket_id, author_id, body, is_public) VALUES (?, ?, ?, 0)`,
            [ticketId, req.user.id, reason.trim()]
          );
          await insertEvent(pool, {
            ticketId, actorId: req.user.id, type: "ticket.commented",
            payload: { commentId: cmt.insertId, isPublic: false, source: "escalate_to_manager" },
          });
        }
        try {
          const [[me]] = await pool.query("SELECT full_name FROM users WHERE id = ?", [req.user.id]);
          await pool.query(
            `INSERT INTO notifications (user_id, ticket_id, title, message, type) VALUES (?, ?, ?, ?, 'escalation')`,
            [leadId, ticketId, `Escalated to you: ${t.ticket_number}`,
             `${me?.full_name || "An engineer"} escalated "${t.subject}" for your review.${reason && reason.trim() ? ` — ${reason.trim()}` : ""}`]
          );
        } catch (_) {}

        return send.ok(res, { ok: true, managerId: leadId });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },

    // POST /api/tickets/:id/reassign
    // Reassign ticket to different team/agent
    reassign: async (req, res) => {
      if (!isAgent(req.user)) return send.forbidden(res);
      const ticketId = Number(req.params.id);
      const { team_id, assignee_id, reason } = req.body;

      try {
        // Get current ticket state
        const [currentRows] = await pool.query(
          `SELECT t.team_id, t.assignee_id, t.approval_status, t.priority_id, s.\`key\` AS status_key
           FROM tickets t JOIN ticket_statuses s ON s.id = t.status_id WHERE t.id = ?`,
          [ticketId]
        );
        if (currentRows.length === 0) return send.notFound(res);
        const current = currentRows[0];

        // Moving a ticket to a DIFFERENT team is a triage action — restricted to
        // NOC members + admins. Anyone else must flag it back to NOC instead.
        const changingTeam = team_id !== undefined && (team_id || null) !== current.team_id;
        if (changingTeam) {
          const isAdmin = (req.user.roles || []).includes("admin");
          if (!isAdmin && !(await isNocMember(pool, req.user.id))) {
            return send.forbidden(res, "Only NOC can reassign a ticket to another team — use \"Flag back to NOC\" instead.");
          }
          // A requirements note is mandatory on a team change (triage hand-off).
          if (!reason || !reason.trim()) {
            return send.bad(res, "A requirements note is required when reassigning to another team.");
          }
          // Triage targets are restricted to the corporate-flow teams (matches the
          // UI dropdown). Enforced here too so a direct API call can't route a
          // ticket back into NOC (which would leave it untriaged) or to an
          // internal team that isn't part of this flow.
          const [allowedTeams] = await pool.query(
            `SELECT id FROM teams WHERE name IN ('Cloud','Transmission','MTX','Security Operations')`
          );
          if (!allowedTeams.some((t) => t.id === Number(team_id))) {
            return send.bad(res, "Tickets can only be reassigned to Cloud, Transmission, MTX, or Security Operations.");
          }
        }

        // A ticket that's with the manager — held (on_hold) or escalated (an open
        // manager SLA) — can only be reassigned back by the manager (lead) or an
        // admin; that's the sanctioned "manager hands it back" path and it resumes
        // the frozen team SLA below. The manager must also leave a comment.
        const hadOpenMgrSla = await hasOpenManagerSla(pool, ticketId);
        if (current.status_key === "on_hold" || hadOpenMgrSla) {
          const isAdmin = (req.user.roles || []).includes("admin");
          const leadId = await getTeamLeadId(pool, current.team_id);
          if (!isAdmin && req.user.id !== leadId) {
            return send.forbidden(res, "Only the team manager can reassign this ticket back.");
          }
          if (hadOpenMgrSla && (!reason || !reason.trim())) {
            return send.bad(res, "Add a comment on your review before reassigning the ticket back.");
          }
        }

        // Build update query
        const updates = [];
        const params = [];

        if (team_id !== undefined) {
          updates.push("team_id = ?");
          params.push(team_id || null);
        }
        if (assignee_id !== undefined) {
          updates.push("assignee_id = ?");
          params.push(assignee_id || null);
        } else if (changingTeam) {
          // A team hand-off with no explicit assignee clears the old team's owner,
          // so the receiving queue starts unassigned (no stale NOC assignee).
          updates.push("assignee_id = ?");
          params.push(null);
        }

        if (updates.length === 0) {
          return send.bad(res, "No changes specified");
        }

        params.push(ticketId);
        await pool.query(`UPDATE tickets SET ${updates.join(", ")} WHERE id = ?`, params);

        // Log reassignment history
        await pool.query(
          `INSERT INTO ticket_reassignments (ticket_id, from_team_id, to_team_id, from_assignee_id, to_assignee_id, reason, reassigned_by)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            ticketId,
            current.team_id,
            team_id !== undefined ? (team_id || null) : current.team_id,
            current.assignee_id,
            assignee_id !== undefined ? (assignee_id || null) : current.assignee_id,
            reason || null,
            req.user.id
          ]
        );

        // Log audit event
        await insertEvent(pool, {
          ticketId,
          actorId: req.user.id,
          type: "ticket.reassigned",
          payload: {
            from_team: current.team_id,
            to_team: team_id !== undefined ? team_id : current.team_id,
            from_assignee: current.assignee_id,
            to_assignee: assignee_id !== undefined ? assignee_id : current.assignee_id,
            reason,
          },
        });

        // On a team-change (triage hand-off): post the requirements note as an
        // internal comment for the receiving team, mark the triage SLA met if the
        // ticket is leaving the NOC queue, then re-point the team SLA to the new
        // team's policy. Order: Reassigned → Comment → Triage met → SLA target set.
        // (Assignee-only reassigns within the same team don't post a note.)
        if (changingTeam) {
          if (reason && reason.trim()) {
            const [cmt] = await pool.query(
              `INSERT INTO ticket_comments (ticket_id, author_id, body, is_public) VALUES (?, ?, ?, 0)`,
              [ticketId, req.user.id, reason.trim()]
            );
            await insertEvent(pool, {
              ticketId, actorId: req.user.id, type: "ticket.commented",
              payload: { commentId: cmt.insertId, isPublic: false, source: "reassign" },
            });
          }

          const nocTeamId = await getNocTeamId(pool);
          if (nocTeamId && current.team_id === nocTeamId) {
            await meetTriageSla(pool, ticketId, req.user.id);
            // Leaving the NOC triage queue → the ticket enters the handling team's
            // queue. Normalize an in-triage status → pending.
            if (current.status_key === "open" || current.status_key === "in_progress") {
              const pendingId = await getLookupId(pool, "ticket_statuses", "pending");
              if (pendingId) {
                await pool.query("UPDATE tickets SET status_id = ? WHERE id = ?", [pendingId, ticketId]);
                await insertEvent(pool, {
                  ticketId, actorId: null, type: "ticket.updated",
                  payload: { changes: { status: { from: current.status_key, to: "pending" } }, auto: true },
                });
              }
            }
          }
          await assignSla(pool, ticketId, current.priority_id, team_id || null);
        }

        // Manager continuing a frozen ticket: reassigning a held (on_hold) or
        // escalated (open manager SLA) ticket back resumes the frozen team SLA,
        // closes the manager's review clock, and returns it to a working state
        // (in_progress if assigned, else the team queue → pending).
        if (current.status_key === "on_hold" || hadOpenMgrSla) {
          await resumeTicketSla(pool, ticketId, req.user.id);
          if (hadOpenMgrSla) await meetManagerSla(pool, ticketId, "reassigned_back", req.user.id);
          const [[after]] = await pool.query("SELECT assignee_id FROM tickets WHERE id = ?", [ticketId]);
          const targetKey = after?.assignee_id ? "in_progress" : "pending";
          const targetId = await getLookupId(pool, "ticket_statuses", targetKey);
          if (targetId && current.status_key !== targetKey) {
            await pool.query("UPDATE tickets SET status_id = ? WHERE id = ?", [targetId, ticketId]);
            await insertEvent(pool, {
              ticketId, actorId: null, type: "ticket.updated",
              payload: { changes: { status: { from: current.status_key, to: targetKey } }, auto: true },
            });
          }
        }

        // Notify the new queue when the team changes (e.g. an SDM re-routing a
        // corporate request to the correct team).
        if (team_id !== undefined && team_id && (team_id || null) !== current.team_id) {
          try {
            const [[tk]] = await pool.query("SELECT ticket_number, subject FROM tickets WHERE id = ?", [ticketId]);
            const [[team]] = await pool.query("SELECT name FROM teams WHERE id = ?", [team_id]);
            const [members] = await pool.query(
              "SELECT user_id FROM team_members WHERE team_id = ? AND user_id <> ?",
              [team_id, req.user.id]
            );
            if (members.length && tk) {
              const rows = members.map((m) => [
                m.user_id, ticketId,
                `Ticket reassigned to ${team?.name || "your team"}`,
                `${tk.ticket_number} — ${tk.subject}`,
                "queue",
              ]);
              await pool.query("INSERT INTO notifications (user_id, ticket_id, title, message, type) VALUES ?", [rows]);
            }
          } catch (notifyErr) {
            console.error("Reassign notification error:", notifyErr);
          }
        }

        return send.ok(res, { ok: true, message: "Ticket reassigned successfully" });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },

    // POST /api/tickets/:id/flag-to-noc
    // A non-NOC engineer sends a misrouted ticket back to the NOC queue for re-routing.
    flagToNoc: async (req, res) => {
      if (!isAgent(req.user)) return send.forbidden(res);
      const ticketId = Number(req.params.id);
      const { reason } = req.body;
      try {
        const [[noc]] = await pool.query(`SELECT id FROM teams WHERE name = 'NOC' LIMIT 1`);
        if (!noc) return send.bad(res, "NOC team is not configured");
        const [[current]] = await pool.query(`SELECT team_id, assignee_id, ticket_number, subject FROM tickets t WHERE id = ?`, [ticketId]);
        if (!current) return send.notFound(res);
        if (current.team_id === noc.id) return send.bad(res, "Ticket is already in the NOC queue");

        // Only the owning team (or its assignee, or an admin) can flag a ticket
        // back to NOC — not a cross-team agent reaching into another queue.
        const flagIsAdmin = (req.user.roles || []).includes("admin");
        if (!flagIsAdmin && current.assignee_id !== req.user.id && !(await isTeamMember(pool, req.user.id, current.team_id))) {
          return send.forbidden(res, "You can only flag back a ticket that's in your team's queue.");
        }

        await pool.query(`UPDATE tickets SET team_id = ?, assignee_id = NULL WHERE id = ?`, [noc.id, ticketId]);
        await pool.query(
          `INSERT INTO ticket_reassignments (ticket_id, from_team_id, to_team_id, from_assignee_id, to_assignee_id, reason, reassigned_by)
           VALUES (?, ?, ?, ?, NULL, ?, ?)`,
          [ticketId, current.team_id, noc.id, current.assignee_id, reason || "Flagged back to NOC for re-routing", req.user.id]
        );
        await insertEvent(pool, { ticketId, actorId: req.user.id, type: "ticket.flagged_to_noc", payload: { from_team: current.team_id, reason: reason || null } });

        // Re-entering the NOC queue (re)starts the triage SLA against the ticket's priority.
        const [[prRow]] = await pool.query(`SELECT priority_id FROM tickets WHERE id = ?`, [ticketId]);
        await startTriageSla(pool, ticketId, prRow?.priority_id ?? null, req.user.id);

        const [members] = await pool.query(`SELECT user_id FROM team_members WHERE team_id = ? AND user_id <> ?`, [noc.id, req.user.id]);
        if (members.length) {
          const rows = members.map((m) => [
            m.user_id, ticketId,
            "Ticket flagged back to NOC",
            `${current.ticket_number} — ${current.subject}. ${reason ? "Reason: " + reason : "Needs re-routing."}`,
            "queue",
          ]);
          await pool.query(`INSERT INTO notifications (user_id, ticket_id, title, message, type) VALUES ?`, [rows]);
        }
        return send.ok(res, { ok: true, message: "Flagged back to the NOC queue for re-routing" });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },

    // GET /api/tickets/:id/teams
    // Get all teams associated with a ticket
    getTicketTeams: async (req, res) => {
      const ticketId = Number(req.params.id);
      try {
        const [rows] = await pool.query(
          `SELECT tt.*, t.name as team_name, u.full_name as assigned_by_name
           FROM ticket_teams tt
           INNER JOIN teams t ON t.id = tt.team_id
           LEFT JOIN users u ON u.id = tt.assigned_by
           WHERE tt.ticket_id = ?
           ORDER BY tt.is_primary DESC, tt.assigned_at ASC`,
          [ticketId]
        );
        return send.ok(res, { teams: rows });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },

    // POST /api/tickets/:id/teams
    // Add a team to a ticket
    addTicketTeam: async (req, res) => {
      if (!isAgent(req.user)) return send.forbidden(res);
      const ticketId = Number(req.params.id);
      const { team_id, is_primary, notes } = req.body;

      if (!team_id) return send.bad(res, "Team ID is required");

      try {
        // Check if team already assigned
        const [existing] = await pool.query(
          `SELECT id FROM ticket_teams WHERE ticket_id = ? AND team_id = ?`,
          [ticketId, team_id]
        );
        if (existing.length > 0) {
          return send.bad(res, "Team is already assigned to this ticket");
        }

        // If setting as primary, unset existing primary
        if (is_primary) {
          await pool.query(
            `UPDATE ticket_teams SET is_primary = 0 WHERE ticket_id = ?`,
            [ticketId]
          );
          // Also update the main ticket's team_id
          await pool.query(`UPDATE tickets SET team_id = ? WHERE id = ?`, [team_id, ticketId]);
        }

        await pool.query(
          `INSERT INTO ticket_teams (ticket_id, team_id, is_primary, assigned_by, notes)
           VALUES (?, ?, ?, ?, ?)`,
          [ticketId, team_id, is_primary ? 1 : 0, req.user.id, notes || null]
        );

        await insertEvent(pool, {
          ticketId,
          actorId: req.user.id,
          type: "ticket.team_added",
          payload: { team_id, is_primary: !!is_primary },
        });

        return send.ok(res, { ok: true, message: "Team added to ticket" });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },

    // DELETE /api/tickets/:id/teams/:teamId
    // Remove a team from a ticket
    removeTicketTeam: async (req, res) => {
      if (!isAgent(req.user)) return send.forbidden(res);
      const ticketId = Number(req.params.id);
      const teamId = Number(req.params.teamId);

      try {
        const [existing] = await pool.query(
          `SELECT is_primary FROM ticket_teams WHERE ticket_id = ? AND team_id = ?`,
          [ticketId, teamId]
        );
        if (existing.length === 0) {
          return send.notFound(res, "Team not assigned to this ticket");
        }

        // Prevent removing primary team
        if (existing[0].is_primary) {
          return send.bad(res, "Cannot remove primary team. Set another team as primary first.");
        }

        await pool.query(
          `DELETE FROM ticket_teams WHERE ticket_id = ? AND team_id = ?`,
          [ticketId, teamId]
        );

        await insertEvent(pool, {
          ticketId,
          actorId: req.user.id,
          type: "ticket.team_removed",
          payload: { team_id: teamId },
        });

        return send.ok(res, { ok: true, message: "Team removed from ticket" });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },

    // PATCH /api/tickets/:id/teams/:teamId
    // Update team assignment (e.g., set as primary, update status)
    updateTicketTeam: async (req, res) => {
      if (!isAgent(req.user)) return send.forbidden(res);
      const ticketId = Number(req.params.id);
      const teamId = Number(req.params.teamId);
      const { is_primary, status, notes } = req.body;

      try {
        const [existing] = await pool.query(
          `SELECT id FROM ticket_teams WHERE ticket_id = ? AND team_id = ?`,
          [ticketId, teamId]
        );
        if (existing.length === 0) {
          return send.notFound(res, "Team not assigned to this ticket");
        }

        // If setting as primary, unset others
        if (is_primary) {
          await pool.query(
            `UPDATE ticket_teams SET is_primary = 0 WHERE ticket_id = ?`,
            [ticketId]
          );
          // Update main ticket's team_id
          await pool.query(`UPDATE tickets SET team_id = ? WHERE id = ?`, [teamId, ticketId]);
        }

        const updates = [];
        const params = [];
        if (is_primary !== undefined) {
          updates.push("is_primary = ?");
          params.push(is_primary ? 1 : 0);
        }
        if (status) {
          updates.push("status = ?");
          params.push(status);
        }
        if (notes !== undefined) {
          updates.push("notes = ?");
          params.push(notes);
        }

        if (updates.length > 0) {
          params.push(ticketId, teamId);
          await pool.query(
            `UPDATE ticket_teams SET ${updates.join(", ")} WHERE ticket_id = ? AND team_id = ?`,
            params
          );
        }

        return send.ok(res, { ok: true, message: "Team assignment updated" });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },

    // POST /api/tickets/:id/teams/:teamId/complete
    // Mark a team's work as complete on a ticket
    completeTeamWork: async (req, res) => {
      if (!isAgent(req.user)) return send.forbidden(res);
      const ticketId = Number(req.params.id);
      const teamId = Number(req.params.teamId);
      const { notes } = req.body;

      try {
        // Verify team is assigned to ticket
        const [existing] = await pool.query(
          `SELECT id, status FROM ticket_teams WHERE ticket_id = ? AND team_id = ?`,
          [ticketId, teamId]
        );
        if (existing.length === 0) {
          return send.notFound(res, "Team not assigned to this ticket");
        }
        if (existing[0].status === "completed") {
          return send.bad(res, "Team has already marked their work as complete");
        }

        // Only a member of that team (or an admin) can mark its work complete —
        // this can auto-resolve the whole ticket, so it must respect team scope.
        const ctwIsAdmin = (req.user.roles || []).includes("admin");
        if (!ctwIsAdmin && !(await isTeamMember(pool, req.user.id, teamId))) {
          return send.forbidden(res, "You can only complete work for your own team.");
        }

        // Mark team's work as complete
        await pool.query(
          `UPDATE ticket_teams
           SET status = 'completed', completed_at = NOW(), completed_by = ?, completion_notes = ?
           WHERE ticket_id = ? AND team_id = ?`,
          [req.user.id, notes || null, ticketId, teamId]
        );

        // Log the event
        await insertEvent(pool, {
          ticketId,
          actorId: req.user.id,
          type: "ticket.team_completed",
          payload: { team_id: teamId, notes },
        });

        // Check if ALL teams have completed their work
        const [allTeams] = await pool.query(
          `SELECT team_id, status FROM ticket_teams WHERE ticket_id = ?`,
          [ticketId]
        );

        const allCompleted = allTeams.length > 0 && allTeams.every(t => t.status === "completed");

        if (allCompleted) {
          // Auto-resolve the ticket since all teams have completed. This is a
          // resolve (not a close), so stamp solved_at — that keeps the ticket
          // eligible for the 3-day auto-close sweep and leaves closed_at for an
          // actual close, matching the update() resolve path.
          const solvedId = await getLookupId(pool, "ticket_statuses", "solved");
          if (solvedId) {
            await pool.query(
              `UPDATE tickets SET status_id = ?, solved_at = NOW() WHERE id = ?`,
              [solvedId, ticketId]
            );

            // Mark SLA resolve as met
            try {
              await pool.query(
                `UPDATE ticket_slas SET resolve_met_at = NOW()
                 WHERE ticket_id = ? AND resolve_met_at IS NULL`,
                [ticketId]
              );
            } catch (_) {}

            // The system resolves the ticket once all teams report done — the
            // engineer only completed their own team's work — so attribute it to
            // System (actorId null) and record who triggered it in the payload.
            await insertEvent(pool, {
              ticketId,
              actorId: null,
              type: "ticket.auto_resolved",
              payload: { reason: "All teams completed their work", triggered_by: req.user.id },
            });
          }

          return send.ok(res, {
            ok: true,
            message: "Team work marked as complete. All teams have finished - ticket has been resolved.",
            allTeamsComplete: true,
            ticketResolved: true,
          });
        }

        // Get remaining active teams
        const activeTeams = allTeams.filter(t => t.status === "active");

        return send.ok(res, {
          ok: true,
          message: "Team work marked as complete",
          allTeamsComplete: false,
          remainingTeams: activeTeams.length,
        });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },

    // POST /api/tickets/:id/teams/:teamId/reopen
    // Reopen a team's work (mark as active again)
    reopenTeamWork: async (req, res) => {
      if (!isAgent(req.user)) return send.forbidden(res);
      const ticketId = Number(req.params.id);
      const teamId = Number(req.params.teamId);

      try {
        const [existing] = await pool.query(
          `SELECT id, status FROM ticket_teams WHERE ticket_id = ? AND team_id = ?`,
          [ticketId, teamId]
        );
        if (existing.length === 0) {
          return send.notFound(res, "Team not assigned to this ticket");
        }
        if (existing[0].status !== "completed") {
          return send.bad(res, "Team work is not marked as complete");
        }

        // Reopen team's work
        await pool.query(
          `UPDATE ticket_teams
           SET status = 'active', completed_at = NULL, completed_by = NULL, completion_notes = NULL
           WHERE ticket_id = ? AND team_id = ?`,
          [ticketId, teamId]
        );

        await insertEvent(pool, {
          ticketId,
          actorId: req.user.id,
          type: "ticket.team_reopened",
          payload: { team_id: teamId },
        });

        // If ticket was auto-resolved, reopen it
        const [ticketRows] = await pool.query(
          `SELECT s.\`key\` AS status_key FROM tickets t
           INNER JOIN ticket_statuses s ON s.id = t.status_id
           WHERE t.id = ?`,
          [ticketId]
        );
        if (ticketRows[0]?.status_key === "solved" || ticketRows[0]?.status_key === "closed") {
          const inProgressId = await getLookupId(pool, "ticket_statuses", "in_progress");
          if (inProgressId) {
            await pool.query(
              `UPDATE tickets SET status_id = ?, closed_at = NULL, reopened_count = COALESCE(reopened_count, 0) + 1 WHERE id = ?`,
              [inProgressId, ticketId]
            );

            await insertEvent(pool, {
              ticketId,
              actorId: req.user.id,
              type: "ticket.reopened",
              payload: { reason: "Team work was reopened" },
            });
          }
        }

        return send.ok(res, { ok: true, message: "Team work reopened" });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },

    // GET /api/tickets/:id/comments
    listComments: async (req, res) => {
      const ticketId = Number(req.params.id);
      try {
        const [ticketRows] = await pool.query(`SELECT requester_id FROM tickets WHERE id = ?`, [
          ticketId,
        ]);
        const ticket = ticketRows[0];
        if (!ticket) return send.notFound(res, "Ticket not found");
        if (!isAgent(req.user) && ticket.requester_id !== req.user.id) {
          return send.forbidden(res);
        }

        const visibilityFilter = isAgent(req.user) ? "" : "AND c.is_public = 1";
        const [rows] = await pool.query(
          `SELECT c.*, u.full_name AS author_name, u.email AS author_email
           FROM ticket_comments c
           INNER JOIN users u ON u.id = c.author_id
           WHERE c.ticket_id = ?
           ${visibilityFilter}
           ORDER BY c.created_at ASC`,
          [ticketId]
        );
        return send.ok(res, { items: rows });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },

    // POST /api/tickets/:id/comments
    addComment: async (req, res) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return send.bad(res, errors.array()[0].msg);

      const ticketId = Number(req.params.id);
      try {
        const [ticketRows] = await pool.query(
          `SELECT t.requester_id, t.first_responded_at, s.\`key\` AS status_key
           FROM tickets t
           INNER JOIN ticket_statuses s ON s.id = t.status_id
           WHERE t.id = ?`,
          [ticketId]
        );
        const ticket = ticketRows[0];
        if (!ticket) return send.notFound(res, "Ticket not found");
        if (!isAgent(req.user) && ticket.requester_id !== req.user.id) {
          return send.forbidden(res);
        }

        const isPublic = isAgent(req.user) ? !!req.body.isPublic : true;
        const [result] = await pool.query(
          `INSERT INTO ticket_comments (ticket_id, author_id, body, is_public)
           VALUES (?, ?, ?, ?)`,
          [ticketId, req.user.id, req.body.body, isPublic ? 1 : 0]
        );

        // Track first response time for SLA
        if (isAgent(req.user) && isPublic && !ticket.first_responded_at) {
          await pool.query("UPDATE tickets SET first_responded_at = NOW() WHERE id = ?", [ticketId]);
          // Mark SLA response as met
          try {
            await pool.query(
              `UPDATE ticket_slas SET response_met_at = NOW()
               WHERE ticket_id = ? AND response_met_at IS NULL`,
              [ticketId]
            );
            await insertEvent(pool, {
              ticketId,
              actorId: req.user.id,
              type: "sla.response_met",
              payload: { agent_name: req.user.full_name || req.user.email },
            });
          } catch (_) {}
        }

        // Auto-transition: an agent's FIRST public reply on a ticket in a handling
        // team's queue advances it pending → in_progress. NOC-triage tickets stay
        // "open" until routed out (a NOC reply during triage doesn't mark it worked).
        // A customer comment never changes status — they reopen via the Reopen button,
        // so a "thank you" on a Solved ticket won't reopen it.
        if (isAgent(req.user) && isPublic && !ticket.first_responded_at &&
            ticket.status_key === "pending") {
          const inProgressId = await getLookupId(pool, "ticket_statuses", "in_progress");
          if (inProgressId) {
            await pool.query("UPDATE tickets SET status_id = ? WHERE id = ?", [inProgressId, ticketId]);
            await insertEvent(pool, {
              ticketId,
              actorId: null,
              type: "ticket.updated",
              payload: { changes: { status: { from: ticket.status_key, to: "in_progress" } }, auto: true },
            });
          }
        }

        await insertEvent(pool, {
          ticketId,
          actorId: req.user.id,
          type: "ticket.commented",
          payload: { commentId: result.insertId, isPublic },
        });

        // @mentions — notify the tagged users (any team; internal coordination).
        const mentionIds = Array.isArray(req.body.mentions)
          ? [...new Set(req.body.mentions.map(Number).filter((n) => n && n !== req.user.id))]
          : [];
        if (mentionIds.length) {
          try {
            const [valid] = await pool.query(`SELECT id FROM users WHERE id IN (?) AND is_active = 1`, [mentionIds]);
            if (valid.length) {
              const [[author]] = await pool.query(`SELECT full_name, email FROM users WHERE id = ?`, [req.user.id]);
              const [[tk]] = await pool.query(`SELECT ticket_number, subject FROM tickets WHERE id = ?`, [ticketId]);
              const actor = author?.full_name || author?.email || "Someone";
              const rows = valid.map((u) => [
                u.id, ticketId,
                `${actor} mentioned you`,
                `${tk.ticket_number} — ${tk.subject}`,
                "mention",
              ]);
              await pool.query(`INSERT INTO notifications (user_id, ticket_id, title, message, type) VALUES ?`, [rows]);
            }
          } catch (mErr) {
            console.error("Mention notification error:", mErr);
          }
        }

        return send.created(res, { id: result.insertId });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },

    // GET /api/tickets/:id/audit
    getAuditTrail: async (req, res) => {
      const ticketId = Number(req.params.id);
      try {
        const [ticketRows] = await pool.query(`SELECT requester_id FROM tickets WHERE id = ?`, [ticketId]);
        const ticket = ticketRows[0];
        if (!ticket) return send.notFound(res, "Ticket not found");
        if (!isAgent(req.user) && ticket.requester_id !== req.user.id) {
          return send.forbidden(res);
        }

        const [rows] = await pool.query(
          `SELECT e.*, u.full_name AS actor_name, u.email AS actor_email
           FROM ticket_events e
           LEFT JOIN users u ON u.id = e.actor_id
           WHERE e.ticket_id = ?
           ORDER BY e.created_at ASC, e.id ASC`,
          [ticketId]
        );

        // Parse payloads
        const parsed = rows.map((row) => ({
          ...row,
          payload: row.payload_json && typeof row.payload_json === "string"
            ? JSON.parse(row.payload_json)
            : row.payload_json || {},
        }));

        // ── Batch ID resolution for human-readable labels ──
        // 1. Collect all referenced IDs per lookup field
        const idSets = {};
        for (const field of Object.keys(LOOKUP_CONFIGS)) {
          idSets[field] = new Set();
        }

        for (const event of parsed) {
          const p = event.payload;
          // ticket.updated events: { changes: { field: { from, to } } }
          if (p.changes) {
            for (const [field, change] of Object.entries(p.changes)) {
              if (idSets[field]) {
                if (change.from != null) idSets[field].add(change.from);
                if (change.to != null) idSets[field].add(change.to);
              }
            }
          }
          // ticket.reassigned events
          if (p.from_team != null) idSets.team_id?.add(p.from_team);
          if (p.to_team != null) idSets.team_id?.add(p.to_team);
          if (p.from_assignee != null) idSets.assignee_id?.add(p.from_assignee);
          if (p.to_assignee != null) idSets.assignee_id?.add(p.to_assignee);
          // ticket.assigned events
          if (p.assignee_id != null) idSets.assignee_id?.add(p.assignee_id);
          if (p.previous_assignee_id != null) idSets.assignee_id?.add(p.previous_assignee_id);
          // ticket.created (routed team) + sla.assigned (team). flagged_to_noc's
          // from_team is already collected above.
          if (p.team_id != null) idSets.team_id?.add(p.team_id);
        }

        // 2. Batch-query each lookup table
        const lookups = {};
        for (const [field, ids] of Object.entries(idSets)) {
          if (ids.size === 0) continue;
          const config = LOOKUP_CONFIGS[field];
          const [lkRows] = await pool.query(
            `SELECT id, ${config.labelCol} AS label FROM ${config.table} WHERE id IN (?)`,
            [[...ids]]
          );
          lookups[field] = new Map(lkRows.map((r) => [r.id, r.label]));
        }

        // Helper to resolve a value for a field
        const resolve = (field, val) => {
          if (val == null) return "None";
          const lk = lookups[field];
          if (lk) return lk.get(val) ?? String(val);
          // Format dates nicely
          if (field === "due_at" || field === "closed_at") {
            return val ? new Date(val).toLocaleString("en-US", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "None";
          }
          return String(val);
        };

        // 3. Enrich events with resolved_changes
        const events = parsed.map((event) => {
          let resolved_changes = null;

          if (event.event_type === "ticket.updated" && event.payload.changes) {
            resolved_changes = Object.entries(event.payload.changes).map(([field, change]) => {
              // Auto-transition events log the raw status key (e.g. "in_progress") under
              // a "status" field — map those to the human label, not the raw key.
              const isStatusKey = field === "status";
              return {
                field,
                label: FIELD_LABELS[field] || field.replace(/_id$/, "").replace(/_/g, " "),
                from_value: isStatusKey ? (STATUS_LABELS[change.from] || change.from) : resolve(field, change.from),
                to_value: isStatusKey ? (STATUS_LABELS[change.to] || change.to) : resolve(field, change.to),
              };
            });
          }

          if (event.event_type === "ticket.reassigned") {
            resolved_changes = [];
            const p = event.payload;
            if (p.from_team != null || p.to_team != null) {
              resolved_changes.push({
                field: "team_id", label: "Team",
                from_value: resolve("team_id", p.from_team),
                to_value: resolve("team_id", p.to_team),
              });
            }
            if (p.from_assignee != null || p.to_assignee != null) {
              resolved_changes.push({
                field: "assignee_id", label: "Assignee",
                from_value: resolve("assignee_id", p.from_assignee),
                to_value: resolve("assignee_id", p.to_assignee),
              });
            }
          }

          if (event.event_type === "ticket.assigned") {
            resolved_changes = [{
              field: "assignee_id", label: "Assignee",
              from_value: resolve("assignee_id", event.payload.previous_assignee_id),
              to_value: resolve("assignee_id", event.payload.assignee_id),
            }];
          }

          // Attach a resolved team name so the timeline shows the routed team for
          // creation / SLA assignment, and the originating team when flagged to NOC.
          if ((event.event_type === "ticket.created" || event.event_type === "sla.assigned") && event.payload.team_id != null) {
            event.routed_team = resolve("team_id", event.payload.team_id);
          }
          if (event.event_type === "ticket.flagged_to_noc" && event.payload.from_team != null) {
            event.from_team_name = resolve("team_id", event.payload.from_team);
          }

          return { ...event, resolved_changes };
        });

        return send.ok(res, { items: events });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },

    // GET /api/tickets/:id/tags
    getTags: async (req, res) => {
      const ticketId = Number(req.params.id);
      try {
        // Check permission - user must be agent or requester of this ticket
        const [ticketRows] = await pool.query(
          `SELECT requester_id FROM tickets WHERE id = ?`,
          [ticketId]
        );
        const ticket = ticketRows[0];
        if (!ticket) return send.notFound(res, "Ticket not found");
        if (!isAgent(req.user) && ticket.requester_id !== req.user.id) {
          return send.forbidden(res);
        }

        const [rows] = await pool.query(
          `SELECT t.id, t.name
           FROM ticket_tags t
           INNER JOIN ticket_tag_links tl ON tl.tag_id = t.id
           WHERE tl.ticket_id = ?
           ORDER BY t.name ASC`,
          [ticketId]
        );
        return send.ok(res, { items: rows });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },

    // POST /api/tickets/:id/tags
    addTag: async (req, res) => {
      if (!isAgent(req.user)) return send.forbidden(res);
      const ticketId = Number(req.params.id);
      const { name } = req.body;
      if (!name || !name.trim()) return send.bad(res, "Tag name required");

      try {
        await pool.query(
          `INSERT INTO ticket_tags (name) VALUES (?) ON DUPLICATE KEY UPDATE name = name`,
          [name.trim().toLowerCase()]
        );
        const [tagRows] = await pool.query(`SELECT id FROM ticket_tags WHERE name = ?`, [name.trim().toLowerCase()]);
        const tagId = tagRows[0]?.id;
        if (!tagId) return send.serverErr(res);

        await pool.query(
          `INSERT IGNORE INTO ticket_tag_links (ticket_id, tag_id) VALUES (?, ?)`,
          [ticketId, tagId]
        );

        await insertEvent(pool, {
          ticketId,
          actorId: req.user.id,
          type: "ticket.tag_added",
          payload: { tag: name.trim().toLowerCase() },
        });

        return send.created(res, { tagId, name: name.trim().toLowerCase() });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },

    // DELETE /api/tickets/:id/tags/:tagId
    removeTag: async (req, res) => {
      if (!isAgent(req.user)) return send.forbidden(res);
      const ticketId = Number(req.params.id);
      const tagId = Number(req.params.tagId);
      try {
        await pool.query(
          `DELETE FROM ticket_tag_links WHERE ticket_id = ? AND tag_id = ?`,
          [ticketId, tagId]
        );

        await insertEvent(pool, {
          ticketId,
          actorId: req.user.id,
          type: "ticket.tag_removed",
          payload: { tagId },
        });

        return send.ok(res, { ok: true });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },

    // GET /api/tickets/:id/satisfaction
    getSatisfaction: async (req, res) => {
      const ticketId = Number(req.params.id);
      try {
        const [rows] = await pool.query(
          `SELECT sr.*, u.full_name as rated_by_name
           FROM satisfaction_ratings sr
           LEFT JOIN users u ON u.id = sr.rated_by
           WHERE sr.ticket_id = ?`,
          [ticketId]
        );
        return send.ok(res, { rating: rows[0] || null });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },

    // POST /api/tickets/:id/satisfaction
    submitSatisfaction: async (req, res) => {
      const ticketId = Number(req.params.id);
      const { rating, comment } = req.body;

      if (!rating || rating < 1 || rating > 5) {
        return send.bad(res, "Rating must be between 1 and 5");
      }

      try {
        // Verify ticket exists and is solved/closed
        const [tickets] = await pool.query(
          `SELECT t.requester_id, s.\`key\` as status_key
           FROM tickets t
           INNER JOIN ticket_statuses s ON s.id = t.status_id
           WHERE t.id = ?`,
          [ticketId]
        );
        if (tickets.length === 0) return send.notFound(res, "Ticket not found");

        const ticket = tickets[0];
        if (ticket.requester_id !== req.user.id) {
          return send.forbidden(res, "Only the requester can rate a ticket");
        }
        if (ticket.status_key !== "solved" && ticket.status_key !== "closed") {
          return send.bad(res, "Ticket must be solved or closed to submit a rating");
        }

        // Upsert satisfaction rating
        await pool.query(
          `INSERT INTO satisfaction_ratings (ticket_id, rating, comment, rated_by)
           VALUES (?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE rating = VALUES(rating), comment = VALUES(comment)`,
          [ticketId, rating, comment || null, req.user.id]
        );

        await insertEvent(pool, {
          ticketId,
          actorId: req.user.id,
          type: "ticket.rated",
          payload: { rating, comment: comment || null },
        });

        return send.ok(res, { ok: true, message: "Rating submitted" });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },

    // GET /api/tags
    listTags: async (_req, res) => {
      try {
        const [rows] = await pool.query(
          `SELECT t.id, t.name, COUNT(tl.ticket_id) AS usage_count
           FROM ticket_tags t
           LEFT JOIN ticket_tag_links tl ON tl.tag_id = t.id
           GROUP BY t.id, t.name
           ORDER BY t.name ASC`
        );
        return send.ok(res, { items: rows });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },
  };
}
