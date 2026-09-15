/**
 * Export the corporate desk's people to a JSON file, for importing into another
 * installation (e.g. the production VM) with import-corporate-people.js.
 *
 *   node src/config/export-corporate-people.js [output.json]
 *
 * Exports corporate teams, delivery staff (team memberships + reporting line)
 * and corporate customers. It deliberately does NOT export password hashes:
 * imported accounts arrive as "Invited" and get their access through an
 * onboarding email or an admin-set password on the target system.
 *
 * Reporting lines are exported only where the manager is also corporate staff —
 * the corporate hierarchy is self-contained. Executives sit in the corporate
 * Executive team, so the chain up to the CEO travels with the export; links to
 * anyone outside Corporate are left behind.
 *
 * The output contains names, emails and phone numbers. It is git-ignored; copy
 * it to the target machine directly and delete it afterwards.
 */
import fs from "fs";
import path from "path";
import mysql from "mysql2/promise";
import dotenv from "dotenv";
dotenv.config();

const unquote = (v) => (v || "").replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");
const out = path.resolve(process.argv[2] || "corporate-people-export.json");

const pool = mysql.createPool({
  host: process.env.DATABASE_HOST,
  port: Number(process.env.DATABASE_PORT) || 3306,
  user: unquote(process.env.DATABASE_USER),
  password: unquote(process.env.DATABASE_PASSWORD),
  database: unquote(process.env.DATABASE_NAME),
});

const IS_CUSTOMER = `EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id
                             WHERE ur.user_id = u.id AND r.name = 'corporate_customer')`;

try {
  const [teams] = await pool.query(
    `SELECT name, description, corporate_role FROM teams WHERE workspace = 'corporate' ORDER BY name`
  );

  const [staffRows] = await pool.query(
    `SELECT u.id, u.email, u.full_name, u.title, u.phone, u.is_active
       FROM users u
      WHERE EXISTS (SELECT 1 FROM team_members tm JOIN teams t ON t.id = tm.team_id
                     WHERE tm.user_id = u.id AND t.workspace = 'corporate')
        AND NOT ${IS_CUSTOMER}
      ORDER BY u.full_name`
  );
  const staffIds = new Set(staffRows.map((s) => s.id));
  const emailById = new Map(staffRows.map((s) => [s.id, s.email]));

  const [memberships] = await pool.query(
    `SELECT tm.user_id, tm.is_lead, t.name AS team_name, t.corporate_role
       FROM team_members tm JOIN teams t ON t.id = tm.team_id
      WHERE t.workspace = 'corporate'`
  );
  const [links] = await pool.query(
    `SELECT user_id, manager_id FROM user_hierarchy WHERE level = 1 AND is_active = 1`
  );
  const managerOf = new Map(links.map((l) => [l.user_id, l.manager_id]));

  const staff = staffRows.map((s) => {
    const mgr = managerOf.get(s.id);
    return {
      email: s.email,
      full_name: s.full_name,
      title: s.title,
      phone: s.phone,
      is_active: !!s.is_active,
      memberships: memberships
        .filter((m) => m.user_id === s.id)
        .map((m) => ({ team_name: m.team_name, corporate_role: m.corporate_role, is_lead: !!m.is_lead })),
      manager_email: mgr && staffIds.has(mgr) ? emailById.get(mgr) : null,
    };
  });

  const [customers] = await pool.query(
    `SELECT u.email, u.full_name, u.title, u.company, u.phone, u.is_active
       FROM users u WHERE ${IS_CUSTOMER} ORDER BY u.full_name`
  );

  const data = {
    format: "servicedesk.corporate-people.v1",
    exported_at: new Date().toISOString(),
    teams,
    staff,
    customers: customers.map((c) => ({ ...c, is_active: !!c.is_active })),
  };
  fs.writeFileSync(out, JSON.stringify(data, null, 2), { mode: 0o600 });

  const withManager = staff.filter((s) => s.manager_email).length;
  console.log(`Exported to ${out}`);
  console.log(`  teams:     ${teams.length} (${teams.map((t) => t.name).join(", ")})`);
  console.log(`  staff:     ${staff.length} (${withManager} with a corporate reporting line)`);
  console.log(`  customers: ${customers.length}`);
  console.log("  passwords: not exported — accounts import as Invited");
  await pool.end();
} catch (e) {
  console.error("Export failed:", e.message);
  await pool.end();
  process.exit(1);
}
