// src/config/db.js
import mysql from "mysql2/promise";

const isProd = process.env.NODE_ENV === "production";
const unquote = v => (v || "").replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");

const base = {
  host: process.env.DATABASE_HOST || "localhost",
  port: Number(process.env.DATABASE_PORT || 3306),
  user: unquote(process.env.DATABASE_USER),
  password: unquote(process.env.DATABASE_PASSWORD),
  waitForConnections: true,
  connectionLimit: isProd ? 25 : 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,
};

/**
 * Ensures the database exists (if DATABASE_NAME is set) and returns a pooled connection.
 */
export async function getPool() {
  const db = process.env.DATABASE_NAME;
  const admin = await mysql.createConnection(base);
  if (db) {
    await admin.query(
      `CREATE DATABASE IF NOT EXISTS \`${db}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`
    );
  }
  await admin.end();
  return mysql.createPool({ ...base, database: db || undefined });
}
