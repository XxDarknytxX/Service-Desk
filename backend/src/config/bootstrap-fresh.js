/**
 * Fresh-install bootstrap — brings an EMPTY database up to the current schema.
 *
 * The schema lives in two places: complete-schema.sql (the base tables + lookup
 * data) and a series of feature migrations that were added afterwards. This
 * script runs them in dependency order so a brand-new server ends up with the
 * same structure as a long-lived dev database — no manual step-by-step.
 *
 * Usage (from the backend/ directory):
 *   node src/config/bootstrap-fresh.js              # schema + lookups + admin user
 *   node src/config/bootstrap-fresh.js --with-seed  # also seed demo teams/users/templates
 *
 * Admin credentials come from ADMIN_EMAIL / ADMIN_PASSWORD (defaults below).
 *
 * SAFE: only ever creates. It never drops the database or any table — unlike
 * fresh-migration.js, which is destructive. Re-running is harmless (every step
 * is idempotent), so it doubles as a "repair/upgrade" for a partial install.
 */

import mysql from "mysql2/promise";
import bcrypt from "bcryptjs";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawn } from "child_process";
import dotenv from "dotenv";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const unquote = (v) => (v || "").replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");

const DB_NAME = process.env.DATABASE_NAME || "service_desk";
const BASE = {
  host: process.env.DATABASE_HOST || "localhost",
  port: Number(process.env.DATABASE_PORT || 3306),
  user: unquote(process.env.DATABASE_USER),
  password: unquote(process.env.DATABASE_PASSWORD),
  multipleStatements: true,
};

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@servicedesk.local";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";
const ADMIN_NAME = process.env.ADMIN_NAME || "Admin User";

const WITH_SEED = process.argv.includes("--with-seed");

// Feature migrations, in dependency order. Each is idempotent on its own; they
// exist as separate files because they were added incrementally. Order matters
// where a later migration adds a column/FK to a table an earlier one creates.
const MIGRATIONS = [
  "corporate-flow-migration.js",      // service_categories + tickets.service_category_id
  "noc-mtx-migration.js",             // teams.is_triage, users.company, SLA grace
  "ticket-teams-migration.js",        // multi-team support
  "template-migration.js",            // ticket_templates (+ tickets.template_id)
  "template-approval-migration.js",   // template approval flows/steps
  "template-approval-migration-v2.js",// execution_mode, approver_user_ids
  "forms-migration.js",               // service_forms, form_invites
  "approval-rules-migration.js",      // approval_rules
  "approval-sla-migration.js",        // approval_sla_policies, ticket_approval_slas
  "migrate-delegations.js",           // approval_delegations
  "migrate-assets-v2.js",             // asset categories/assignments/maintenance
  "status-lifecycle-migration.js",    // draft/pending/in_progress/on_hold lifecycle
  "triage-sla-migration.js",          // ticket_triage_slas (NOC clock)
  "solved-at-migration.js",           // tickets.solved_at
  "manager-sla-migration.js",         // ticket_manager_slas (manager review clock)
];

// Optional demo data — teams, staff/customer users, ticket templates.
const SEEDS = [
  "seed-corporate-flow.js",
  "seed-noc-mtx.js",
  "seed-new-templates.js",
  "seed-templates-batch2.js",
  "seed-templates-batch3.js",
  "seed-customer-forms.js",
];

