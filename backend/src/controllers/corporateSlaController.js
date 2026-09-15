// src/controllers/corporateSlaController.js
//
// Corporate → SLA Settings: every clock a corporate request runs on.
//
//   Default SLA     first response + resolution (+ optional at-risk warning) per
//                   priority, for any delivery team without its own SLA
//   Team SLAs       each delivery team can have its own SLA — the same targets
//                   per priority, on 24/7 time or a business-hours schedule
//   NOC triage      NOC's own SLA: time to set the urgency of a "Not sure"
//                   request and route it to a team, per priority
//   Manager review  time each escalation layer has to act, per priority
//
// Storage: the default and team SLAs are corporate sla_policies rows (team NULL
// = default; team + priority = that team's SLA), matched by assignSla in the
// ticket controller. Triage and manager review are sla_clock_targets rows.
//
// NOC sets the urgency during triage; the routed team's SLA for that urgency
// starts when NOC routes the request. Changes apply to clocks that start after
// saving; running clocks keep their due times.
import { CLOCKS } from "../services/slaTargets.js";

const MAX_MINUTES = 365 * 24 * 60;
const isAdmin = (req) => (req.user.roles || []).includes("admin");
const DESCRIPTION = "Corporate delivery SLA — managed in Corporate → SLA Settings";

class Invalid extends Error {}

function minutes(value, label, { allowZero = false } = {}) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < (allowZero ? 0 : 1) || n > MAX_MINUTES) {
    throw new Invalid(`${label} must be a whole number of minutes between ${allowZero ? 0 : 1} and ${MAX_MINUTES}.`);
  }
  return n;
}

function targets(row, label) {
  const response = minutes(row.response_minutes, `${label}: first response`);
  const resolve = minutes(row.resolve_minutes, `${label}: resolution`);
  if (response > resolve) throw new Invalid(`${label}: first response can't be longer than resolution.`);
  const empty = row.notify_at_risk_minutes === null || row.notify_at_risk_minutes === "" || row.notify_at_risk_minutes === undefined;
  const warn = empty ? null : minutes(row.notify_at_risk_minutes, `${label}: at-risk warning`, { allowZero: true });
  if (warn !== null && warn >= resolve) throw new Invalid(`${label}: the at-risk warning must be shorter than the resolution time.`);
  return { response, resolve, warn };
}

/** Teams whose requests run on a delivery SLA: the corporate delivery queues. */
async function deliveryTeams(db) {
  const [teams] = await db.query(
    "SELECT id, name FROM teams WHERE workspace = 'corporate' AND corporate_role = 'queue' ORDER BY name"
  );
  return teams;
}

const toTargets = (p) => ({
  response_minutes: p?.response_minutes ?? null,
  resolve_minutes: p?.resolve_minutes ?? null,
  notify_at_risk_minutes: p?.notify_at_risk_minutes ?? null,
});

