/**
 * Corporate-flow data seed (idempotent).
 *
 * Adds the people the corporate service-delivery flow needs, mirroring how the
 * existing Cloud/IT teams sit under Vikash Prasad (CTO):
 *
 *  • Savneel Kant — Service Delivery Manager, reporting to Sanil Prakashan
 *    (peer of Nitesh Prasad & Kritish Singh); Sitiveni Tuwai — Service Delivery
 *    Executive — reports to Savneel.
 *  • A lead + two engineers for each previously-empty queue (Transmission,
 *    Network Operations, Security Operations), every lead reporting to Vikash.
 *  • A couple of corporate customers (raise-only) to exercise the flow.
 *
 * Re-running is safe: users are matched by email, hierarchy is rebuilt per user,
 * team membership upserts.
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
const CUST_PW = "corporate123";

async function roleId(conn, name) {
  const [[r]] = await conn.query(`SELECT id FROM roles WHERE name=? LIMIT 1`, [name]);
  return r?.id ?? null;
}
async function userIdByEmail(conn, email) {
  const [[u]] = await conn.query(`SELECT id FROM users WHERE email=? LIMIT 1`, [email]);
  return u?.id ?? null;
}
async function teamIdByName(conn, name) {
  const [[t]] = await conn.query(`SELECT id FROM teams WHERE name=? LIMIT 1`, [name]);
  return t?.id ?? null;
}

/** Create the user if missing; always reconcile their roles. Returns user id. */
async function ensureUser(conn, { full_name, email, title, password, roles }) {
  let id = await userIdByEmail(conn, email);
  if (!id) {
    const hash = await bcrypt.hash(password, 10);
    const [res] = await conn.query(
      `INSERT INTO users (email, password_hash, full_name, title, is_active) VALUES (?,?,?,?,1)`,
      [email, hash, full_name, title]
    );
    id = res.insertId;
    console.log(`  + user ${full_name} (#${id})`);
  } else {
    await conn.query(`UPDATE users SET full_name=?, title=? WHERE id=?`, [full_name, title, id]);
  }
  // reconcile roles
  await conn.query(`DELETE FROM user_roles WHERE user_id=?`, [id]);
  for (const rn of roles) {
    const rid = await roleId(conn, rn);
    if (rid) await conn.query(`INSERT IGNORE INTO user_roles (user_id, role_id) VALUES (?,?)`, [id, rid]);
  }
  return id;
}

/** Rebuild a user's full reporting chain up to the top (mirrors the backend). */
async function setManager(conn, userId, managerId) {
  await conn.query(`DELETE FROM user_hierarchy WHERE user_id=?`, [userId]);
  let level = 1;
  let mgr = managerId;
  const seen = new Set([userId]);
  while (mgr && !seen.has(mgr)) {
    seen.add(mgr);
    await conn.query(
      `INSERT IGNORE INTO user_hierarchy (user_id, manager_id, level, is_active) VALUES (?,?,?,1)`,
      [userId, mgr, level]
    );
    const [[up]] = await conn.query(
      `SELECT manager_id FROM user_hierarchy WHERE user_id=? AND level=1 LIMIT 1`,
      [mgr]
    );
    mgr = up?.manager_id ?? null;
    level++;
  }
}

async function addTeamMember(conn, teamId, userId, isLead = 0) {
  if (!teamId || !userId) return;
  await conn.query(
    `INSERT INTO team_members (team_id, user_id, is_lead) VALUES (?,?,?)
     ON DUPLICATE KEY UPDATE is_lead=VALUES(is_lead)`,
    [teamId, userId, isLead]
  );
}