const c = {
  g: (s) => `\x1b[32m${s}\x1b[0m`,
  y: (s) => `\x1b[33m${s}\x1b[0m`,
  r: (s) => `\x1b[31m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
};

// Run a migration/seed as a child process — each script owns its own pool and
// exits when done, which is exactly how they're designed to be invoked.
function runScript(file) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(__dirname, file)], {
      cwd: path.resolve(__dirname, "../.."), // backend/ so dotenv finds .env
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    child.on("close", (code) => resolve({ code, out }));
  });
}

async function main() {
  console.log(`\n${c.g("Service Desk — fresh database bootstrap")}`);
  console.log(c.dim(`  target: ${BASE.user}@${BASE.host}:${BASE.port} / ${DB_NAME}\n`));

  // 1. Create the database if it doesn't exist yet.
  const admin = await mysql.createConnection(BASE);
  await admin.query(
    `CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  );
  await admin.end();
  console.log(`${c.g("✓")} database \`${DB_NAME}\` ready`);

  const conn = await mysql.createConnection({ ...BASE, database: DB_NAME });

  // 2. Base schema + lookup data (roles, statuses, priorities, types, channels).
  const schemaPath = path.join(__dirname, "complete-schema.sql");
  const sql = fs.readFileSync(schemaPath, "utf8");
  await conn.query(sql);
  const [[{ n: baseTables }]] = await conn.query(
    "SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = ?",
    [DB_NAME]
  );
  console.log(`${c.g("✓")} base schema applied ${c.dim(`(${baseTables} tables)`)}`);

  // 3. Admin user — created BEFORE the migrations because some of them seed rows
  // that carry a created_by foreign key into users (template-migration.js), which
  // fails outright on a database with no users yet.
  const [[existing]] = await conn.query("SELECT id FROM users WHERE email = ?", [ADMIN_EMAIL]);
  let adminId = existing?.id;
  if (!adminId) {
    const hash = await bcrypt.hash(ADMIN_PASSWORD, 10);
    const [res] = await conn.query(
      "INSERT INTO users (email, password_hash, full_name, is_active) VALUES (?, ?, ?, 1)",
      [ADMIN_EMAIL, hash, ADMIN_NAME]
    );
    adminId = res.insertId;
    console.log(`${c.g("✓")} admin user created: ${ADMIN_EMAIL}`);
  } else {
    console.log(`${c.y("–")} admin user already exists: ${ADMIN_EMAIL} ${c.dim("(password unchanged)")}`);
  }
  const [roles] = await conn.query("SELECT id, name FROM roles WHERE name IN ('admin','agent')");
  for (const r of roles) {
    await conn.query("INSERT IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)", [adminId, r.id]);
  }

  // 4. Feature migrations.
  console.log(`\n${c.dim("running feature migrations…")}`);
  const failed = [];
  for (const file of MIGRATIONS) {
    if (!fs.existsSync(path.join(__dirname, file))) {
      console.log(`  ${c.y("–")} ${file} ${c.dim("(not found, skipped)")}`);
      continue;
    }
    const { code, out } = await runScript(file);
    if (code === 0) {
      console.log(`  ${c.g("✓")} ${file}`);
    } else {
      failed.push(file);
      console.log(`  ${c.r("✗")} ${file}`);
      console.log(c.dim(out.split("\n").filter(Boolean).slice(-3).map((l) => "      " + l).join("\n")));
    }
  }

  // 5. Optional demo/seed data.
  if (WITH_SEED) {
    console.log(`\n${c.dim("seeding demo data…")}`);
    for (const file of SEEDS) {
      if (!fs.existsSync(path.join(__dirname, file))) continue;
      const { code, out } = await runScript(file);
      console.log(`  ${code === 0 ? c.g("✓") : c.r("✗")} ${file}`);
      if (code !== 0) console.log(c.dim(out.split("\n").filter(Boolean).slice(-2).map((l) => "      " + l).join("\n")));
    }
  }

  // 6. Summary.
  const [[{ n: tables }]] = await conn.query(
    "SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = ?",
    [DB_NAME]
  );
  const [statuses] = await conn.query("SELECT `key` FROM ticket_statuses ORDER BY id");
  const [[{ n: users }]] = await conn.query("SELECT COUNT(*) AS n FROM users");
  const [[{ n: teams }]] = await conn.query("SELECT COUNT(*) AS n FROM teams");
  await conn.end();

  console.log(`\n${c.g("Bootstrap complete.")}`);
  console.log(`  tables:   ${tables}`);
  console.log(`  statuses: ${statuses.map((s) => s.key).join(", ")}`);
  console.log(`  users:    ${users}    teams: ${teams}`);
  if (failed.length) {
    console.log(`\n${c.r("Some migrations failed:")} ${failed.join(", ")}`);
    console.log(c.dim("  Re-run this script — migrations are idempotent — or run the failed one directly to see the full error."));
    process.exit(1);
  }
  console.log(`\n  Log in with ${c.g(ADMIN_EMAIL)} / ${c.g(ADMIN_PASSWORD)}`);
  if (!WITH_SEED) console.log(c.dim("  (no teams/users seeded — re-run with --with-seed for demo data)"));
  console.log("");
}

main().catch((err) => {
  console.error(c.r("\nBootstrap failed:"), err.message);
  process.exit(1);
});
