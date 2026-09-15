// src/controllers/corporateSlaController.js
//
// Corporate → SLA Settings: every clock a corporate request runs on, in one
// place.
//
//   Delivery      first response + resolution targets per priority (and an
//                 optional at-risk warning), with optional per-team overrides.
//                 Stored as corporate sla_policies rows. Runs on 24/7 time or a
//                 business-hours schedule.
//   NOC triage    time to route a request out of the triage queue, per priority
//   Manager review  time each escalation layer has to act, per priority
//                 (both in sla_clock_targets)
//
// Changes apply to clocks that start after saving; running clocks keep their
// due times.
import { CLOCKS } from "../services/slaTargets.js";
import { isLayerRole } from "../utils/corporateRoles.js";

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
  const warn = row.notify_at_risk_minutes === null || row.notify_at_risk_minutes === "" || row.notify_at_risk_minutes === undefined
    ? null
    : minutes(row.notify_at_risk_minutes, `${label}: at-risk warning`, { allowZero: true });
  if (warn !== null && warn >= resolve) throw new Invalid(`${label}: the at-risk warning must be shorter than the resolution time.`);
  return { response, resolve, warn };
}

async function loadTeams(pool) {
  const [teams] = await pool.query(
    "SELECT id, name, corporate_role FROM teams WHERE workspace = 'corporate' ORDER BY name"
  );
  // Hierarchy teams (business / executive) never hold tickets, so no SLA.
  return teams.filter((t) => !isLayerRole(t.corporate_role));
}

