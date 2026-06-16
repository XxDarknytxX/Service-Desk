/**
 * NOC / MTX restructure migration (idempotent, additive).
 *
 *  - Rename the "Network Operations" team to "NOC" (the triage queue).
 *  - Create a separate "MTX" team (NOC & MTX share a manager — set in the seed).
 *  - service_categories: add `sla_grace_pct` (longer SLA) and `is_triage`;
 *    repoint Unified Communications → MTX; add a "Not sure" category that routes
 *    to NOC with +50% SLA for triage.
 *  - users: add a `company` column (admin-managed) shown on corporate tickets.
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

async function colExists(conn, table, col) {
  const [r] = await conn.query(
    `SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME=? AND COLUMN_NAME=?`,
    [DB, table, col]
  );
  return r.length > 0;
}
async function teamId(conn, name) {
  const [[t]] = await conn.query(`SELECT id FROM teams WHERE name=? LIMIT 1`, [name]);
  return t?.id ?? null;
}

async function migrate() {
  const conn = await pool.getConnection();
  try {
    // 1) Rename Network Operations → NOC (only if NOC doesn't already exist)
    if (!(await teamId(conn, "NOC"))) {
      const netOps = await teamId(conn, "Network Operations");
      if (netOps) {
        await conn.query(`UPDATE teams SET name='NOC' WHERE id=?`, [netOps]);
        console.log("  renamed 'Network Operations' → 'NOC'");
      }
    }

    // 2) Create MTX team
    await conn.query(
      `INSERT INTO teams (name, description)
       SELECT 'MTX', 'Managed Transmission / Unified Communications team'
       WHERE NOT EXISTS (SELECT 1 FROM teams WHERE name='MTX')`
    );
    console.log("  MTX team ensured");

    // 3) service_categories columns
    if (!(await colExists(conn, "service_categories", "sla_grace_pct"))) {
      await conn.query(`ALTER TABLE service_categories ADD COLUMN sla_grace_pct INT NOT NULL DEFAULT 0 AFTER routing_team_id`);
      console.log("  added service_categories.sla_grace_pct");
    }
    if (!(await colExists(conn, "service_categories", "is_triage"))) {
      await conn.query(`ALTER TABLE service_categories ADD COLUMN is_triage TINYINT(1) NOT NULL DEFAULT 0 AFTER sla_grace_pct`);
      console.log("  added service_categories.is_triage");
    }

    const nocId = await teamId(conn, "NOC");
    const mtxId = await teamId(conn, "MTX");

    // Repoint Unified Communications → MTX
    await conn.query(`UPDATE service_categories SET routing_team_id=? WHERE \`key\`='unified_comms'`, [mtxId]);
    console.log(`  unified_comms → MTX (#${mtxId})`);

    // Add the "Not sure" triage category → NOC, +50% SLA
    await conn.query(
      `INSERT INTO service_categories (\`key\`, name, description, routing_team_id, sla_grace_pct, is_triage, icon, sort_order)
       VALUES ('not_sure', 'Not sure', 'Not sure who handles it — NOC will triage and route it to the right team.', ?, 50, 1, 'alertCircle', 99)
       ON DUPLICATE KEY UPDATE name=VALUES(name), description=VALUES(description), routing_team_id=VALUES(routing_team_id),
         sla_grace_pct=VALUES(sla_grace_pct), is_triage=VALUES(is_triage), icon=VALUES(icon), sort_order=VALUES(sort_order)`,
      [nocId]
    );
    console.log(`  'Not sure' → NOC (#${nocId}), +50% SLA, triage`);

    // 4) users.company
    if (!(await colExists(conn, "users", "company"))) {
      await conn.query(`ALTER TABLE users ADD COLUMN company VARCHAR(150) NULL AFTER title`);
      console.log("  added users.company");
    }

    console.log("noc-mtx migration completed.");
  } catch (e) {
    console.error("Migration failed:", e.message);
    throw e;
  } finally {
    conn.release();
    await pool.end();
  }
}

migrate().catch(() => process.exit(1));
