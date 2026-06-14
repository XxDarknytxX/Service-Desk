/**
 * Approval SLA Migration
 * Creates tables for approval-level SLA policies and tracking
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

    // 1. Add policy_type column to sla_policies to differentiate team vs approval policies
    const [cols] = await conn.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'sla_policies' AND COLUMN_NAME = 'policy_type'`,
      [process.env.DATABASE_NAME]
    );
    if (cols.length === 0) {
      await conn.query(`
        ALTER TABLE sla_policies
        ADD COLUMN policy_type ENUM('team', 'approval') NOT NULL DEFAULT 'team' AFTER id
      `);
      console.log("  Added policy_type column to sla_policies");
    }

    // 1b. Add approval_sla_mode column (stage vs hierarchy matching for approval policies).
    // The SLA controller writes this on create/update; without it, policy create/update 500s.
    const [modeCols] = await conn.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'sla_policies' AND COLUMN_NAME = 'approval_sla_mode'`,
      [process.env.DATABASE_NAME]
    );
    if (modeCols.length === 0) {
      await conn.query(`
        ALTER TABLE sla_policies
        ADD COLUMN approval_sla_mode ENUM('stage', 'hierarchy') NULL AFTER policy_type
      `);
      console.log("  Added approval_sla_mode column to sla_policies");
    }

    // 2. Create approval_sla_policies table — granular approval-stage SLA config
    await conn.query(`
      CREATE TABLE IF NOT EXISTS approval_sla_policies (
        id INT AUTO_INCREMENT PRIMARY KEY,
        sla_policy_id INT NOT NULL,

        -- Matching criteria: which approval records this applies to
        applies_to_approval_level INT NULL COMMENT 'Specific level (1,2,3...) or NULL for any level',
        applies_to_approver_type ENUM('specific_user','manager_chain','team_lead','department_head','role','dynamic_field') NULL
          COMMENT 'Match by approver type from template step, or NULL for any',
        applies_to_approval_rule_id INT UNSIGNED NULL
          COMMENT 'Match specific global approval rule, or NULL for any',

        -- Time targets for this stage
        target_minutes INT NOT NULL DEFAULT 60 COMMENT 'How many minutes the approver has to act',
        warning_minutes INT NOT NULL DEFAULT 30 COMMENT 'Minutes before breach to send warning',

        -- Escalation on breach
        escalation_action ENUM('notify_only','auto_approve','escalate_to_next','reassign') NOT NULL DEFAULT 'notify_only',
        escalation_to_user_id INT NULL COMMENT 'Reassign to this user on breach',

        -- Ordering (multiple stage rules per policy, evaluated in order)
        sort_order INT NOT NULL DEFAULT 0,
        is_active TINYINT(1) NOT NULL DEFAULT 1,

        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

        CONSTRAINT fk_asp_sla_policy FOREIGN KEY (sla_policy_id) REFERENCES sla_policies(id) ON DELETE CASCADE,
        CONSTRAINT fk_asp_approval_rule FOREIGN KEY (applies_to_approval_rule_id) REFERENCES approval_rules(id) ON DELETE SET NULL,
        CONSTRAINT fk_asp_escalation_user FOREIGN KEY (escalation_to_user_id) REFERENCES users(id) ON DELETE SET NULL,

        INDEX idx_asp_policy (sla_policy_id),
        INDEX idx_asp_level (applies_to_approval_level),
        INDEX idx_asp_active (is_active)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("  Created approval_sla_policies table");

    // 2b. Ensure approval_sla_policies has the per-stage mode + hierarchy-matching columns.
    // slaController writes these on create/update; without them, creating an approval policy 500s.
    const aspAdds = [
      ["mode", "ENUM('stage','hierarchy') NOT NULL DEFAULT 'stage' AFTER sla_policy_id"],
      ["applies_to_org_level", "INT NULL AFTER applies_to_approval_rule_id"],
      ["applies_to_org_level_and_below", "TINYINT(1) NOT NULL DEFAULT 0 AFTER applies_to_org_level"],
    ];
    for (const [col, ddl] of aspAdds) {
      const [c] = await conn.query(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'approval_sla_policies' AND COLUMN_NAME = ?`,
        [process.env.DATABASE_NAME, col]
      );
      if (c.length === 0) {
        await conn.query(`ALTER TABLE approval_sla_policies ADD COLUMN ${col} ${ddl}`);
        console.log(`  Added ${col} to approval_sla_policies`);
      }
    }

    // 3. Create ticket_approval_slas — per-approval-record SLA tracking
    await conn.query(`
      CREATE TABLE IF NOT EXISTS ticket_approval_slas (
        id INT AUTO_INCREMENT PRIMARY KEY,
        ticket_id INT NOT NULL,
        ticket_approval_id INT UNSIGNED NOT NULL,
        approval_sla_policy_id INT NOT NULL,

        -- Timing
        due_at DATETIME NOT NULL,
        started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        completed_at DATETIME NULL,

        -- Status tracking
        breached TINYINT(1) NOT NULL DEFAULT 0,
        met TINYINT(1) NOT NULL DEFAULT 0,
        warning_sent TINYINT(1) NOT NULL DEFAULT 0,

        -- Pause support (if ticket goes on-hold during approval)
        paused_at DATETIME NULL,
        remaining_ms BIGINT NULL,

        -- Escalation tracking
        escalated TINYINT(1) NOT NULL DEFAULT 0,
        escalated_at DATETIME NULL,
        escalation_action_taken VARCHAR(50) NULL,

        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

        CONSTRAINT fk_tas_ticket FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
        CONSTRAINT fk_tas_approval FOREIGN KEY (ticket_approval_id) REFERENCES ticket_approvals(id) ON DELETE CASCADE,
        CONSTRAINT fk_tas_policy FOREIGN KEY (approval_sla_policy_id) REFERENCES approval_sla_policies(id) ON DELETE CASCADE,

        UNIQUE KEY uk_tas_approval (ticket_approval_id),
        INDEX idx_tas_ticket (ticket_id),
        INDEX idx_tas_due (due_at),
        INDEX idx_tas_breached (breached),
        INDEX idx_tas_status (met, breached, paused_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("  Created ticket_approval_slas table");

    await conn.commit();
    console.log("\nApproval SLA migration completed successfully!");
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
