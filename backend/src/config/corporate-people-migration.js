/**
 * Corporate people migration — onboarding + layered escalation.
 *
 *   users.must_set_password
 *       1 while an account was created with an onboarding email and the person
 *       hasn't chosen a password yet (their stored hash is random and unknown to
 *       anyone). Cleared when they set one via the emailed link, or when an admin
 *       sets it by hand. Drives the "Invite pending / Resend onboarding" UI.
 *
 *   password_reset_tokens.purpose += 'onboarding'
 *       Onboarding links reuse the reset-token machinery (hashed, single use,
 *       newest wins) with their own purpose, TTL and email copy.
 *
 *   ticket_manager_slas: one row PER ESCALATION LAYER (was one per ticket)
 *       Escalation now walks the reporting hierarchy: engineer → L1 manager →
 *       L2 → L3… Each layer gets its own review clock. `layer` numbers them,
 *       `from_user_id` records who passed it up, and outcome gains 'escalated'
 *       for a layer that handed the request further up. At most one row per
 *       ticket is open (met_at IS NULL) at a time — enforced in code, since
 *       MySQL has no partial unique indexes.
 *
 * Idempotent + additive. The unique key is only dropped after an index on
 * ticket_id exists, because the ticket FK needs one.
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

async function colExists(conn, table, col) {
  const [r] = await conn.query(
    `SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME=? AND COLUMN_NAME=?`,
    [DB, table, col]
  );
  return r.length > 0;
}
async function columnType(conn, table, col) {
  const [[r]] = await conn.query(
    `SELECT COLUMN_TYPE AS t FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME=? AND COLUMN_NAME=?`,
    [DB, table, col]
  );
  return r?.t || "";
}
async function indexExists(conn, table, index) {
  const [r] = await conn.query(
    `SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA=? AND TABLE_NAME=? AND INDEX_NAME=?`,
    [DB, table, index]
  );
  return r.length > 0;
}
async function tableExists(conn, table) {
  const [r] = await conn.query(
    `SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=? AND TABLE_NAME=?`,
    [DB, table]
  );
  return r.length > 0;
}

async function migrate() {
  const conn = await pool.getConnection();
  try {
    // ── Onboarding ─────────────────────────────────────────────────────────
    if (!(await colExists(conn, "users", "must_set_password"))) {
      const after = (await colExists(conn, "users", "password_changed_at")) ? "password_changed_at" : "password_hash";
      await conn.query(`ALTER TABLE users ADD COLUMN must_set_password TINYINT(1) NOT NULL DEFAULT 0 AFTER ${after}`);
      console.log("  + users.must_set_password");
    }

    if (await tableExists(conn, "password_reset_tokens")) {
      const purposeType = await columnType(conn, "password_reset_tokens", "purpose");
      if (!purposeType.includes("'onboarding'")) {
        await conn.query(
          `ALTER TABLE password_reset_tokens
             MODIFY COLUMN purpose ENUM('admin_reset','self_service','onboarding') NOT NULL`
        );
        console.log("  + password_reset_tokens.purpose 'onboarding'");
      }
    } else {
      console.warn("  ! password_reset_tokens missing — run password-reset-migration.js first");
    }

    // ── Executive layer ───────────────────────────────────────────────────
    // A corporate team role for the executives above the team managers (CTO,
    // CEO, heads of business). They top the escalation chain and — unlike other
    // corporate staff — keep the internal desk too (see middleware/workspace.js).
    if (await colExists(conn, "teams", "corporate_role")) {
      const roleType = await columnType(conn, "teams", "corporate_role");
      if (!roleType.includes("'executive'")) {
        await conn.query(
          `ALTER TABLE teams MODIFY COLUMN corporate_role ENUM('triage','queue','service_delivery','executive') NULL`
        );
        console.log("  + teams.corporate_role 'executive'");
      }
    }

    // ── Layered escalation ────────────────────────────────────────────────
    if (await tableExists(conn, "ticket_manager_slas")) {
      if (!(await colExists(conn, "ticket_manager_slas", "layer"))) {
        await conn.query(`ALTER TABLE ticket_manager_slas ADD COLUMN layer INT NOT NULL DEFAULT 1 AFTER manager_id`);
        console.log("  + ticket_manager_slas.layer");
      }
      if (!(await colExists(conn, "ticket_manager_slas", "from_user_id"))) {
        await conn.query(`ALTER TABLE ticket_manager_slas ADD COLUMN from_user_id INT NULL AFTER layer`);
        console.log("  + ticket_manager_slas.from_user_id");
      }
      const outcomeType = await columnType(conn, "ticket_manager_slas", "outcome");
      if (!outcomeType.includes("'escalated'")) {
        await conn.query(
          `ALTER TABLE ticket_manager_slas
             MODIFY COLUMN outcome ENUM('pending','reassigned_back','resolved','escalated') NOT NULL DEFAULT 'pending'`
        );
        console.log("  + ticket_manager_slas.outcome 'escalated'");
      }
      // Replacement index first — the ticket FK must always have an index.
      if (!(await indexExists(conn, "ticket_manager_slas", "idx_tms_ticket_open"))) {
        await conn.query(`ALTER TABLE ticket_manager_slas ADD INDEX idx_tms_ticket_open (ticket_id, met_at)`);
        console.log("  + index ticket_manager_slas(ticket_id, met_at)");
      }
      if (await indexExists(conn, "ticket_manager_slas", "uk_tms_ticket")) {
        await conn.query(`ALTER TABLE ticket_manager_slas DROP INDEX uk_tms_ticket`);
        console.log("  - dropped unique(ticket_id): one row per escalation layer now");
      }
    } else {
      console.warn("  ! ticket_manager_slas missing — run manager-sla-migration.js first");
    }

    console.log("corporate-people migration completed.");
  } catch (e) {
    console.error("Migration failed:", e.message);
    throw e;
  } finally {
    conn.release();
    await pool.end();
  }
}

migrate().catch(() => process.exit(1));
