/**
 * Status lifecycle migration (idempotent, additive).
 * Ensures ticket_statuses = {draft, open, pending, in_progress, on_hold, solved, closed}
 * with correct labels / is_closed / sort_order. Retires "new" once no ticket uses it.
 * Run:  node src/config/status-lifecycle-migration.js
 * NEVER run fresh-migration.js (it drops the DB).
 */
import mysql from "mysql2/promise";
import dotenv from "dotenv";
dotenv.config();

const unquote = (v) => (v || "").replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");
const DB = unquote(process.env.DATABASE_NAME);
const pool = mysql.createPool({
  host: process.env.DATABASE_HOST,
  port: Number(process.env.DATABASE_PORT) || 3306,
  user: unquote(process.env.DATABASE_USER),
  password: unquote(process.env.DATABASE_PASSWORD),
  database: DB,
});

const STATUSES = [
  ["draft",       "Draft",       0, 1],
  ["open",        "Open",        0, 2],
  ["pending",     "Pending",     0, 3],
  ["in_progress", "In Progress", 0, 4],
  ["on_hold",     "On Hold",     0, 5],
  ["solved",      "Solved",      1, 6],
  ["closed",      "Closed",      1, 7],
];

async function run() {
  const conn = await pool.getConnection();
  try {
    // A. Upsert the seven target statuses (insert missing, fix labels/is_closed/sort_order).
    for (const [key, label, isClosed, sort] of STATUSES) {
      await conn.query(
        `INSERT INTO ticket_statuses (\`key\`, label, is_closed, sort_order)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE label = VALUES(label), is_closed = VALUES(is_closed), sort_order = VALUES(sort_order)`,
        [key, label, isClosed, sort]
      );
    }
    console.log("Upserted 7 lifecycle statuses (draft, open, pending, in_progress, on_hold, solved, closed)");

    // B. Retire "new": only if NO ticket still references it (Phase 5 empties tickets).
    const [[newRow]] = await conn.query("SELECT id FROM ticket_statuses WHERE `key` = 'new'");
    if (newRow) {
      const [[{ cnt }]] = await conn.query(
        "SELECT COUNT(*) AS cnt FROM tickets WHERE status_id = ?", [newRow.id]
      );
      if (cnt === 0) {
        await conn.query("DELETE FROM ticket_statuses WHERE id = ?", [newRow.id]);
        console.log("Retired 'new' status (no tickets referenced it)");
      } else {
        console.warn(`'new' still referenced by ${cnt} ticket(s) — left in place. Re-run after the ticket wipe.`);
      }
    }

    const [rows] = await conn.query("SELECT `key`, label, is_closed, sort_order FROM ticket_statuses ORDER BY sort_order");
    console.table(rows);
  } finally {
    conn.release();
    await pool.end();
  }
}
run().catch((e) => { console.error(e); process.exit(1); });
