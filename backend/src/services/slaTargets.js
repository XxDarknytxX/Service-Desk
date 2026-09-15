// src/services/slaTargets.js
//
// Targets for the corporate clocks that aren't sla_policies rows:
//   triage          NOC's time to route a request out of the triage queue
//   manager_review  each escalation layer's time to act
// Stored per priority in sla_clock_targets (Corporate → SLA Settings). The
// defaults below are only used if a row is missing (e.g. before the migration).

export const CLOCKS = ["triage", "manager_review"];

const DEFAULT_MINUTES = {
  triage: { low: 120, normal: 60, high: 30, urgent: 15, fallback: 60 },
  manager_review: { low: 240, normal: 120, high: 60, urgent: 30, fallback: 120 },
};

/** Minutes allowed for `clock` at this priority. */
export async function getClockMinutes(pool, clock, priorityId) {
  try {
    const [[row]] = await pool.query(
      `SELECT sct.minutes, tp.\`key\` AS priority_key
         FROM ticket_priorities tp
         LEFT JOIN sla_clock_targets sct ON sct.priority_id = tp.id AND sct.clock = ?
        WHERE tp.id = ?`,
      [clock, priorityId || 0]
    );
    if (row?.minutes) return row.minutes;
    const defaults = DEFAULT_MINUTES[clock];
    return defaults[row?.priority_key] || defaults.fallback;
  } catch (e) {
    // Table missing (migration not run yet) — keep the clocks running.
    console.error(`[SLA targets] ${clock} lookup failed:`, e.message);
    return DEFAULT_MINUTES[clock].fallback;
  }
}
