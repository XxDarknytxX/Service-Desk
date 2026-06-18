/**
 * Manager SLA Migration
 * Adds a "manager review" SLA, tracked separately from the team
 * response/resolve SLA and the NOC triage SLA so all three can be shown at once.
 *
 * A manager SLA is a single deadline for the team manager (lead) to act once a
 * ticket is escalated to them: it starts on escalate-to-manager and is met when
 * the manager either reassigns the ticket back to an engineer (with a comment)
 * or resolves it. Priority-based targets: Urgent 30m / High 60m / Normal 120m /
 * Low 240m.
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

    // Per-ticket manager SLA tracking. One row per ticket (upserted on ticket_id
    // so a re-escalation restarts the clock). Lives in its own table so neither
    // the team SLA re-point nor the triage clock can clobber it.
    await conn.query(`
      CREATE TABLE IF NOT EXISTS ticket_manager_slas (
        id INT AUTO_INCREMENT PRIMARY KEY,
        ticket_id INT NOT NULL,
        manager_id INT NULL COMMENT 'The team manager (lead) the ticket was escalated to',
        priority_id INT NULL COMMENT 'Priority at the time the clock started',
        target_minutes INT NOT NULL COMMENT 'Minutes the manager had to act',

        -- Timing
        due_at DATETIME NOT NULL,
        started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        met_at DATETIME NULL COMMENT 'Set when the manager reassigns back or resolves',

        -- Status
        breached TINYINT(1) NOT NULL DEFAULT 0,
        outcome ENUM('pending','reassigned_back','resolved') NOT NULL DEFAULT 'pending',

        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

        CONSTRAINT fk_tms_ticket FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,

        UNIQUE KEY uk_tms_ticket (ticket_id),
        INDEX idx_tms_due (due_at),
        INDEX idx_tms_breached (breached),
        INDEX idx_tms_status (met_at, breached)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("  Created ticket_manager_slas table");

    await conn.commit();
    console.log("\nManager SLA migration completed successfully!");
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
