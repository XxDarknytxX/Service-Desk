/**
 * Import corporate people exported by export-corporate-people.js.
 *
 *   node src/config/import-corporate-people.js <export.json> [--dry-run]
 *
 * Safe to run on a live system, and safe to re-run:
 *
 *   • Teams are matched by name. Missing corporate teams are created. A team
 *     that exists as INTERNAL is only switched to corporate if it has no members
 *     and no tickets; otherwise it's reported and its memberships are skipped.
 *
 *   • People are matched by email (case-insensitive). An account that already
 *     exists is NEVER modified in ways that could lock someone out — its
 *     password, roles and active flag are left alone (e.g. an admin account on
 *     the target keeps its admin role and password). Only missing corporate
 *     team memberships and an unset reporting line are added.
 *
 *   • New accounts are created as "Invited": a random password nobody knows and
 *     must_set_password = 1. Nothing is emailed — send onboarding emails from
 *     Corporate → People when you're ready.
 *
 *   • A team manager (is_lead) is only imported as manager if the team has no
 *     manager on the target yet; otherwise they join as a member and it's noted.
 *
 *   • Reporting lines are set only for people who don't already have a manager
 *     on the target, and only between corporate staff. The cached hierarchy
 *     chains are rebuilt for everyone affected.
 *
 * --dry-run runs everything inside a transaction and rolls it back, printing
 * what would change.
 */
import fs from "fs";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import mysql from "mysql2/promise";
import dotenv from "dotenv";
dotenv.config();

const file = process.argv[2];
const DRY = process.argv.includes("--dry-run");
if (!file || file.startsWith("--")) {
  console.error("Usage: node src/config/import-corporate-people.js <export.json> [--dry-run]");
  process.exit(1);
}

const unquote = (v) => (v || "").replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");
const c = { g: (s) => `\x1b[32m${s}\x1b[0m`, y: (s) => `\x1b[33m${s}\x1b[0m`, r: (s) => `\x1b[31m${s}\x1b[0m`, d: (s) => `\x1b[2m${s}\x1b[0m` };

const data = JSON.parse(fs.readFileSync(file, "utf8"));
if (data.format !== "servicedesk.corporate-people.v1") {
  console.error(`Unrecognised file format: ${data.format}`);
  process.exit(1);
}

const conn = await mysql.createConnection({
  host: process.env.DATABASE_HOST,
  port: Number(process.env.DATABASE_PORT) || 3306,
  user: unquote(process.env.DATABASE_USER),
  password: unquote(process.env.DATABASE_PASSWORD),
  database: unquote(process.env.DATABASE_NAME),
});

const stats = { teamsCreated: 0, teamsTagged: 0, created: 0, merged: 0, memberships: 0, managers: 0, notes: [] };
const note = (msg) => stats.notes.push(msg);

async function roleId(name) {
  const [[r]] = await conn.query("SELECT id FROM roles WHERE name = ?", [name]);
  if (!r) throw new Error(`Role '${name}' missing — run the bootstrap migrations first`);
  return r.id;
}

async function unusableHash() {
  return bcrypt.hash(crypto.randomBytes(48).toString("base64url"), 10);
}

async function directManager(userId) {
  const [[row]] = await conn.query(
    "SELECT manager_id FROM user_hierarchy WHERE user_id = ? AND level = 1 AND is_active = 1 LIMIT 1",
    [userId]
  );
  return row?.manager_id || null;
}

