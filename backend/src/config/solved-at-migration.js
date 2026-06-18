/**
 * Adds tickets.solved_at (idempotent, additive).
 * Resolving a ticket now stamps solved_at; closed_at is reserved for actual close.
 * The 3-day auto-close uses solved_at. Run: node src/config/solved-at-migration.js
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

async function run() {
  const conn = await pool.getConnection();
  try {
    const [cols] = await conn.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'tickets' AND COLUMN_NAME = 'solved_at'`,
      [DB]
    );
    if (cols.length === 0) {
      await conn.query("ALTER TABLE tickets ADD COLUMN solved_at DATETIME NULL AFTER closed_at");
      console.log("Added tickets.solved_at");
    } else {
      console.log("tickets.solved_at already exists");
    }
  } finally {
    conn.release();
    await pool.end();
  }
}
run().catch((e) => { console.error(e); process.exit(1); });
