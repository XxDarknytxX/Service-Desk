/**
 * NOC / MTX seed (idempotent).
 *
 *  - Mere Tuilagi manages BOTH NOC and MTX (common manager): she's added to the
 *    MTX team as lead and her title reflects both.
 *  - MTX gets its own engineers, reporting to Mere.
 *  - Corporate customers' "Position, Company" title is split into a proper
 *    `company` + `title` (position) so it can show on their tickets.
 */
import mysql from "mysql2/promise";
import bcrypt from "bcryptjs";
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
const STAFF_PW = "vodafone123";

async function roleId(conn, name) { const [[r]] = await conn.query(`SELECT id FROM roles WHERE name=? LIMIT 1`, [name]); return r?.id ?? null; }
async function userIdByEmail(conn, email) { const [[u]] = await conn.query(`SELECT id FROM users WHERE email=? LIMIT 1`, [email]); return u?.id ?? null; }
async function teamIdByName(conn, name) { const [[t]] = await conn.query(`SELECT id FROM teams WHERE name=? LIMIT 1`, [name]); return t?.id ?? null; }

async function ensureUser(conn, { full_name, email, title, company = null, password, roles }) {
  let id = await userIdByEmail(conn, email);
  if (!id) {
    const hash = await bcrypt.hash(password, 10);
    const [res] = await conn.query(
      `INSERT INTO users (email, password_hash, full_name, title, company, is_active) VALUES (?,?,?,?,?,1)`,
      [email, hash, full_name, title, company]
    );
    id = res.insertId;
    console.log(`  + user ${full_name} (#${id})`);
  } else {
    await conn.query(`UPDATE users SET full_name=?, title=?, company=? WHERE id=?`, [full_name, title, company, id]);
  }
  await conn.query(`DELETE FROM user_roles WHERE user_id=?`, [id]);
  for (const rn of roles) { const rid = await roleId(conn, rn); if (rid) await conn.query(`INSERT IGNORE INTO user_roles (user_id, role_id) VALUES (?,?)`, [id, rid]); }
  return id;
}

async function setManager(conn, userId, managerId) {
  await conn.query(`DELETE FROM user_hierarchy WHERE user_id=?`, [userId]);
  let level = 1, mgr = managerId; const seen = new Set([userId]);
  while (mgr && !seen.has(mgr)) {
    seen.add(mgr);
    await conn.query(`INSERT IGNORE INTO user_hierarchy (user_id, manager_id, level, is_active) VALUES (?,?,?,1)`, [userId, mgr, level]);
    const [[up]] = await conn.query(`SELECT manager_id FROM user_hierarchy WHERE user_id=? AND level=1 LIMIT 1`, [mgr]);
    mgr = up?.manager_id ?? null; level++;
  }
}
async function addTeamMember(conn, teamId, userId, isLead = 0) {
  if (!teamId || !userId) return;
  await conn.query(
    `INSERT INTO team_members (team_id, user_id, is_lead) VALUES (?,?,?) ON DUPLICATE KEY UPDATE is_lead=VALUES(is_lead)`,
    [teamId, userId, isLead]
  );
}

async function seed() {
  const conn = await pool.getConnection();
  try {
    const noc = await teamIdByName(conn, "NOC");
    const mtx = await teamIdByName(conn, "MTX");
    const mere = await userIdByEmail(conn, "mere.tuilagi@vodafone.com.fj");
    if (!noc || !mtx || !mere) throw new Error("Expected NOC, MTX teams and Mere Tuilagi to exist");

    // Mere manages both NOC and MTX
    await conn.query(`UPDATE users SET title='NOC & MTX Manager' WHERE id=?`, [mere]);
    await addTeamMember(conn, noc, mere, 1);
    await addTeamMember(conn, mtx, mere, 1);
    console.log("  Mere Tuilagi → lead of NOC + MTX");

    // MTX engineers (report to Mere, the shared manager)
    const mtxEngineers = [
      { full_name: "Ilisapeci Rokovesa", email: "ilisapeci.rokovesa@vodafone.com.fj", title: "Unified Comms Engineer" },
      { full_name: "Deepak Chand", email: "deepak.chand@vodafone.com.fj", title: "Unified Comms Engineer" },
    ];
    for (const e of mtxEngineers) {
      const id = await ensureUser(conn, { ...e, password: STAFF_PW, roles: ["agent", "requester"] });
      await setManager(conn, id, mere);
      await addTeamMember(conn, mtx, id, 0);
    }
    console.log(`  MTX: ${mtxEngineers.length} engineers under Mere`);

    // Split corporate customers' "Position, Company" → company + title
    const corp = [
      { email: "rajesh.kumar@pacifictrade.com.fj", title: "ICT Coordinator", company: "Pacific Trade Fiji" },
      { email: "sereima.volau@fijiwater.com.fj", title: "Systems Administrator", company: "Fiji Water" },
    ];
    for (const c of corp) {
      const id = await userIdByEmail(conn, c.email);
      if (id) {
        await conn.query(`UPDATE users SET title=?, company=? WHERE id=?`, [c.title, c.company, id]);
        console.log(`  ${c.email} → ${c.title} @ ${c.company}`);
      }
    }

    console.log("\nnoc-mtx seed completed.");
  } catch (e) {
    console.error("Seed failed:", e.message);
    throw e;
  } finally {
    conn.release();
    await pool.end();
  }
}

seed().catch(() => process.exit(1));
