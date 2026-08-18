/**
 * Create (or reset the password of) an admin user.
 *
 * Usage — from the backend/ directory:
 *   ADMIN_EMAIL=someone@example.com ADMIN_PASSWORD='the-password' \
 *     ADMIN_NAME='Their Name' node src/config/create-admin.js
 *
 * Or interactively, so the password never lands in your shell history:
 *   ADMIN_EMAIL=someone@example.com node src/config/create-admin.js
 *   (it will prompt, with the input hidden)
 *
 * If the user already exists this RESETS their password and makes sure they
 * hold the admin + agent roles — which is also how you rotate the default
 * admin@servicedesk.local / admin123 credentials after a fresh install.
 *
 * Nothing is written to disk and no credential is ever committed: the password
 * is read from the environment or the prompt, hashed with bcrypt, and only the
 * hash is stored.
 */

import mysql from "mysql2/promise";
import bcrypt from "bcryptjs";
import readline from "readline";
import dotenv from "dotenv";

dotenv.config();

const unquote = (v) => (v || "").replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");

const c = {
  g: (s) => `\x1b[32m${s}\x1b[0m`,
  y: (s) => `\x1b[33m${s}\x1b[0m`,
  r: (s) => `\x1b[31m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
};

// Prompt without echoing the password to the terminal.
function promptHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const onData = (char) => {
      if (["\n", "\r", ""].includes(String(char))) {
        process.stdin.removeListener("data", onData);
      } else {
        // Redraw the prompt so the typed characters never appear.
        process.stdout.write("\x1b[2K\x1b[200D" + question);
      }
    };
    process.stdin.on("data", onData);
    rl.question(question, (value) => {
      rl.close();
      process.stdout.write("\n");
      resolve(value);
    });
  });
}

async function main() {
  const email = (process.env.ADMIN_EMAIL || process.argv[2] || "").trim();
  if (!email) {
    console.error(c.r("ADMIN_EMAIL is required.") + " e.g. ADMIN_EMAIL=you@example.com node src/config/create-admin.js");
    process.exit(1);
  }

  let password = process.env.ADMIN_PASSWORD || "";
  if (!password) password = await promptHidden(`Password for ${email}: `);
  if (password.length < 8) {
    console.error(c.r("Password must be at least 8 characters."));
    process.exit(1);
  }

  // Derive a sensible display name from the email when one isn't supplied:
  // "savneel.kant@vodafone.com.fj" -> "Savneel Kant".
  const fullName =
    process.env.ADMIN_NAME ||
    email
      .split("@")[0]
      .split(/[._-]+/)
      .filter(Boolean)
      .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
      .join(" ");

  const conn = await mysql.createConnection({
    host: process.env.DATABASE_HOST || "localhost",
    port: Number(process.env.DATABASE_PORT || 3306),
    user: unquote(process.env.DATABASE_USER),
    password: unquote(process.env.DATABASE_PASSWORD),
    database: process.env.DATABASE_NAME,
  });

  try {
    const hash = await bcrypt.hash(password, 10);
    const [[existing]] = await conn.query("SELECT id, full_name FROM users WHERE email = ?", [email]);

    let userId;
    if (existing) {
      userId = existing.id;
      await conn.query("UPDATE users SET password_hash = ?, is_active = 1 WHERE id = ?", [hash, userId]);
      console.log(`${c.y("–")} user existed — password reset and account re-activated`);
    } else {
      const [res] = await conn.query(
        "INSERT INTO users (email, password_hash, full_name, is_active) VALUES (?, ?, ?, 1)",
        [email, hash, fullName]
      );
      userId = res.insertId;
      console.log(`${c.g("✓")} user created`);
    }

    // admin implies agent here: an admin needs the agent capabilities to work
    // tickets, and every role check in the app tests for one or the other.
    const [roles] = await conn.query("SELECT id, name FROM roles WHERE name IN ('admin','agent')");
    if (roles.length === 0) throw new Error("No 'admin'/'agent' roles found — is the schema installed?");
    for (const r of roles) {
      await conn.query("INSERT IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)", [userId, r.id]);
    }

    const [granted] = await conn.query(
      `SELECT r.name FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = ? ORDER BY r.name`,
      [userId]
    );

    console.log(`\n${c.g("Admin account ready.")}`);
    console.log(`  id:    ${userId}`);
    console.log(`  name:  ${fullName}`);
    console.log(`  email: ${email}`);
    console.log(`  roles: ${granted.map((r) => r.name).join(", ")}`);
    console.log(c.dim("\n  The password is stored only as a bcrypt hash.\n"));
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error(c.r("\nFailed:"), err.message);
  process.exit(1);
});
