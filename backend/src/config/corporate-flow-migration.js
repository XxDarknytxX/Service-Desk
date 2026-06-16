/**
 * Corporate-customer flow migration (idempotent, additive).
 *
 * Adds the pieces the corporate self-service flow needs:
 *   1. a `corporate_customer` role (raise-only customers),
 *   2. a `service_categories` table mapping a customer-facing category to the
 *      team queue it routes to (Connectivity→Transmission, Cloud→Cloud,
 *      Unified Communications→Network Operations, Cyber Security→Security Ops),
 *   3. a `tickets.service_category_id` column so a raised request remembers the
 *      category it was filed under.
 *
 * Safe to run repeatedly: every step checks before it writes.
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

// category key -> { label, team name it routes to, icon }
const CATEGORIES = [
  { key: "connectivity", name: "Connectivity", team: "Transmission", icon: "globe", sort: 1, description: "Links, circuits, transmission & connectivity faults" },
  { key: "cloud", name: "Cloud", team: "Cloud", icon: "box", sort: 2, description: "Cloud hosting, compute, storage & platform requests" },
  { key: "unified_comms", name: "Unified Communications", team: "Network Operations", icon: "phone", sort: 3, description: "Voice, collaboration & unified communications" },
  { key: "cyber_security", name: "Cyber Security", team: "Security Operations", icon: "shield", sort: 4, description: "Security incidents, threats & access concerns" },
];

async function colExists(conn, table, col) {
  const [r] = await conn.query(
    `SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME=? AND COLUMN_NAME=?`,
    [DB, table, col]
  );
  return r.length > 0;
}

async function migrate() {
  const conn = await pool.getConnection();
  try {
    // 1) corporate_customer role
    await conn.query(
      `INSERT INTO roles (name, description)
       SELECT 'corporate_customer', 'Corporate customer - can raise requests only'
       WHERE NOT EXISTS (SELECT 1 FROM roles WHERE name='corporate_customer')`
    );
    console.log("  role corporate_customer ensured");

    // 2) service_categories table
    await conn.query(
      `CREATE TABLE IF NOT EXISTS service_categories (
         id INT AUTO_INCREMENT PRIMARY KEY,
         \`key\` VARCHAR(40) NOT NULL UNIQUE,
         name VARCHAR(120) NOT NULL,
         description VARCHAR(255) NULL,
         routing_team_id INT NULL,
         icon VARCHAR(40) NULL,
         sort_order INT NOT NULL DEFAULT 0,
         is_active TINYINT(1) NOT NULL DEFAULT 1,
         created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
         CONSTRAINT fk_svc_cat_team FOREIGN KEY (routing_team_id) REFERENCES teams(id) ON DELETE SET NULL
       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
    );
    console.log("  service_categories table ensured");

    // seed/repair categories — resolve team id by name so it survives id drift
    for (const c of CATEGORIES) {
      const [[team]] = await conn.query(`SELECT id FROM teams WHERE name=? LIMIT 1`, [c.team]);
      const teamId = team?.id ?? null;
      if (!teamId) console.warn(`  ! team "${c.team}" not found for category ${c.key}`);
      await conn.query(
        `INSERT INTO service_categories (\`key\`, name, description, routing_team_id, icon, sort_order)
         VALUES (?,?,?,?,?,?)
         ON DUPLICATE KEY UPDATE name=VALUES(name), description=VALUES(description),
           routing_team_id=VALUES(routing_team_id), icon=VALUES(icon), sort_order=VALUES(sort_order)`,
        [c.key, c.name, c.description, teamId, c.icon, c.sort]
      );
      console.log(`  category ${c.key} -> team ${c.team} (#${teamId})`);
    }

    // 3) tickets.service_category_id
    if (!(await colExists(conn, "tickets", "service_category_id"))) {
      await conn.query(`ALTER TABLE tickets ADD COLUMN service_category_id INT NULL AFTER type_id`);
      console.log("  added tickets.service_category_id");
      try {
        await conn.query(
          `ALTER TABLE tickets ADD CONSTRAINT fk_tickets_service_category
             FOREIGN KEY (service_category_id) REFERENCES service_categories(id) ON DELETE SET NULL`
        );
        console.log("  added FK tickets.service_category_id");
      } catch (e) {
        console.warn("  (FK skipped:", e.message, ")");
      }
    }

    console.log("corporate-flow migration completed.");
  } catch (e) {
    console.error("Migration failed:", e.message);
    throw e;
  } finally {
    conn.release();
    await pool.end();
  }
}

migrate().catch(() => process.exit(1));