async function seed() {
  const conn = await pool.getConnection();
  try {
    // anchor people that must already exist
    const sanil = await userIdByEmail(conn, "sanil.prakashan@vodafone.com.fj");
    const vikash = await userIdByEmail(conn, "vikash.kumar@vodafone.com.fj");
    if (!sanil || !vikash) throw new Error("Expected Sanil Prakashan and Vikash Prasad to exist");

    const ictTeam = await teamIdByName(conn, "ICT");
    const corpTeam = await teamIdByName(conn, "Corporate");

    // ── Service delivery branch under Sanil Prakashan ──────────────────────
    const savneel = await ensureUser(conn, {
      full_name: "Savneel Kant", email: "savneel.kant@vodafone.com.fj",
      title: "Service Delivery Manager", password: STAFF_PW, roles: ["agent", "requester"],
    });
    await setManager(conn, savneel, sanil); // peer of Nitesh & Kritish
    await addTeamMember(conn, ictTeam, savneel, 0);

    const sitiveni = await ensureUser(conn, {
      full_name: "Sitiveni Tuwai", email: "sitiveni.tuwai@vodafone.com.fj",
      title: "Service Delivery Executive", password: STAFF_PW, roles: ["agent", "requester"],
    });
    await setManager(conn, sitiveni, savneel); // under Savneel
    await addTeamMember(conn, ictTeam, sitiveni, 0);

    // ── Queue teams under Vikash (lead + engineers each) ───────────────────
    const queues = [
      {
        team: "Transmission",
        lead: { full_name: "Pita Naidu", email: "pita.naidu@vodafone.com.fj", title: "Transmission Manager" },
        engineers: [
          { full_name: "Sefanaia Rokovula", email: "sefanaia.rokovula@vodafone.com.fj", title: "Transmission Engineer" },
          { full_name: "Arun Lata", email: "arun.lata@vodafone.com.fj", title: "Transmission Engineer" },
        ],
      },
      {
        team: "Network Operations",
        lead: { full_name: "Mere Tuilagi", email: "mere.tuilagi@vodafone.com.fj", title: "NOC Manager" },
        engineers: [
          { full_name: "Josefa Vakacegu", email: "josefa.vakacegu@vodafone.com.fj", title: "Network Operations Engineer" },
          { full_name: "Rahul Sami", email: "rahul.sami@vodafone.com.fj", title: "Network Operations Engineer" },
        ],
      },
      {
        team: "Security Operations",
        lead: { full_name: "Tevita Bola", email: "tevita.bola@vodafone.com.fj", title: "Security Operations Manager" },
        engineers: [
          { full_name: "Anish Kumar", email: "anish.kumar@vodafone.com.fj", title: "Security Analyst" },
          { full_name: "Litia Senikau", email: "litia.senikau@vodafone.com.fj", title: "Security Analyst" },
        ],
      },
    ];

    for (const q of queues) {
      const teamId = await teamIdByName(conn, q.team);
      if (!teamId) { console.warn(`  ! team ${q.team} missing, skipping`); continue; }
      const leadId = await ensureUser(conn, { ...q.lead, password: STAFF_PW, roles: ["agent", "requester"] });
      await setManager(conn, leadId, vikash);
      await addTeamMember(conn, teamId, leadId, 1);
      for (const e of q.engineers) {
        const eId = await ensureUser(conn, { ...e, password: STAFF_PW, roles: ["agent", "requester"] });
        await setManager(conn, eId, leadId);
        await addTeamMember(conn, teamId, eId, 0);
      }
      console.log(`  team ${q.team}: lead + ${q.engineers.length} engineers seeded`);
    }

    // ── Corporate customers (raise-only) ───────────────────────────────────
    const customers = [
      { full_name: "Rajesh Kumar", email: "rajesh.kumar@pacifictrade.com.fj", title: "ICT Coordinator, Pacific Trade" },
      { full_name: "Sereima Volau", email: "sereima.volau@fijiwater.com.fj", title: "Systems Administrator, Fiji Water" },
    ];
    for (const c of customers) {
      const id = await ensureUser(conn, { ...c, password: CUST_PW, roles: ["corporate_customer"] });
      await addTeamMember(conn, corpTeam, id, 0); // grouped under the Corporate team
    }
    console.log(`  ${customers.length} corporate customers seeded`);

    console.log("\ncorporate-flow seed completed.");
    console.log(`  staff password: ${STAFF_PW}  |  customer password: ${CUST_PW}`);
  } catch (e) {
    console.error("Seed failed:", e.message);
    throw e;
  } finally {
    conn.release();
    await pool.end();
  }
}

seed().catch(() => process.exit(1));
