/**
 * Template Approval Flow Migration
 * Creates tables for per-template approval workflow definitions.
 */
import mysql from "mysql2/promise";

const DB_CONFIG = {
  host: process.env.DATABASE_HOST || "localhost",
  user: process.env.DATABASE_USER || "root",
  password: process.env.DATABASE_PASSWORD || "pool",
  database: process.env.DATABASE_NAME || "servicedesk",
  multipleStatements: true,
};

async function migrate() {
  const conn = await mysql.createConnection(DB_CONFIG);
  console.log("Connected to MySQL — running template approval flow migration...\n");

  // ── Table 1: template_approval_flows (1:1 with ticket_templates) ──
  await conn.query(`
    CREATE TABLE IF NOT EXISTS template_approval_flows (
      id INT AUTO_INCREMENT PRIMARY KEY,
      template_id INT NOT NULL,
      is_enabled TINYINT(1) NOT NULL DEFAULT 1,
      approval_type ENUM('sequential','parallel','conditional') NOT NULL DEFAULT 'sequential',
      require_all_approvers TINYINT(1) NOT NULL DEFAULT 0,
      auto_approve_hours INT UNSIGNED NULL,
      rejection_action ENUM('stop','restart','skip_to_end') NOT NULL DEFAULT 'stop',
      notify_requester TINYINT(1) NOT NULL DEFAULT 1,
      notify_on_each_step TINYINT(1) NOT NULL DEFAULT 0,
      escalation_hours INT UNSIGNED NULL,
      escalation_to ENUM('skip','manager','specific_user') NULL,
      escalation_user_id INT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_template (template_id),
      CONSTRAINT fk_taf_template FOREIGN KEY (template_id) REFERENCES ticket_templates(id) ON DELETE CASCADE,
      CONSTRAINT fk_taf_escalation_user FOREIGN KEY (escalation_user_id) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
  console.log("✓ template_approval_flows table created");

  // ── Table 2: template_approval_steps (many per flow) ──
  await conn.query(`
    CREATE TABLE IF NOT EXISTS template_approval_steps (
      id INT AUTO_INCREMENT PRIMARY KEY,
      flow_id INT NOT NULL,
      step_order INT NOT NULL DEFAULT 1,
      name VARCHAR(150) NOT NULL,
      description TEXT NULL,
      approver_type ENUM('specific_user','manager_chain','team_lead','department_head','role','dynamic_field') NOT NULL,
      approver_user_id INT NULL,
      approver_role VARCHAR(50) NULL,
      manager_level INT NOT NULL DEFAULT 1,
      dynamic_field_id VARCHAR(100) NULL,
      require_all TINYINT(1) NOT NULL DEFAULT 0,
      can_delegate TINYINT(1) NOT NULL DEFAULT 0,
      auto_approve_hours INT UNSIGNED NULL,
      conditions JSON NULL,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_flow_step (flow_id, step_order),
      CONSTRAINT fk_tas_flow FOREIGN KEY (flow_id) REFERENCES template_approval_flows(id) ON DELETE CASCADE,
      CONSTRAINT fk_tas_approver FOREIGN KEY (approver_user_id) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
  console.log("✓ template_approval_steps table created");

  console.log("\n✅ Template approval flow migration complete — 2 tables created.");
  await conn.end();
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
