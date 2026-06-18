/**
 * Triage SLA Migration
 * Adds a NOC "reassign-on-time" SLA, tracked separately from the team
 * response/resolve SLA so both can be shown at once.
 *
 * A triage SLA is a single deadline for the NOC queue to route a ticket out
 * to the correct team. It starts when a ticket enters the NOC queue (create
 * routed to NOC, or flag-to-NOC) and is met when NOC reassigns it to another
 * team. Priority-based targets: Urgent 15m / High 30m / Normal 60m / Low 120m.
 *
 * Idempotent + additive — safe to run repeatedly. Never drops anything.
 */

import mysql from "mysql2/promise";
import dotenv from "dotenv";
dotenv.config();

const pool = mysql.createPool({
  host: process.env.DATABASE_HOST,
  port: Number(process.env.DATABASE_PORT) || 3306,
  user: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD,
  database: process.env.DATABASE_NAME,
});

async function migrate() {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Per-ticket triage SLA tracking. One row per ticket (upserted on ticket_id
    // so a flag-back-to-NOC restarts the clock). Lives in its own table so the
    // team SLA re-point (assignSla's ON DUPLICATE KEY UPDATE on ticket_slas)
    // can never clobber it.
    await conn.query(`
      CREATE TABLE IF NOT EXISTS ticket_triage_slas (
        id INT AUTO_INCREMENT PRIMARY KEY,
        ticket_id INT NOT NULL,
        priority_id INT NULL COMMENT 'Priority at the time the clock started',
        target_minutes INT NOT NULL COMMENT 'Minutes NOC had to reassign',

        -- Timing
        due_at DATETIME NOT NULL,
        started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        met_at DATETIME NULL COMMENT 'Set when NOC reassigns the ticket out of the queue',

        -- Status
        breached TINYINT(1) NOT NULL DEFAULT 0,

        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

        CONSTRAINT fk_tts_ticket FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,

        UNIQUE KEY uk_tts_ticket (ticket_id),
        INDEX idx_tts_due (due_at),
        INDEX idx_tts_breached (breached),
        INDEX idx_tts_status (met_at, breached)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("  Created ticket_triage_slas table");

    await conn.commit();
    console.log("\nTriage SLA migration completed successfully!");
  } catch (err) {
    await conn.rollback();
    console.error("Migration failed:", err.message);
    throw err;
  } finally {
    conn.release();
    await pool.end();
  }
}

migrate().catch(() => process.exit(1));