// Rebuild cached multi-level rows for a user and everyone below them (same
// algorithm as services/hierarchyService.setDirectManager, on this connection
// so --dry-run can roll it back).
async function setDirectManager(userId, managerId) {
  const order = [];
  let frontier = [userId];
  const visited = new Set(frontier);
  while (frontier.length) {
    const [rows] = await conn.query(
      "SELECT user_id, manager_id FROM user_hierarchy WHERE level = 1 AND is_active = 1 AND manager_id IN (?)",
      [frontier]
    );
    const next = [];
    for (const r of rows) {
      if (visited.has(r.user_id)) continue;
      visited.add(r.user_id);
      order.push([r.user_id, r.manager_id]);
      next.push(r.user_id);
    }
    frontier = next;
  }
  for (const [uid, mid] of [[userId, managerId], ...order]) {
    await conn.query("DELETE FROM user_hierarchy WHERE user_id = ?", [uid]);
    let m = mid;
    const seen = new Set([uid]);
    for (let level = 1; m && level <= 12 && !seen.has(m); level++) {
      seen.add(m);
      await conn.query(
        "INSERT INTO user_hierarchy (user_id, manager_id, level, is_active) VALUES (?, ?, ?, 1)",
        [uid, m, level]
      );
      m = await directManager(m);
    }
  }
}

async function wouldLoop(userId, managerId) {
  let cur = managerId;
  const seen = new Set();
  while (cur && !seen.has(cur) && seen.size < 200) {
    if (cur === userId) return true;
    seen.add(cur);
    cur = await directManager(cur);
  }
  return false;
}

// The file may use team roles this database doesn't know yet (e.g. 'executive'
// before the corporate-people migration has run). Stop with a clear message
// rather than failing half-way through the transaction.
{
  const [[col]] = await conn.query(
    `SELECT COLUMN_TYPE AS t FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'teams' AND COLUMN_NAME = 'corporate_role'`
  );
  const unknown = [...new Set(data.teams.map((t) => t.corporate_role).filter(Boolean))]
    .filter((r) => !(col?.t || "").includes(`'${r}'`));
  if (unknown.length) {
    console.error(c.r(`This database doesn't support team role(s): ${unknown.join(", ")}.`));
    console.error("Deploy the latest code first (it runs src/config/corporate-people-migration.js), then re-run the import.");
    await conn.end();
    process.exit(1);
  }
}