export function makeCorporateSlaController(pool) {
  return {
    // GET /api/corporate/sla-settings
    get: async (req, res) => {
      try {
        const [priorities] = await pool.query("SELECT id, `key`, label FROM ticket_priorities ORDER BY id");
        const [policies] = await pool.query(
          `SELECT sp.id, sp.name, sp.response_minutes, sp.resolve_minutes, sp.notify_at_risk_minutes,
                  sp.applies_to_priority_id, sp.applies_to_team_id, sp.is_default,
                  sp.use_business_hours, sp.business_hours_id, sp.updated_at, t.name AS team_name
             FROM sla_policies sp LEFT JOIN teams t ON t.id = sp.applies_to_team_id
            WHERE sp.workspace = 'corporate' AND sp.policy_type = 'team' AND sp.archived_at IS NULL
            ORDER BY t.name, sp.applies_to_priority_id`
        );
        const [clockRows] = await pool.query("SELECT clock, priority_id, minutes, updated_at FROM sla_clock_targets");
        const [businessHours] = await pool.query("SELECT id, name, timezone, is_default FROM business_hours ORDER BY is_default DESC, name");

        const base = policies.filter((p) => !p.applies_to_team_id);
        const byPriority = (pid) => base.find((p) => p.applies_to_priority_id === pid);
        const fallback = base.find((p) => p.is_default) || base[0];
        const clockOf = (clock, pid) => clockRows.find((r) => r.clock === clock && r.priority_id === pid)?.minutes ?? null;
        const clockSource = fallback || policies[0];

        const lastChanged = [...policies.map((p) => p.updated_at), ...clockRows.map((r) => r.updated_at)]
          .filter(Boolean).sort((a, b) => new Date(b) - new Date(a))[0] || null;

        return res.json({
          can_edit: isAdmin(req),
          priorities,
          business_hours: businessHours,
          teams: await loadTeams(pool),
          last_changed_at: lastChanged,
          delivery: {
            use_business_hours: !!clockSource?.use_business_hours,
            business_hours_id: clockSource?.business_hours_id || null,
            priorities: priorities.map((pr) => {
              const p = byPriority(pr.id) || fallback;
              return {
                priority_id: pr.id,
                response_minutes: p?.response_minutes ?? null,
                resolve_minutes: p?.resolve_minutes ?? null,
                notify_at_risk_minutes: p?.notify_at_risk_minutes ?? null,
              };
            }),
            overrides: policies
              .filter((p) => p.applies_to_team_id)
              .map((p) => ({
                id: p.id,
                team_id: p.applies_to_team_id,
                team_name: p.team_name,
                priority_id: p.applies_to_priority_id,
                response_minutes: p.response_minutes,
                resolve_minutes: p.resolve_minutes,
                notify_at_risk_minutes: p.notify_at_risk_minutes,
              })),
          },
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
        const teams = await loadTeams(conn);
        const teamName = new Map(teams.map((t) => [t.id, t.name]));

        // ── Validate everything before writing anything ────────────────────
        const delivery = body.delivery || {};
        const useBh = !!delivery.use_business_hours;
        let bhId = null;
        if (useBh) {
          const [[bh]] = await conn.query("SELECT id FROM business_hours WHERE id = ?", [Number(delivery.business_hours_id) || 0]);
          if (!bh) throw new Invalid("Choose the business-hours schedule the delivery SLA should follow.");
          bhId = bh.id;
        }

        const base = new Map();
        for (const row of delivery.priorities || []) {
          const pid = Number(row.priority_id);
          if (!labelOf.has(pid)) throw new Invalid("Unknown priority in delivery targets.");
          base.set(pid, targets(row, labelOf.get(pid)));
        }
        const missing = priorities.filter((p) => !base.has(p.id));
        if (missing.length) throw new Invalid(`Set delivery targets for ${missing.map((p) => p.label).join(", ")}.`);

        const overrides = [];
        const seen = new Set();
        for (const row of delivery.overrides || []) {
          const teamId = Number(row.team_id);
          const pid = row.priority_id ? Number(row.priority_id) : null;
          if (!teamName.has(teamId)) throw new Invalid("Team overrides must use a corporate delivery team.");
          if (pid !== null && !labelOf.has(pid)) throw new Invalid("Unknown priority in a team override.");
          const key = `${teamId}:${pid ?? "any"}`;
          const label = `${teamName.get(teamId)} · ${pid ? labelOf.get(pid) : "any priority"}`;
          if (seen.has(key)) throw new Invalid(`${label} is set twice.`);
          seen.add(key);
          overrides.push({ id: row.id ? Number(row.id) : null, teamId, pid, label, ...targets(row, label) });
        }

        const clocks = {};
        for (const clock of CLOCKS) {
          const name = clock === "triage" ? "NOC triage" : "Manager review";
          clocks[clock] = new Map();
          for (const row of body[clock] || []) {
            const pid = Number(row.priority_id);
            if (!labelOf.has(pid)) throw new Invalid(`Unknown priority in ${name}.`);
            clocks[clock].set(pid, minutes(row.minutes, `${name}: ${labelOf.get(pid)}`));
          }
          const gaps = priorities.filter((p) => !clocks[clock].has(p.id));
          if (gaps.length) throw new Invalid(`Set ${name} targets for ${gaps.map((p) => p.label).join(", ")}.`);
        }

        // ── Write ─────────────────────────────────────────────────────────
        await conn.beginTransaction();
        const [existing] = await conn.query(
          `SELECT id, applies_to_priority_id, applies_to_team_id, is_default FROM sla_policies
            WHERE workspace = 'corporate' AND policy_type = 'team' AND archived_at IS NULL`
        );

        const upsert = async (current, { name, pid, teamId, response, resolve, warn, isDefault }) => {
          const values = [name, response, resolve, warn, useBh ? 1 : 0, bhId];
          if (current) {
            await conn.query(
              `UPDATE sla_policies SET name = ?, response_minutes = ?, resolve_minutes = ?, notify_at_risk_minutes = ?,
                      use_business_hours = ?, business_hours_id = ?, applies_to_priority_id = ?, applies_to_team_id = ?, is_default = ?
                WHERE id = ?`,
              [...values, pid, teamId, isDefault ? 1 : 0, current.id]
            );
            return current.id;
          }
          const [ins] = await conn.query(
            `INSERT INTO sla_policies
               (policy_type, workspace, name, description, response_minutes, resolve_minutes, notify_at_risk_minutes,
                use_business_hours, business_hours_id, applies_to_priority_id, applies_to_team_id, is_default)
             VALUES ('team', 'corporate', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [name, DESCRIPTION, response, resolve, warn, useBh ? 1 : 0, bhId, pid, teamId, isDefault ? 1 : 0]
          );
          return ins.insertId;
        };

        const kept = new Set();
        for (const pr of priorities) {
          const current = existing.find((e) => !e.applies_to_team_id && e.applies_to_priority_id === pr.id);
          kept.add(await upsert(current, { name: `Corporate · ${pr.label}`, pid: pr.id, teamId: null, ...base.get(pr.id), isDefault: false }));
        }
        // Default (a request without a priority) follows Normal.
        const normal = priorities.find((p) => p.key === "normal") || priorities[0];
        const currentDefault = existing.find((e) => !e.applies_to_team_id && !e.applies_to_priority_id);
        kept.add(await upsert(currentDefault, { name: "Corporate · Default", pid: null, teamId: null, ...base.get(normal.id), isDefault: true }));

        for (const o of overrides) {
          const current = (o.id && existing.find((e) => e.id === o.id && e.applies_to_team_id))
            || existing.find((e) => e.applies_to_team_id === o.teamId && (e.applies_to_priority_id ?? null) === o.pid && !kept.has(e.id));
          kept.add(await upsert(current, { name: `Corporate · ${o.label}`, pid: o.pid, teamId: o.teamId, ...o, isDefault: false }));
        }

        // Overrides that were removed: delete, or archive if tickets used them.
        let archived = 0;
        for (const e of existing.filter((x) => !kept.has(x.id))) {
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
