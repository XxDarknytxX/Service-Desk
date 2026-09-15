/**
 * SLA history + conversation attachments migration.
 *
 *   SLA cycles — reopening a ticket starts a NEW set of SLAs; the previous set
 *   stays on record instead of being overwritten.
 *     ticket_slas.cycle / cycle_started_at     which cycle the live team SLA is
 *     ticket_triage_slas.cycle                 which cycle the live triage clock is
 *     ticket_sla_history                       one row per finished clock per cycle
 *       (kind 'team': response + resolution; kind 'triage': the NOC clock),
 *       with its due / met / breached state frozen at the moment it ended.
 *
 *   Attachments — files on the conversation (and on the request itself).
 *     ticket_attachments.comment_id            NULL = attached to the request
 *     ticket_attachments.storage_path          relative to UPLOAD_DIR
 *
 * Idempotent and additive.
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

const colExists = async (c, table, col) =>
  (await c.query("SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME=? AND COLUMN_NAME=?", [DB, table, col]))[0].length > 0;
const tableExists = async (c, table) =>
  (await c.query("SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=? AND TABLE_NAME=?", [DB, table]))[0].length > 0;
const indexExists = async (c, table, index) =>
  (await c.query("SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA=? AND TABLE_NAME=? AND INDEX_NAME=?", [DB, table, index]))[0].length > 0;

async function migrate() {
  const conn = await pool.getConnection();
  try {
    // ── SLA cycles ─────────────────────────────────────────────────────────
    if (await tableExists(conn, "ticket_slas")) {
      if (!(await colExists(conn, "ticket_slas", "cycle"))) {
        await conn.query("ALTER TABLE ticket_slas ADD COLUMN cycle INT NOT NULL DEFAULT 1 AFTER policy_id");
        console.log("  + ticket_slas.cycle");
      }
      if (!(await colExists(conn, "ticket_slas", "cycle_started_at"))) {
        await conn.query("ALTER TABLE ticket_slas ADD COLUMN cycle_started_at DATETIME NULL AFTER cycle");
        await conn.query("UPDATE ticket_slas SET cycle_started_at = created_at WHERE cycle_started_at IS NULL");
        console.log("  + ticket_slas.cycle_started_at");
      }
    }
    if (await tableExists(conn, "ticket_triage_slas") && !(await colExists(conn, "ticket_triage_slas", "cycle"))) {
      await conn.query("ALTER TABLE ticket_triage_slas ADD COLUMN cycle INT NOT NULL DEFAULT 1");
      console.log("  + ticket_triage_slas.cycle");
    }
    if (!(await tableExists(conn, "ticket_sla_history"))) {
      await conn.query(`
        CREATE TABLE ticket_sla_history (
          id INT AUTO_INCREMENT PRIMARY KEY,
          ticket_id INT NOT NULL,
          cycle INT NOT NULL,
          kind ENUM('team','triage') NOT NULL,
          policy_id INT NULL,
          policy_name VARCHAR(160) NULL,
          team_id INT NULL,
          team_name VARCHAR(120) NULL,
          priority_id INT NULL,
          priority_label VARCHAR(60) NULL,
          started_at DATETIME NULL,
          response_due_at DATETIME NULL,
          response_met_at DATETIME NULL,
          response_breached TINYINT(1) NOT NULL DEFAULT 0,
          resolve_due_at DATETIME NULL,
          resolve_met_at DATETIME NULL,
          resolve_breached TINYINT(1) NOT NULL DEFAULT 0,
          target_minutes INT NULL,
          due_at DATETIME NULL,
          met_at DATETIME NULL,
          breached TINYINT(1) NOT NULL DEFAULT 0,
          paused_at DATETIME NULL,
          ended_at DATETIME NOT NULL,
          ended_reason VARCHAR(40) NOT NULL DEFAULT 'reopened',
          ended_by INT NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          KEY idx_tsh_ticket (ticket_id, cycle),
          CONSTRAINT fk_tsh_ticket FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      console.log("  + ticket_sla_history");
    }

    // ── Attachments ────────────────────────────────────────────────────────
    if (await tableExists(conn, "ticket_attachments")) {
      if (!(await colExists(conn, "ticket_attachments", "comment_id"))) {
        await conn.query("ALTER TABLE ticket_attachments ADD COLUMN comment_id INT NULL AFTER ticket_id");
        console.log("  + ticket_attachments.comment_id");
      }
      if (!(await indexExists(conn, "ticket_attachments", "idx_ticket_attachments_comment"))) {
        await conn.query("ALTER TABLE ticket_attachments ADD INDEX idx_ticket_attachments_comment (comment_id)");
      }
      if (!(await indexExists(conn, "ticket_attachments", "fk_ticket_attachments_comment"))) {
        const [[fk]] = await conn.query(
          "SELECT COUNT(*) AS n FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=? AND TABLE_NAME='ticket_attachments' AND CONSTRAINT_NAME='fk_ticket_attachments_comment'",
          [DB]
        );
        if (!fk.n) {
          await conn.query(
            "ALTER TABLE ticket_attachments ADD CONSTRAINT fk_ticket_attachments_comment FOREIGN KEY (comment_id) REFERENCES ticket_comments(id) ON DELETE CASCADE"
          );
        }
      }
    } else {
      await conn.query(`
        CREATE TABLE ticket_attachments (
          id INT AUTO_INCREMENT PRIMARY KEY,
          ticket_id INT NOT NULL,
          comment_id INT NULL,
          uploaded_by INT NOT NULL,
          file_name VARCHAR(255) NOT NULL,
          file_type VARCHAR(120) NULL,
          file_size INT NULL,
          storage_path VARCHAR(255) NOT NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          KEY idx_ticket_attachments_ticket (ticket_id),
          KEY idx_ticket_attachments_comment (comment_id),
          CONSTRAINT fk_ticket_attachments_ticket FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
          CONSTRAINT fk_ticket_attachments_comment FOREIGN KEY (comment_id) REFERENCES ticket_comments(id) ON DELETE CASCADE,
          CONSTRAINT fk_ticket_attachments_user FOREIGN KEY (uploaded_by) REFERENCES users(id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      console.log("  + ticket_attachments");
    }

    console.log("sla-history-attachments migration completed.");
  } catch (e) {
    console.error("Migration failed:", e.message);
    throw e;
  } finally {
    conn.release();
    await pool.end();
  }
}

migrate().catch(() => process.exit(1));