try {
  await conn.beginTransaction();
  const AGENT = await roleId("agent");
  const CUSTOMER = await roleId("corporate_customer");

  // ── Teams ───────────────────────────────────────────────────────────────
  const teamIdByName = new Map();
  for (const t of data.teams) {
    const [[existing]] = await conn.query("SELECT id, workspace, corporate_role FROM teams WHERE name = ?", [t.name]);
    if (!existing) {
      const [ins] = await conn.query(
        "INSERT INTO teams (name, description, workspace, corporate_role) VALUES (?, ?, 'corporate', ?)",
        [t.name, t.description, t.corporate_role]
      );
      teamIdByName.set(t.name, ins.insertId);
      stats.teamsCreated++;
      continue;
    }
    if (existing.workspace !== "corporate") {
      const [[{ members }]] = await conn.query("SELECT COUNT(*) AS members FROM team_members WHERE team_id = ?", [existing.id]);
      const [[{ tickets }]] = await conn.query("SELECT COUNT(*) AS tickets FROM tickets WHERE team_id = ?", [existing.id]);
      if (members || tickets) {
        note(`team "${t.name}" exists on this system as an INTERNAL team in use — its corporate memberships were skipped`);
        continue;
      }
      await conn.query("UPDATE teams SET workspace = 'corporate', corporate_role = ? WHERE id = ?", [t.corporate_role, existing.id]);
      stats.teamsTagged++;
    } else if (!existing.corporate_role && t.corporate_role) {
      await conn.query("UPDATE teams SET corporate_role = ? WHERE id = ?", [t.corporate_role, existing.id]);
    }
    teamIdByName.set(t.name, existing.id);
  }

  // ── People ──────────────────────────────────────────────────────────────
  const idByEmail = new Map();

  async function upsertPerson(p, kind) {
    const email = p.email.trim().toLowerCase();
    const [[existing]] = await conn.query(
      `SELECT u.id,
              EXISTS(SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id
                      WHERE ur.user_id = u.id AND r.name = 'corporate_customer') AS is_customer
         FROM users u WHERE LOWER(u.email) = ?`,
      [email]
    );
    if (existing) {
      if (kind === "customer" && !existing.is_customer) {
        note(`${email} already exists here as staff — not converted to a customer`);
        return null;
      }
      if (kind === "staff" && existing.is_customer) {
        note(`${email} already exists here as a customer — not given staff access`);
        return null;
      }
      // Fill blanks only; never overwrite what the target already has.
      await conn.query(
        `UPDATE users SET title = COALESCE(NULLIF(title, ''), ?), phone = COALESCE(NULLIF(phone, ''), ?)
                         ${kind === "customer" ? ", company = COALESCE(NULLIF(company, ''), ?)" : ""}
          WHERE id = ?`,
        kind === "customer" ? [p.title, p.phone, p.company, existing.id] : [p.title, p.phone, existing.id]
      );
      stats.merged++;
      idByEmail.set(email, existing.id);
      return existing.id;
    }
    const [ins] = await conn.query(
      `INSERT INTO users (email, password_hash, must_set_password, full_name, title, company, phone, is_active)
       VALUES (?, ?, 1, ?, ?, ?, ?, ?)`,
      [email, await unusableHash(), p.full_name, p.title || null, kind === "customer" ? p.company || null : null, p.phone || null, p.is_active ? 1 : 0]
    );
    await conn.query("INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)", [ins.insertId, kind === "customer" ? CUSTOMER : AGENT]);
    stats.created++;
    idByEmail.set(email, ins.insertId);
    return ins.insertId;
  }

  for (const s of data.staff) {
    const id = await upsertPerson(s, "staff");
    if (!id) continue;
    for (const m of s.memberships) {
      const teamId = teamIdByName.get(m.team_name);
      if (!teamId) continue;
      const [[already]] = await conn.query("SELECT is_lead FROM team_members WHERE team_id = ? AND user_id = ?", [teamId, id]);
      if (already) continue;
      let lead = m.is_lead;
      if (lead) {
        const [[otherLead]] = await conn.query(
          "SELECT u.email FROM team_members tm JOIN users u ON u.id = tm.user_id WHERE tm.team_id = ? AND tm.is_lead = 1 LIMIT 1",
          [teamId]
        );
        if (otherLead) {
          lead = false;
          note(`${s.email} joined ${m.team_name} as a member — it already has a manager here (${otherLead.email})`);
        }
      }
      await conn.query("INSERT INTO team_members (team_id, user_id, is_lead) VALUES (?, ?, ?)", [teamId, id, lead ? 1 : 0]);
      stats.memberships++;
    }
  }

  for (const cu of data.customers) await upsertPerson(cu, "customer");

  // ── Reporting lines ─────────────────────────────────────────────────────
  for (const s of data.staff) {
    if (!s.manager_email) continue;
    const uid = idByEmail.get(s.email.toLowerCase());
    const mid = idByEmail.get(s.manager_email.toLowerCase());
    if (!uid || !mid) continue;
    if (await directManager(uid)) continue; // keep the target's own reporting line
    if (await wouldLoop(uid, mid)) {
      note(`${s.email} → ${s.manager_email} skipped: it would create a reporting loop here`);
      continue;
    }
    await setDirectManager(uid, mid);
    stats.managers++;
  }

  if (DRY) await conn.rollback();
  else await conn.commit();

  console.log(`\n${DRY ? c.y("DRY RUN — nothing was saved") : c.g("Import complete")}`);
  console.log(`  teams:          ${stats.teamsCreated} created, ${stats.teamsTagged} switched to corporate`);
  console.log(`  people:         ${stats.created} created as Invited, ${stats.merged} already here (merged)`);
  console.log(`  team places:    ${stats.memberships} added`);
  console.log(`  reporting lines:${String(stats.managers).padStart(2)} set`);
  if (stats.notes.length) {
    console.log(c.y("\n  Notes:"));
    for (const n of stats.notes) console.log(c.y(`   • ${n}`));
  }
  if (!DRY && stats.created) {
    console.log(c.d("\n  New accounts can't sign in until activated: Corporate → People → send onboarding email (or set a password)."));
  }
  await conn.end();
} catch (e) {
  await conn.rollback().catch(() => {});
  console.error(c.r(`Import failed — nothing was saved: ${e.message}`));
  await conn.end();
  process.exit(1);
}
