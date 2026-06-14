/**
 * ticket_teams work-completion migration (idempotent, additive).
 *
 * completeTeamWork() in ticketController writes completed_at / completed_by /
 * completion_notes, but the base schema never defined them — so marking a
 * team's work complete on a multi-team ticket 500'd. This adds them.
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
    const adds = [
      ["completed_at", "DATETIME NULL AFTER notes"],
      ["completed_by", "INT NULL AFTER completed_at"],
      ["completion_notes", "TEXT NULL AFTER completed_by"],
    ];
    for (const [col, ddl] of adds) {
      const [c] = await conn.query(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'ticket_teams' AND COLUMN_NAME = ?`,
        [process.env.DATABASE_NAME, col]
      );
      if (c.length === 0) {
        await conn.query(`ALTER TABLE ticket_teams ADD COLUMN ${col} ${ddl}`);
        console.log("  Added", col, "to ticket_teams");
      }
    }
    console.log("ticket_teams migration completed.");
  } catch (e) {
    console.error("Migration failed:", e.message);
    throw e;
  } finally {
    conn.release();
    await pool.end();
  }
}

migrate().catch(() => process.exit(1));
