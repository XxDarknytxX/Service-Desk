// src/controllers/dashboardController.js
const send = {
  ok: (res, data = {}) => res.json(data),
  serverErr: (res, msg = "Internal server error") => res.status(500).json({ error: msg }),
};

function isAgent(user) {
  return (user.roles || []).includes("admin") || (user.roles || []).includes("agent");
}

function parsePayload(raw) {
  if (raw === null || raw === undefined) return null;
  if (Buffer.isBuffer(raw)) {
    raw = raw.toString("utf8");
  }
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch (err) {
      console.warn("Invalid payload_json, returning raw string.");
      return { raw };
    }
  }
  if (typeof raw === "object") return raw;
  return { raw };
}

export function makeDashboardController(pool) {
  return {
    // GET /api/dashboard
    summary: async (req, res) => {
      try {
        const filter = [];
        const params = [];

        if (!isAgent(req.user)) {
          filter.push("t.requester_id = ?");
          params.push(req.user.id);
        }

        // Drafts are unsubmitted — keep them out of dashboard aggregates + recent
        // (avoids leaking other users' drafts to agents, and dead-linking in Recent).
        filter.push("s.`key` <> 'draft'");

        const where = filter.length ? `WHERE ${filter.join(" AND ")}` : "";

        const [rows] = await pool.query(
          `SELECT s.\`key\` AS status_key, s.label AS status_label, COUNT(*) AS total
           FROM tickets t
           INNER JOIN ticket_statuses s ON s.id = t.status_id
           ${where}
           GROUP BY s.\`key\`, s.label
           ORDER BY s.sort_order`,
          params
        );

        const [recent] = await pool.query(
          `SELECT t.id, t.ticket_number, t.subject, t.created_at, s.label AS status_label
           FROM tickets t
           INNER JOIN ticket_statuses s ON s.id = t.status_id
           ${where}
           ORDER BY t.created_at DESC
           LIMIT 14`,
          params
        );

        // Get recent activity (last 10 events across all tickets)
        const activityFilter = isAgent(req.user) ? "" : `WHERE t.requester_id = ?`;
        const activityParams = isAgent(req.user) ? [] : [req.user.id];
        const [activity] = await pool.query(
          `SELECT e.id, e.ticket_id, e.event_type, e.payload_json, e.created_at,
                  u.full_name AS actor_name, u.email AS actor_email,
                  t.ticket_number, t.subject
           FROM ticket_events e
           LEFT JOIN users u ON u.id = e.actor_id
           INNER JOIN tickets t ON t.id = e.ticket_id
           ${activityFilter}
           ORDER BY e.created_at DESC
           LIMIT 15`,
          activityParams
        );

        const activityFeed = activity.map((a) => ({
          ...a,
          payload: parsePayload(a.payload_json),
        }));

        // Get counts for quick stats
        const [openCount] = await pool.query(
          `SELECT COUNT(*) as count FROM tickets t
           INNER JOIN ticket_statuses s ON s.id = t.status_id
           WHERE s.\`key\` IN ('open', 'pending', 'in_progress') ${!isAgent(req.user) ? 'AND t.requester_id = ?' : ''}`,
          isAgent(req.user) ? [] : [req.user.id]
        );

        const [urgentCount] = await pool.query(
          `SELECT COUNT(*) as count FROM tickets t
           INNER JOIN ticket_priorities p ON p.id = t.priority_id
           INNER JOIN ticket_statuses s ON s.id = t.status_id
           WHERE p.\`key\` IN ('high', 'urgent') AND s.is_closed = 0 AND s.\`key\` != 'draft'
           ${!isAgent(req.user) ? 'AND t.requester_id = ?' : ''}`,
          isAgent(req.user) ? [] : [req.user.id]
        );

        return send.ok(res, {
          statusBuckets: rows,
          recentTickets: recent,
          activityFeed,
          quickStats: {
            openTickets: openCount[0]?.count || 0,
            urgentTickets: urgentCount[0]?.count || 0,
          },
        });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },
  };
}
