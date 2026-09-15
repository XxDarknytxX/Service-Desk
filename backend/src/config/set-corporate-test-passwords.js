/**
 * Set known TEST passwords for the corporate flow's managers and engineers.
 *
 *   node src/config/set-corporate-test-passwords.js --suffix "<suffix>" [--dry-run] [--include-admins]
 *
 * Everyone in a corporate delivery queue, NOC or Service Delivery — managers and
 * engineers — gets "<FirstName><suffix>" (first word of their name, capitalised),
 * e.g. --suffix "#2026" gives Ashnil#2026. Meant for walking through the flow
 * before go-live; switch people to onboarding emails / their own passwords after.
 *
 *   • Invited accounts are activated (must_set_password = 0) and any unused
 *     invitation / reset links are retired, so the known password is the way in.
 *   • Existing sessions are signed out (password_changed_at).
 *   • Admin accounts are skipped unless --include-admins, so an admin's own
 *     login isn't changed by accident. Executives and business-team heads aren't
 *     touched — they aren't in these teams.
 *   • --dry-run shows who would change and saves nothing.
 *
 * The suffix is passed in rather than written here so no password pattern lives
 * in the repository.
 */
import bcrypt from "bcryptjs";
import mysql from "mysql2/promise";
import dotenv from "dotenv";
dotenv.config();

const args = process.argv.slice(2);
const DRY = args.includes("--dry-run");
const INCLUDE_ADMINS = args.includes("--include-admins");
const suffixAt = args.indexOf("--suffix");
const SUFFIX = suffixAt !== -1 ? args[suffixAt + 1] : undefined;
if (!SUFFIX || SUFFIX.startsWith("--")) {
  console.error('Usage: node src/config/set-corporate-test-passwords.js --suffix "<suffix>" [--dry-run] [--include-admins]');
  process.exit(1);
}

const unquote = (v) => (v || "").replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");
const DB = unquote(process.env.DATABASE_NAME);
const c = { g: (s) => `\x1b[32m${s}\x1b[0m`, y: (s) => `\x1b[33m${s}\x1b[0m`, r: (s) => `\x1b[31m${s}\x1b[0m`, d: (s) => `\x1b[2m${s}\x1b[0m` };

// Same rules as services/passwordResetService.validateNewPassword.
function passwordProblem(pw) {
  if (pw.length < 8) return "shorter than 8 characters";
  if (Buffer.byteLength(pw, "utf8") > 72) return "too long";
  if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) return "needs a letter and a number";
  return null;
}

const POSITION = {
  queue: ["Delivery Engineer", "Delivery Manager"],
  triage: ["Triage Engineer (NOC)", "Triage Manager (NOC)"],
  service_delivery: ["Service Delivery Executive", "Service Delivery Manager"],
};

const conn = await mysql.createConnection({
  host: process.env.DATABASE_HOST,
  port: Number(process.env.DATABASE_PORT) || 3306,
  user: unquote(process.env.DATABASE_USER),
  password: unquote(process.env.DATABASE_PASSWORD),
  database: DB,
});

async function colExists(table, col) {
  const [r] = await conn.query(
    "SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?",
    [DB, table, col]
  );
  return r.length > 0;
}

try {
  const [rows] = await conn.query(
    `SELECT u.id, u.email, u.full_name, t.name AS team, t.corporate_role, tm.is_lead,
            EXISTS(SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id
                    WHERE ur.user_id = u.id AND r.name = 'admin') AS is_admin
       FROM users u
       JOIN team_members tm ON tm.user_id = u.id
       JOIN teams t ON t.id = tm.team_id
      WHERE u.is_active = 1
        AND t.workspace = 'corporate' AND t.corporate_role IN ('queue', 'triage', 'service_delivery')
        AND NOT EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id
                         WHERE ur.user_id = u.id AND r.name = 'corporate_customer')
      ORDER BY tm.is_lead DESC, t.name, u.full_name`
  );

  // One entry per person (a manager can lead two teams, e.g. NOC and MTX).
  const people = new Map();
  for (const r of rows) {
    const p = people.get(r.id) || { ...r, positions: [], lead: false };
    p.positions.push(`${POSITION[r.corporate_role][r.is_lead ? 1 : 0]} · ${r.team}`);
    p.lead = p.lead || !!r.is_lead;
    people.set(r.id, p);
  }

  const targets = [];
  const skipped = [];
  for (const p of people.values()) {
    const first = String(p.full_name || "").trim().split(/\s+/)[0] || "";
    const name = first.charAt(0).toUpperCase() + first.slice(1);
    const password = `${name}${SUFFIX}`;
    if (p.is_admin && !INCLUDE_ADMINS) { skipped.push([p, "admin account — use --include-admins to change it"]); continue; }
    const problem = passwordProblem(password);
    if (!name || problem) { skipped.push([p, `"${password}" ${problem || "has no first name"}`]); continue; }
    targets.push({ ...p, password });
  }

  const hasChangedAt = await colExists("users", "password_changed_at");
  const hasMustSet = await colExists("users", "must_set_password");
  const [[tokens]] = await conn.query(
    "SELECT COUNT(*) AS n FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'password_reset_tokens'",
    [DB]
  );

  await conn.beginTransaction();
  for (const t of targets) {
    const sets = ["password_hash = ?"];
    if (hasChangedAt) sets.push("password_changed_at = NOW()");
    if (hasMustSet) sets.push("must_set_password = 0");
    await conn.query(`UPDATE users SET ${sets.join(", ")} WHERE id = ?`, [await bcrypt.hash(t.password, 10), t.id]);
  }
  if (targets.length && tokens.n) {
    await conn.query(
      "UPDATE password_reset_tokens SET used_at = NOW() WHERE used_at IS NULL AND user_id IN (?)",
      [targets.map((t) => t.id)]
    );
  }
  if (DRY) await conn.rollback();
  else await conn.commit();

  const pad = (s, n) => String(s).padEnd(n);
  const w = Math.max(...targets.map((t) => t.email.length), 5);
  console.log(`\n${DRY ? c.y("DRY RUN — nothing was saved") : c.g(`Passwords set for ${targets.length} people`)}\n`);
  for (const group of [["Managers", true], ["Engineers", false]]) {
    const list = targets.filter((t) => t.lead === group[1]);
    if (!list.length) continue;
    console.log(`  ${group[0]}`);
    for (const t of list) console.log(`    ${pad(t.email, w)}  ${pad(t.password, 18)} ${c.d(t.positions.join(", "))}`);
    console.log("");
  }
  if (skipped.length) {
    console.log(c.y("  Skipped"));
    for (const [p, why] of skipped) console.log(c.y(`    ${pad(p.email, w)}  ${why}`));
    console.log("");
  }
  await conn.end();
} catch (e) {
  await conn.rollback().catch(() => {});
  console.error(c.r(`Failed — nothing was saved: ${e.message}`));
  await conn.end();
  process.exit(1);
}
