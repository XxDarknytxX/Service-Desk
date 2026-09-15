/**
 * Team collaboration migration — several teams working one request, each on
 * its own SLA, with partial resolution.
 *
 *   ticket_teams.seq               1 = the team the request was assigned to,
 *                                  2, 3 … = teams added to collaborate, in order
 *   ticket_team_slas               the response + resolution SLA of each
 *                                  collaborating team (team 1 keeps ticket_slas)
 *   ticket_sla_history.team_seq    which team an archived SLA belonged to
 *   status 'partially_resolved'    some teams have finished their part, others
 *                                  are still working (not closed)
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

async function migrate() {
  const conn = await pool.getConnection();
  try {
    // ── ticket_teams.seq ───────────────────────────────────────────────────
    if (await tableExists(conn, "ticket_teams") && !(await colExists(conn, "ticket_teams", "seq"))) {
      await conn.query("ALTER TABLE ticket_teams ADD COLUMN seq INT NULL AFTER is_primary");
      // Existing rows: primary first, then by when they were added.
      await conn.query(`
        UPDATE ticket_teams tt
          JOIN (SELECT id, ROW_NUMBER() OVER (PARTITION BY ticket_id ORDER BY is_primary DESC, assigned_at, id) AS rn
                  FROM ticket_teams) o ON o.id = tt.id
           SET tt.seq = o.rn`);
      console.log("  + ticket_teams.seq");
    }

    // ── ticket_team_slas ───────────────────────────────────────────────────
    if (!(await tableExists(conn, "ticket_team_slas"))) {
      await conn.query(`
        CREATE TABLE ticket_team_slas (
          id INT AUTO_INCREMENT PRIMARY KEY,
          ticket_id INT NOT NULL,
          team_id INT NOT NULL,
          seq INT NOT NULL,
          policy_id INT NULL,
          cycle INT NOT NULL DEFAULT 1,
          started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          response_due_at DATETIME NULL,
          response_met_at DATETIME NULL,
          response_breached TINYINT(1) NOT NULL DEFAULT 0,
          resolve_due_at DATETIME NULL,
          resolve_met_at DATETIME NULL,
          resolve_breached TINYINT(1) NOT NULL DEFAULT 0,
          paused_at DATETIME NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE KEY uk_team_sla_ticket_team (ticket_id, team_id),
          KEY idx_team_sla_open (response_met_at, resolve_met_at),
          CONSTRAINT fk_team_sla_ticket FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
          CONSTRAINT fk_team_sla_team FOREIGN KEY (team_id) REFERENCES teams(id),
          CONSTRAINT fk_team_sla_policy FOREIGN KEY (policy_id) REFERENCES sla_policies(id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      console.log("  + ticket_team_slas");
    }

    // ── ticket_sla_history.team_seq ────────────────────────────────────────
    if (await tableExists(conn, "ticket_sla_history") && !(await colExists(conn, "ticket_sla_history", "team_seq"))) {
      await conn.query("ALTER TABLE ticket_sla_history ADD COLUMN team_seq INT NULL AFTER team_name");
      await conn.query("UPDATE ticket_sla_history SET team_seq = 1 WHERE kind = 'team' AND team_seq IS NULL");
      console.log("  + ticket_sla_history.team_seq");
    }

    // ── Partially Resolved status ──────────────────────────────────────────
    const [[has]] = await conn.query("SELECT id FROM ticket_statuses WHERE `key` = 'partially_resolved'");
    if (!has) {
      const [[ip]] = await conn.query("SELECT sort_order FROM ticket_statuses WHERE `key` = 'in_progress'");
      const after = ip?.sort_order ?? 4;
      // Slot it straight after In Progress.
      await conn.query("UPDATE ticket_statuses SET sort_order = sort_order + 1 WHERE sort_order > ?", [after]);
      await conn.query(
        "INSERT INTO ticket_statuses (`key`, label, is_closed, sort_order) VALUES ('partially_resolved', 'Partially Resolved', 0, ?)",
        [after + 1]
      );
      console.log("  + status 'partially_resolved'");
    }

    console.log("team-collaboration migration completed.");
  } catch (e) {
    console.error("Migration failed:", e.message);
    throw e;
  } finally {
    conn.release();
    await pool.end();
  }
}

migrate().catch(() => process.exit(1));
