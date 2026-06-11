/**
 * Asset Management V2 Migration
 * Adds: asset_categories, asset_maintenance, asset_assignments tables
 * Alters: assets, asset_types with new fields
 * Run: node src/config/migrate-assets-v2.js
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

  console.log("🚀 Starting Asset Management V2 migration...\n");

  // ── asset_categories ────────────────────────────────────────────────────────
  await safe(`
    CREATE TABLE IF NOT EXISTS asset_categories (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      description TEXT NULL,
      icon VARCHAR(50) NULL DEFAULT 'box',
      color VARCHAR(20) NULL DEFAULT 'blue',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `, "asset_categories table");

  // ── asset_maintenance ───────────────────────────────────────────────────────
  await safe(`
    CREATE TABLE IF NOT EXISTS asset_maintenance (
      id INT AUTO_INCREMENT PRIMARY KEY,
      asset_id INT NOT NULL,
      title VARCHAR(255) NOT NULL,
      maintenance_type ENUM('repair','preventive','upgrade','calibration','inspection','other') NOT NULL DEFAULT 'preventive',
      status ENUM('scheduled','in_progress','completed','cancelled') NOT NULL DEFAULT 'scheduled',
      scheduled_date DATE NULL,
      completed_date DATE NULL,
      cost DECIMAL(10,2) NULL,
      technician VARCHAR(200) NULL,
      notes TEXT NULL,
      created_by INT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_am_asset FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE,
      CONSTRAINT fk_am_created_by FOREIGN KEY (created_by) REFERENCES users(id),
      KEY idx_am_asset (asset_id),
      KEY idx_am_status (status),
      KEY idx_am_scheduled (scheduled_date)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `, "asset_maintenance table");

  // ── asset_assignments (checkout/checkin history) ────────────────────────────
  await safe(`
    CREATE TABLE IF NOT EXISTS asset_assignments (
      id INT AUTO_INCREMENT PRIMARY KEY,
      asset_id INT NOT NULL,
      assigned_to_user_id INT NULL,
      assigned_to_org_id INT NULL,
      location VARCHAR(255) NULL,
      notes TEXT NULL,
      checked_out_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      checked_in_at DATETIME NULL,
      checked_out_by INT NOT NULL,
      checked_in_by INT NULL,
      CONSTRAINT fk_aa_asset FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE,
      CONSTRAINT fk_aa_user FOREIGN KEY (assigned_to_user_id) REFERENCES users(id) ON DELETE SET NULL,
      CONSTRAINT fk_aa_org FOREIGN KEY (assigned_to_org_id) REFERENCES organizations(id) ON DELETE SET NULL,
      CONSTRAINT fk_aa_out_by FOREIGN KEY (checked_out_by) REFERENCES users(id),
      CONSTRAINT fk_aa_in_by FOREIGN KEY (checked_in_by) REFERENCES users(id) ON DELETE SET NULL,
      KEY idx_aa_asset (asset_id),
      KEY idx_aa_user (assigned_to_user_id),
      KEY idx_aa_active (checked_in_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `, "asset_assignments table");

  // ── ALTER asset_types ───────────────────────────────────────────────────────
  await safe(`ALTER TABLE asset_types ADD COLUMN category_id INT NULL`, "asset_types.category_id");
  await safe(`ALTER TABLE asset_types ADD CONSTRAINT fk_at_category FOREIGN KEY (category_id) REFERENCES asset_categories(id) ON DELETE SET NULL`, "asset_types FK category");

  // ── ALTER assets ────────────────────────────────────────────────────────────
  await safe(`ALTER TABLE assets ADD COLUMN category_id INT NULL`, "assets.category_id");
  await safe(`ALTER TABLE assets ADD COLUMN \`condition\` ENUM('new','excellent','good','fair','poor','damaged') NULL`, "assets.condition");
  await safe(`ALTER TABLE assets ADD COLUMN supplier VARCHAR(200) NULL`, "assets.supplier");
  await safe(`ALTER TABLE assets ADD COLUMN order_number VARCHAR(100) NULL`, "assets.order_number");
  await safe(`ALTER TABLE assets ADD COLUMN expected_lifespan_years INT NULL`, "assets.expected_lifespan_years");
  await safe(`ALTER TABLE assets ADD COLUMN current_value DECIMAL(12,2) NULL`, "assets.current_value");
  await safe(`ALTER TABLE assets ADD COLUMN depreciation_rate DECIMAL(5,2) NULL`, "assets.depreciation_rate");
  await safe(`ALTER TABLE assets ADD COLUMN department_id INT NULL`, "assets.department_id");
  await safe(`ALTER TABLE assets ADD CONSTRAINT fk_assets_dept FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL`, "assets FK department");
  await safe(`ALTER TABLE assets ADD CONSTRAINT fk_assets_category FOREIGN KEY (category_id) REFERENCES asset_categories(id) ON DELETE SET NULL`, "assets FK category");

  // ── Seed default categories ─────────────────────────────────────────────────
  await safe(`
    INSERT IGNORE INTO asset_categories (name, description, icon, color) VALUES
    ('Hardware',  'Physical computing equipment',      'monitor',  'blue'),
    ('Network',   'Networking and connectivity gear',  'wifi',     'purple'),
    ('Software',  'Software licenses and subscriptions','code',    'emerald'),
    ('Mobile',    'Phones, tablets and mobile devices','phone',    'amber'),
    ('Furniture', 'Office furniture and fixtures',     'briefcase','slate'),
    ('Other',     'Miscellaneous assets',              'box',      'gray')
  `, "Default asset categories");

  await pool.end();
  console.log("\n✅ Asset V2 migration complete!");
}

run().catch((e) => { console.error(e); process.exit(1); });
