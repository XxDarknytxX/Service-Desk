/**
 * Password Reset Migration
 *
 * Adds emailed, single-use password reset links — issued either by an admin
 * from the Users page or by the user themselves via "Forgot password?".
 *
 *   password_reset_tokens   one row per issued link. Only the SHA-256 of the
 *                           token is stored: the raw token exists only in the
 *                           email, so a database read (a backup, a replica, a
 *                           SELECT by someone with DB access) can't be turned
 *                           into a working reset link.
 *
 *   users.password_changed_at
 *                           stamped whenever a reset completes. The auth
 *                           middleware rejects any JWT issued before it, which
 *                           is what makes a reset actually sign out a
 *                           compromised session — JWTs are otherwise valid
 *                           until they expire (8h).
 *
 * Idempotent + additive — safe to run repeatedly. Never drops anything.
 */

import mysql from "mysql2/promise";
import dotenv from "dotenv";
dotenv.config();

const unquote = (v) => (v || "").replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");

const pool = mysql.createPool({
  host: process.env.DATABASE_HOST,
  port: Number(process.env.DATABASE_PORT) || 3306,
  user: unquote(process.env.DATABASE_USER),
  password: unquote(process.env.DATABASE_PASSWORD),
  database: process.env.DATABASE_NAME,
});

async function columnExists(conn, table, column) {
  const [rows] = await conn.query(
    `SELECT 1 FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column]
  );
  return rows.length > 0;
}

async function migrate() {
  const conn = await pool.getConnection();
  try {
    await conn.query(`
      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        token_hash CHAR(64) NOT NULL,
        purpose ENUM('admin_reset','self_service') NOT NULL,
        requested_by INT NULL,
        request_ip VARCHAR(45) NULL,
        expires_at DATETIME NOT NULL,
        used_at DATETIME NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_password_reset_token_hash (token_hash),
        KEY idx_password_reset_user (user_id, used_at),
        CONSTRAINT fk_password_reset_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT fk_password_reset_requested_by FOREIGN KEY (requested_by) REFERENCES users(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("  ✓ password_reset_tokens");

    if (!(await columnExists(conn, "users", "password_changed_at"))) {
      await conn.query("ALTER TABLE users ADD COLUMN password_changed_at DATETIME NULL AFTER password_hash");
      console.log("  ✓ users.password_changed_at added");
    } else {
      console.log("  ✓ users.password_changed_at already present");
    }

    console.log("Password reset migration complete.");
  } catch (err) {
    console.error("Password reset migration failed:", err.message);
    throw err;
  } finally {
    conn.release();
    await pool.end();
  }
}

migrate().catch(() => process.exit(1));
