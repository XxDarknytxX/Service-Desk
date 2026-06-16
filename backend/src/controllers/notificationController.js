// src/controllers/notificationController.js
// Serves the per-user notification feed (queue assignments, SDM routing alerts,
// SLA warnings, etc.) that until now were written to the DB but never exposed.
export function makeNotificationController(pool) {
  return {
    // GET /api/notifications
    list: async (req, res) => {
      try {
        const [rows] = await pool.query(
          `SELECT n.id, n.title, n.message, n.type, n.is_read, n.created_at,
                  n.ticket_id, t.ticket_number
           FROM notifications n
           LEFT JOIN tickets t ON t.id = n.ticket_id
           WHERE n.user_id = ?
           ORDER BY n.created_at DESC
           LIMIT 50`,
          [req.user.id]
        );
        const [[{ unread }]] = await pool.query(
          `SELECT COUNT(*) AS unread FROM notifications WHERE user_id = ? AND is_read = 0`,
          [req.user.id]
        );
        res.json({ items: rows, unread });
      } catch (e) {
        console.error(e);
        res.status(500).json({ error: "Failed to load notifications" });
      }
    },

    // POST /api/notifications/:id/read
    markRead: async (req, res) => {
      try {
        await pool.query(
          `UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?`,
          [Number(req.params.id), req.user.id]
        );
        res.json({ ok: true });
      } catch (e) {
        console.error(e);
        res.status(500).json({ error: "Failed to update notification" });
      }
    },

    // POST /api/notifications/read-all
    markAllRead: async (req, res) => {
      try {
        await pool.query(
          `UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0`,
          [req.user.id]
        );
        res.json({ ok: true });
      } catch (e) {
        console.error(e);
        res.status(500).json({ error: "Failed to update notifications" });
      }
    },
  };
}