export function makeCorporateSlaController(pool) {
  return {
    // GET /api/corporate/sla-settings
    get: async (req, res) => {
      try {
        const [priorities] = await pool.query("SELECT id, `key`, label FROM ticket_priorities ORDER BY id");
        const [policies] = await pool.query(
          `SELECT id, response_minutes, resolve_minutes, notify_at_risk_minutes, applies_to_priority_id,
                  applies_to_team_id, is_default, use_business_hours, business_hours_id, updated_at
             FROM sla_policies
            WHERE workspace = 'corporate' AND policy_type = 'team' AND archived_at IS NULL`
        );
        const [clockRows] = await pool.query("SELECT clock, priority_id, minutes, updated_at FROM sla_clock_targets");
        const [businessHours] = await pool.query("SELECT id, name, timezone, is_default FROM business_hours ORDER BY is_default DESC, name");
        const [[triageTeam]] = await pool.query("SELECT id, name FROM teams WHERE corporate_role = 'triage' ORDER BY id LIMIT 1");
        const teams = await deliveryTeams(pool);

        const defaults = policies.filter((p) => !p.applies_to_team_id);
        const fallback = defaults.find((p) => p.is_default) || defaults[0];
        const defaultFor = (pid) => defaults.find((p) => p.applies_to_priority_id === pid) || fallback;
        const clockOf = (clock, pid) => clockRows.find((r) => r.clock === clock && r.priority_id === pid)?.minutes ?? null;

        const lastChanged = [...policies.map((p) => p.updated_at), ...clockRows.map((r) => r.updated_at)]
          .filter(Boolean).sort((a, b) => new Date(b) - new Date(a))[0] || null;

        return res.json({
          can_edit: isAdmin(req),
          priorities,
          business_hours: businessHours,
          triage_team: triageTeam || null,
          last_changed_at: lastChanged,
          default: {
            use_business_hours: !!fallback?.use_business_hours,
            business_hours_id: fallback?.business_hours_id || null,
            priorities: priorities.map((pr) => ({ priority_id: pr.id, ...toTargets(defaultFor(pr.id)) })),
          },
          teams: teams.map((t) => {
            const own = policies.filter((p) => p.applies_to_team_id === t.id);
            // A team row for one priority, or for "any priority", both count.
            const forPriority = (pid) =>
              own.find((p) => p.applies_to_priority_id === pid) || own.find((p) => !p.applies_to_priority_id) || defaultFor(pid);
            const clockSource = own[0] || fallback;
            return {
              team_id: t.id,
              name: t.name,
              custom: own.length > 0,
              use_business_hours: !!clockSource?.use_business_hours,
              business_hours_id: clockSource?.business_hours_id || null,
              priorities: priorities.map((pr) => ({ priority_id: pr.id, ...toTargets(forPriority(pr.id)) })),
            };
          }),
          triage: priorities.map((pr) => ({ priority_id: pr.id, minutes: clockOf("triage", pr.id) })),
          manager_review: priorities.map((pr) => ({ priority_id: pr.id, minutes: clockOf("manager_review", pr.id) })),
        });
      } catch (e) {
        console.error("corporate SLA settings load error:", e);
        return res.status(500).json({ error: "Couldn't load SLA settings" });
      }
    },

    // PUT /api/corporate/sla-settings — saves the whole page atomically
    save: async (req, res) => {
      if (!isAdmin(req)) return res.status(403).json({ error: "Only administrators can change SLA settings." });
      const body = req.body || {};
      const conn = await pool.getConnection();
      try {
        const [priorities] = await conn.query("SELECT id, `key`, label FROM ticket_priorities ORDER BY id");
        const labelOf = new Map(priorities.map((p) => [p.id, p.label]));
        const teams = await deliveryTeams(conn);
        const teamName = new Map(teams.map((t) => [t.id, t.name]));
        const [bhRows] = await conn.query("SELECT id FROM business_hours");
        const bhIds = new Set(bhRows.map((b) => b.id));

        // ── Validate everything before writing anything ────────────────────
        const parseSla = (sla, name) => {
          if (!sla) throw new Invalid(`${name} is missing.`);
          const useBh = !!sla.use_business_hours;
          const bhId = useBh ? Number(sla.business_hours_id) : null;
          if (useBh && !bhIds.has(bhId)) throw new Invalid(`${name}: choose the business-hours schedule it should follow.`);
          const rows = new Map();
          for (const row of sla.priorities || []) {
            const pid = Number(row.priority_id);
            if (!labelOf.has(pid)) throw new Invalid(`${name}: unknown priority.`);
            rows.set(pid, targets(row, `${name} · ${labelOf.get(pid)}`));
          }
          const missing = priorities.filter((p) => !rows.has(p.id));
          if (missing.length) throw new Invalid(`${name}: set targets for ${missing.map((p) => p.label).join(", ")}.`);
          return { useBh, bhId, rows };
        };

        const defaultSla = parseSla(body.default, "Default SLA");

        const teamSlas = new Map();
        for (const t of body.teams || []) {
          const teamId = Number(t.team_id);
          if (!teamName.has(teamId)) throw new Invalid("Team SLAs can only be set for corporate delivery teams.");
          if (teamSlas.has(teamId)) throw new Invalid(`${teamName.get(teamId)} appears twice.`);
          teamSlas.set(teamId, t.custom ? parseSla(t, `${teamName.get(teamId)} SLA`) : null);
        }

        const clocks = {};
        for (const clock of CLOCKS) {
          const name = clock === "triage" ? "NOC triage SLA" : "Manager review";
          clocks[clock] = new Map();
          for (const row of body[clock] || []) {
            const pid = Number(row.priority_id);
            if (!labelOf.has(pid)) throw new Invalid(`${name}: unknown priority.`);
            clocks[clock].set(pid, minutes(row.minutes, `${name} · ${labelOf.get(pid)}`));
          }
          const gaps = priorities.filter((p) => !clocks[clock].has(p.id));
          if (gaps.length) throw new Invalid(`${name}: set targets for ${gaps.map((p) => p.label).join(", ")}.`);
        }

        // ── Write ─────────────────────────────────────────────────────────
        await conn.beginTransaction();
        const [existing] = await conn.query(
          `SELECT id, applies_to_priority_id, applies_to_team_id FROM sla_policies
            WHERE workspace = 'corporate' AND policy_type = 'team' AND archived_at IS NULL`
        );

        const upsert = async (current, { name, pid, teamId, isDefault, sla, t }) => {
          const values = [name, t.response, t.resolve, t.warn, sla.useBh ? 1 : 0, sla.bhId];
          if (current) {
            await conn.query(
              `UPDATE sla_policies SET name = ?, response_minutes = ?, resolve_minutes = ?, notify_at_risk_minutes = ?,
                      use_business_hours = ?, business_hours_id = ?, is_default = ?
                WHERE id = ?`,
              [...values, isDefault ? 1 : 0, current.id]
            );
            return current.id;
          }
          const [ins] = await conn.query(
            `INSERT INTO sla_policies
               (policy_type, workspace, name, description, response_minutes, resolve_minutes, notify_at_risk_minutes,
                use_business_hours, business_hours_id, applies_to_priority_id, applies_to_team_id, is_default)
             VALUES ('team', 'corporate', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [name, DESCRIPTION, t.response, t.resolve, t.warn, sla.useBh ? 1 : 0, sla.bhId, pid, teamId, isDefault ? 1 : 0]
          );
          return ins.insertId;
        };
        const find = (teamId, pid) =>
          existing.find((e) => (e.applies_to_team_id ?? null) === teamId && (e.applies_to_priority_id ?? null) === pid);

        const kept = new Set();
        // Default SLA: one row per priority, plus the catch-all default row
        // (a request without a priority) which follows Normal.
        for (const pr of priorities) {
          kept.add(await upsert(find(null, pr.id), {
            name: `Corporate default · ${pr.label}`, pid: pr.id, teamId: null, isDefault: false, sla: defaultSla, t: defaultSla.rows.get(pr.id),
          }));
        }
        const normal = priorities.find((p) => p.key === "normal") || priorities[0];
        kept.add(await upsert(find(null, null), {
          name: "Corporate default", pid: null, teamId: null, isDefault: true, sla: defaultSla, t: defaultSla.rows.get(normal.id),
        }));

        // Team SLAs: a custom team gets a row per priority; a team set back to
        // the default loses its rows. Teams not in the request are left alone.
        for (const [teamId, sla] of teamSlas) {
          if (!sla) continue;
          for (const pr of priorities) {
            kept.add(await upsert(find(teamId, pr.id), {
              name: `Corporate · ${teamName.get(teamId)} · ${pr.label}`, pid: pr.id, teamId, isDefault: false, sla, t: sla.rows.get(pr.id),
            }));
          }
        }
        const removable = existing.filter(
          (e) => !kept.has(e.id) && (e.applies_to_team_id === null || teamSlas.has(e.applies_to_team_id))
        );

        // Removed rows: delete, or archive if tickets already ran on them.
        let archived = 0;
        for (const e of removable) {
          const [[used]] = await conn.query("SELECT 1 AS yes FROM ticket_slas WHERE policy_id = ? LIMIT 1", [e.id]);
          if (used) {
            await conn.query("UPDATE sla_policies SET archived_at = NOW(), is_default = 0 WHERE id = ?", [e.id]);
            archived++;
          } else {
            await conn.query("DELETE FROM sla_policies WHERE id = ?", [e.id]);
          }
        }

        for (const clock of CLOCKS) {
          for (const [pid, mins] of clocks[clock]) {
            await conn.query(
              `INSERT INTO sla_clock_targets (clock, priority_id, minutes, updated_by) VALUES (?, ?, ?, ?)
               ON DUPLICATE KEY UPDATE
                 -- updated_by first: MySQL applies assignments left to right.
                 updated_by = IF(minutes <> VALUES(minutes), VALUES(updated_by), updated_by),
                 minutes = VALUES(minutes)`,
              [clock, pid, mins, req.user.id]
            );
          }
        }

        await conn.commit();
        return res.json({ ok: true, archived });
      } catch (e) {
        await conn.rollback().catch(() => {});
        if (e instanceof Invalid) return res.status(400).json({ error: e.message });
        console.error("corporate SLA settings save error:", e);
        return res.status(500).json({ error: "Couldn't save SLA settings" });
      } finally {
        conn.release();
      }
    },
  };
}
