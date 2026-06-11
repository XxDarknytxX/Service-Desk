/**
 * Approval Delegations Migration
 * Adds: approval_delegations table
 * Run: node src/config/migrate-delegations.js
 */
import "dotenv/config";
import mysql from "mysql2/promise";

const unquote = (v) => (v || "").replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");

async function run() {
  const pool = await mysql.createConnection({
    host: process.env.DATABASE_HOST || "localhost",
    port: Number(process.env.DATABASE_PORT || 3306),
    user: unquote(process.env.DATABASE_USER),
    password: unquote(process.env.DATABASE_PASSWORD),
    database: process.env.DATABASE_NAME || "servicedesk",
    multipleStatements: true,
  });

  const safe = async (sql, label) => {
    try {
      await pool.query(sql);
      console.log(`✅ ${label}`);
    } catch (e) {
      if (e.code === "ER_DUP_FIELDNAME" || e.code === "ER_TABLE_EXISTS_ERROR" || e.message.includes("Duplicate column")) {
        console.log(`⏭  ${label} (already exists)`);
      } else {
        console.error(`❌ ${label}: ${e.message}`);
      }
    }
  };

  console.log("🚀 Starting Approval Delegations migration...\n");

  await safe(`
    CREATE TABLE IF NOT EXISTS approval_delegations (
      id INT AUTO_INCREMENT PRIMARY KEY,
      delegator_id INT NOT NULL,
      delegate_id INT NOT NULL,
      delegation_type ENUM('permanent','temporary','specific_ticket') NOT NULL DEFAULT 'temporary',
      start_date DATETIME NULL,
      end_date DATETIME NULL,
      ticket_id INT NULL,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      reason VARCHAR(500) NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (delegator_id) REFERENCES users(id),
      FOREIGN KEY (delegate_id) REFERENCES users(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `, "approval_delegations table");

  await pool.end();
  console.log("\n✅ Approval Delegations migration complete!");
}

run().catch((e) => { console.error(e); process.exit(1); });
