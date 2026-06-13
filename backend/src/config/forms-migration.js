// Customer forms migration — service_forms + form_invites (additive, idempotent)
import "dotenv/config";
import mysql from "mysql2/promise";

const unquote = (v) => (v || "").replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");

async function migrate() {
  const conn = await mysql.createConnection({
    host: process.env.DATABASE_HOST || "localhost",
    port: Number(process.env.DATABASE_PORT || 3306),
    user: unquote(process.env.DATABASE_USER),
    password: unquote(process.env.DATABASE_PASSWORD),
    database: unquote(process.env.DATABASE_NAME),
    multipleStatements: true,
  });
  console.log("Running customer forms migration...");

  await conn.query(`
    CREATE TABLE IF NOT EXISTS service_forms (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(200) NOT NULL,
      description TEXT NULL,
      fields_schema JSON NOT NULL,
      status ENUM('active','archived') NOT NULL DEFAULT 'active',
      created_by INT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_sforms_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
  console.log("✅ service_forms table");

  await conn.query(`
    CREATE TABLE IF NOT EXISTS form_invites (
      id INT AUTO_INCREMENT PRIMARY KEY,
      form_id INT NOT NULL,
      token VARCHAR(64) NOT NULL,
      recipient_email VARCHAR(255) NOT NULL,
      recipient_name VARCHAR(200) NULL,
      recipient_user_id INT NULL,
      status ENUM('pending','completed','revoked') NOT NULL DEFAULT 'pending',
      response_data JSON NULL,
      submitted_at DATETIME NULL,
      expires_at DATETIME NULL,
      created_by INT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_invite_token (token),
      KEY idx_invites_form (form_id),
      KEY idx_invites_status (status),
      CONSTRAINT fk_finv_form FOREIGN KEY (form_id) REFERENCES service_forms(id) ON DELETE CASCADE,
      CONSTRAINT fk_finv_user FOREIGN KEY (recipient_user_id) REFERENCES users(id) ON DELETE SET NULL,
      CONSTRAINT fk_finv_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
  console.log("✅ form_invites table");

  // Ticket linkage (added for ticket-workflow integration)
  const [tcol] = await conn.query(
    `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'form_invites' AND COLUMN_NAME = 'ticket_id'`
  );
  if (!tcol[0].c) {
    await conn.query(`
      ALTER TABLE form_invites
        ADD COLUMN ticket_id INT NULL AFTER recipient_user_id,
        ADD KEY idx_invites_ticket (ticket_id),
        ADD CONSTRAINT fk_finv_ticket FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE SET NULL;
    `);
    console.log("✅ form_invites.ticket_id column");
  } else {
    console.log("⏭️  form_invites.ticket_id already exists");
  }

  await conn.end();
  console.log("✅ Customer forms migration complete");
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
