/**
 * Corporate SLA migration — each app sets its own SLAs.
 *
 *   sla_policies.workspace ('internal' | 'corporate')
 *       Delivery (response / resolution) policies were shared by both apps, so a
 *       corporate request simply got the internal desk's default. Now a ticket
 *       only matches policies of its own app, managed from Corporate → SLA
 *       Settings and the internal SLA Policies page respectively.
 *
 *   sla_policies.archived_at
 *       A policy that tickets already used can't be deleted (ticket_slas keeps a
 *       foreign key to it for history). Removing one archives it instead: it no
 *       longer matches new tickets and is hidden from the settings pages.
 *
 *   sla_clock_targets (clock, priority_id, minutes)
 *       Targets for the corporate clocks that used to be hard-coded:
 *         triage          NOC's time to route a request out of the triage queue
 *         manager_review  each escalation layer's time to act
 *
 * Seeding keeps today's behaviour: the corporate delivery targets per priority
 * are copied from whatever policy a corporate request matches right now, and
 * the clock targets from the old constants. Idempotent.
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

// The constants these targets replace (ticketController, before this migration).
const LEGACY_TRIAGE = { low: 120, normal: 60, high: 30, urgent: 15 };
const LEGACY_MANAGER = { low: 240, normal: 120, high: 60, urgent: 30 };

async function colExists(conn, table, col) {
  const [r] = await conn.query(
    `SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME=? AND COLUMN_NAME=?`,
    [DB, table, col]
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
async function indexExists(conn, table, index) {
  const [r] = await conn.query(
    `SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA=? AND TABLE_NAME=? AND INDEX_NAME=?`,
    [DB, table, index]
  );
  return r.length > 0;
}

async function migrate() {
  const conn = await pool.getConnection();
  try {
    if (!(await tableExists(conn, "sla_policies"))) {
      console.warn("  ! sla_policies missing — run the base schema first");
      return;
    }
    const hasPolicyType = await colExists(conn, "sla_policies", "policy_type");

    // ── sla_policies.workspace / archived_at ──────────────────────────────
    if (!(await colExists(conn, "sla_policies", "workspace"))) {
      await conn.query(
        `ALTER TABLE sla_policies ADD COLUMN workspace ENUM('internal','corporate') NOT NULL DEFAULT 'internal' AFTER ${hasPolicyType ? "policy_type" : "id"}`
      );
      console.log("  + sla_policies.workspace");
    }
    if (!(await colExists(conn, "sla_policies", "archived_at"))) {
      await conn.query(`ALTER TABLE sla_policies ADD COLUMN archived_at DATETIME NULL AFTER notify_at_risk_minutes`);
      console.log("  + sla_policies.archived_at");
    }
    if (!(await indexExists(conn, "sla_policies", "idx_sla_workspace"))) {
      await conn.query(`ALTER TABLE sla_policies ADD INDEX idx_sla_workspace (workspace, archived_at)`);
    }

    // Team-specific policies follow their team into the corporate app.
    const [moved] = await conn.query(
      `UPDATE sla_policies sp JOIN teams t ON t.id = sp.applies_to_team_id
          SET sp.workspace = 'corporate'
        WHERE t.workspace = 'corporate' AND sp.workspace <> 'corporate'
          ${hasPolicyType ? "AND sp.policy_type = 'team'" : ""}`
    );
    if (moved.affectedRows) console.log(`  ~ ${moved.affectedRows} team-specific polic(ies) moved to corporate`);

    // ── Seed the corporate delivery targets from today's behaviour ────────
    const typeFilter = hasPolicyType ? "AND policy_type = 'team'" : "";
    const [[{ corp }]] = await conn.query(
      `SELECT COUNT(*) AS corp FROM sla_policies
        WHERE workspace = 'corporate' AND applies_to_team_id IS NULL ${typeFilter}`
    );
    if (!corp) {
      const [priorities] = await conn.query("SELECT id, `key`, label FROM ticket_priorities ORDER BY id");
      const fields = "response_minutes, resolve_minutes, use_business_hours, business_hours_id, notify_at_risk_minutes";
      const [[fallback]] = await conn.query(
        `SELECT ${fields} FROM sla_policies
          WHERE workspace = 'internal' AND is_default = 1 ${typeFilter} LIMIT 1`
      );
      const base = fallback || { response_minutes: 60, resolve_minutes: 480, use_business_hours: 0, business_hours_id: null, notify_at_risk_minutes: 60 };
      const insert = async (name, priorityId, p, isDefault) =>
        conn.query(
          `INSERT INTO sla_policies
             (${hasPolicyType ? "policy_type, " : ""}workspace, name, description, response_minutes, resolve_minutes,
              applies_to_priority_id, applies_to_team_id, is_default, business_hours_id, use_business_hours, notify_at_risk_minutes)
           VALUES (${hasPolicyType ? "'team', " : ""}'corporate', ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?)`,
          [name, "Corporate delivery SLA — managed in Corporate → SLA Settings", p.response_minutes, p.resolve_minutes,
           priorityId, isDefault ? 1 : 0, p.business_hours_id, p.use_business_hours ? 1 : 0, p.notify_at_risk_minutes]
        );
      for (const pr of priorities) {
        const [[match]] = await conn.query(
          `SELECT ${fields} FROM sla_policies
            WHERE workspace = 'internal' AND applies_to_priority_id = ? AND applies_to_team_id IS NULL ${typeFilter}
            ORDER BY id LIMIT 1`,
          [pr.id]
        );
        await insert(`Corporate · ${pr.label}`, pr.id, match || base, false);
      }
      // Fallback for a request without a priority: the Normal targets.
      const normal = priorities.find((p) => p.key === "normal");
      const [[normalRow]] = normal
        ? await conn.query(`SELECT ${fields} FROM sla_policies WHERE workspace = 'corporate' AND applies_to_priority_id = ? LIMIT 1`, [normal.id])
        : [[null]];
      await insert("Corporate · Default", null, normalRow || base, true);
      console.log(`  + corporate delivery SLAs seeded for ${priorities.length} priorities (copied from current behaviour)`);
    }

    // ── sla_clock_targets ─────────────────────────────────────────────────
    if (!(await tableExists(conn, "sla_clock_targets"))) {
      await conn.query(`
        CREATE TABLE sla_clock_targets (
          clock ENUM('triage','manager_review') NOT NULL,
          priority_id INT NOT NULL,
          minutes INT NOT NULL,
          updated_by INT NULL,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (clock, priority_id),
          CONSTRAINT fk_sct_priority FOREIGN KEY (priority_id) REFERENCES ticket_priorities(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      console.log("  + sla_clock_targets");
    }
    const [priorities] = await conn.query("SELECT id, `key` FROM ticket_priorities");
    let seeded = 0;
    for (const [clock, legacy] of [["triage", LEGACY_TRIAGE], ["manager_review", LEGACY_MANAGER]]) {
      for (const pr of priorities) {
        const [r] = await conn.query(
          "INSERT IGNORE INTO sla_clock_targets (clock, priority_id, minutes) VALUES (?, ?, ?)",
          [clock, pr.id, legacy[pr.key] ?? legacy.normal]
        );
        seeded += r.affectedRows;
      }
    }
    if (seeded) console.log(`  + ${seeded} clock target(s) seeded`);

    console.log("corporate-sla migration completed.");
  } catch (e) {
    console.error("Migration failed:", e.message);
    throw e;
  } finally {
    conn.release();
    await pool.end();
  }
}

migrate().catch(() => process.exit(1));
