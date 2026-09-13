// SMTP settings migration
//
// Creates a single-row `smtp_settings` table holding the system-wide outbound
// mail configuration, editable by admins from Settings → Email.
//
// Why a single row and not a config file: the whole point of the admin section
// is that ops can change the relay without a redeploy. The row is pinned to
// id = 1 by a CHECK-style convention (the controller always writes id = 1), so
// there is exactly one config and no "which row is live?" ambiguity.
//
// The password column stays NULL when auth is off — which is the case for the
// Vodafone relay (smtp.vodafone.net.fj:25, no security, no auth). It is never
// returned by the API; the GET handler replaces it with a has_password flag.
//
// Idempotent: safe to run repeatedly. Seeds the Vodafone relay defaults only
// when the table is empty, so a re-run never stomps an admin's later edits.
// dotenv first: ESM imports are hoisted and run in order, so db.js must not be
// evaluated before the .env values are in process.env.
import "dotenv/config";
import { getPool } from "./db.js";

const DEFAULTS = {
  host: "smtp.vodafone.net.fj",
  port: 25,
  // "none" | "tls" | "starttls" — matches the vendor's "Security Type" field.
  security: "none",
  auth_required: 0,
  username: null,
  password: null,
  from_email: "servicedesk@vodafone.com.fj",
  from_name: "Vodafone Service Desk",
  enabled: 1,
};

async function runSmtpSettingsMigration(pool) {
  const db = pool || (await getPool());

  await db.query(`
    CREATE TABLE IF NOT EXISTS smtp_settings (
      id              INT UNSIGNED NOT NULL PRIMARY KEY,
      host            VARCHAR(255) NOT NULL,
      port            INT NOT NULL DEFAULT 25,
      security        ENUM('none','tls','starttls') NOT NULL DEFAULT 'none',
      auth_required   TINYINT(1) NOT NULL DEFAULT 0,
      username        VARCHAR(255) NULL,
      password        VARCHAR(512) NULL,
      from_email      VARCHAR(255) NOT NULL,
      from_name       VARCHAR(255) NULL,
      enabled         TINYINT(1) NOT NULL DEFAULT 1,
      last_tested_at  DATETIME NULL,
      last_test_ok    TINYINT(1) NULL,
      last_test_error TEXT NULL,
      updated_by      INT NULL,
      updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // Seed row 1 only if absent. INSERT IGNORE would also work, but an explicit
  // count makes the log line honest about whether anything was written.
  const [[{ n }]] = await db.query("SELECT COUNT(*) AS n FROM smtp_settings");
  if (n === 0) {
    await db.query(
      `INSERT INTO smtp_settings
         (id, host, port, security, auth_required, username, password, from_email, from_name, enabled)
       VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        DEFAULTS.host,
        DEFAULTS.port,
        DEFAULTS.security,
        DEFAULTS.auth_required,
        DEFAULTS.username,
        DEFAULTS.password,
        DEFAULTS.from_email,
        DEFAULTS.from_name,
        DEFAULTS.enabled,
      ]
    );
    console.log(`  ✓ smtp_settings seeded with ${DEFAULTS.host}:${DEFAULTS.port} (security=${DEFAULTS.security}, auth=off)`);
  } else {
    console.log("  ✓ smtp_settings already configured — left unchanged");
  }

  return true;
}

// Run directly — matches the other migrations, which bootstrap-fresh.js spawns
// as child processes:  node src/config/smtp-settings-migration.js
const pool = await getPool();
try {
  await runSmtpSettingsMigration(pool);
  console.log("SMTP settings migration complete.");
  await pool.end();
  process.exit(0);
} catch (err) {
  console.error("SMTP settings migration failed:", err.message);
  await pool.end();
  process.exit(1);
}
