/**
 * Approval Rules Migration
 *
 * The approval-rules feature (dynamic default approvers, after-approval routing,
 * notes template, require-all, key-based applies-to) evolved in the controller
 * but the matching columns were never added to `approval_rules`, causing
 * GET /api/approval-rules to 500. This migration adds those columns idempotently.
 * Additive and non-destructive — existing columns/rows are untouched.
 *
 * Run: node src/config/approval-rules-migration.js
 */

import mysql from "mysql2/promise";
import dotenv from "dotenv";
dotenv.config();

const COLUMNS = [
  ["applies_to_priority_key", "VARCHAR(50) NULL"],
  ["applies_to_type_key", "VARCHAR(50) NULL"],
  ["after_approval_agent_id", "INT NULL"],
  ["after_approval_team_id", "INT NULL"],
  ["default_approvers", "JSON NULL"],
  ["notes_template", "TEXT NULL"],
  ["require_all_approvers", "TINYINT(1) NOT NULL DEFAULT 0"],
];

async function run() {
  const conn = await mysql.createConnection({
    host: process.env.DATABASE_HOST,
    port: Number(process.env.DATABASE_PORT) || 3306,
    user: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
    database: process.env.DATABASE_NAME,
  });
  const db = process.env.DATABASE_NAME;
  console.log("→ Migrating approval_rules columns...");
  for (const [col, def] of COLUMNS) {
    const [exists] = await conn.query(
      "SELECT 1 FROM information_schema.columns WHERE table_schema = ? AND table_name = 'approval_rules' AND column_name = ?",
      [db, col]
    );
    if (exists.length) {
      console.log(`  ✓ ${col} already present`);
      continue;
    }
    await conn.query(`ALTER TABLE approval_rules ADD COLUMN ${col} ${def}`);
    console.log(`  + added ${col}`);
  }
  await conn.end();
  console.log("✓ approval_rules migration complete");
}

run().catch((e) => {
  console.error("✗ migration failed:", e.message);
  process.exit(1);
});
