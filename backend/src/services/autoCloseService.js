// src/services/autoCloseService.js
// Auto-close tickets that have sat in "Solved" without the customer confirming
// or reopening. Default window: 3 days. Runs from the background cron.
//
// A ticket's solved_at is stamped when it is marked Solved (see
// ticketController.update), so it measures how long it has waited in Solved.
// Reopening clears solved_at, which resets the clock. closed_at stays reserved
// for an actual close.
//
// The sweep is bounded (BATCH_LIMIT per run) and notifies the requester, so a
// backlog can never close silently or all at once.

const BATCH_LIMIT = 100;

export async function autoCloseSolvedTickets(pool, days = 3) {
  const window = Number.isInteger(days) && days > 0 ? days : 3;
  try {
    const [[solvedStatus]] = await pool.query(
      "SELECT id FROM ticket_statuses WHERE `key` = 'solved' LIMIT 1"
    );
    const [[closedStatus]] = await pool.query(
      "SELECT id FROM ticket_statuses WHERE `key` = 'closed' LIMIT 1"
    );
    if (!solvedStatus || !closedStatus) return 0;

    const [rows] = await pool.query(
      `SELECT id, requester_id, ticket_number, subject FROM tickets
       WHERE status_id = ?
         AND solved_at IS NOT NULL
         AND solved_at < (NOW() - INTERVAL ${window} DAY)
       ORDER BY solved_at ASC
       LIMIT ${BATCH_LIMIT}`,
      [solvedStatus.id]
    );
    if (rows.length === 0) return 0;

    const ids = rows.map((r) => r.id);
    await pool.query(`UPDATE tickets SET status_id = ? WHERE id IN (?)`, [closedStatus.id, ids]);

    for (const t of rows) {
      await pool.query(
        `INSERT INTO ticket_events (ticket_id, event_type, payload_json)
         VALUES (?, 'ticket.updated', ?)`,
        [t.id, JSON.stringify({
          changes: { status: { from: "solved", to: "closed" } },
          auto: true,
          reason: `Auto-closed after ${window} days in Solved`,
        })]
      );
      // Tell the requester their ticket closed, so it's never a silent close and
      // they can reopen if it wasn't actually resolved.
      if (t.requester_id) {
        try {
          await pool.query(
            `INSERT INTO notifications (user_id, ticket_id, title, message, type)
             VALUES (?, ?, ?, ?, 'info')`,
            [
              t.requester_id,
              t.id,
              `Ticket closed: ${t.ticket_number || "#" + t.id}`,
              `"${t.subject || "Your ticket"}" was automatically closed after ${window} days in Solved. Reopen it if you still need help.`,
            ]
          );
        } catch (_) { /* notifications are best-effort */ }
      }
    }
    console.log(`[Auto-close] Closed ${ids.length} solved ticket(s) after ${window}d in Solved`);
    return ids.length;
  } catch (e) {
    console.error("[Auto-close] error:", e.message);
    return 0;
  }
}
