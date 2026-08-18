/**
 * Template Approval Flow Migration v2
 * - Adds per-step execution_mode (sequential/parallel) for individual step control
 * - Changes approver_user_id (single INT) to approver_user_ids (JSON array) for multi-approver
 */
import mysql from "mysql2/promise";

const DB_CONFIG = {
  host: process.env.DATABASE_HOST || "localhost",
  user: process.env.DATABASE_USER || "root",
  password: process.env.DATABASE_PASSWORD || "pool",
  database: process.env.DATABASE_NAME || "servicedesk",
  multipleStatements: true,
};

async function migrate() {
  const conn = await mysql.createConnection(DB_CONFIG);
  console.log("Connected to MySQL — running template approval flow v2 migration...\n");

  // 1. Add execution_mode to template_approval_steps
  //    'sequential' = next step waits for this one to complete
  //    'parallel'   = next step runs at the same time as this one
  try {
    await conn.query(`
      ALTER TABLE template_approval_steps
      ADD COLUMN execution_mode ENUM('sequential','parallel') NOT NULL DEFAULT 'sequential'
      AFTER can_delegate
    `);
    console.log("✓ Added execution_mode column to template_approval_steps");
  } catch (e) {
    if (e.code === "ER_DUP_FIELDNAME") {
      console.log("⊘ execution_mode column already exists — skipping");
    } else throw e;
  }

  // 2. Add approver_user_ids JSON column (array of user IDs)
  try {
    await conn.query(`
      ALTER TABLE template_approval_steps
      ADD COLUMN approver_user_ids JSON NULL
      AFTER approver_type
    `);
    console.log("✓ Added approver_user_ids JSON column");
  } catch (e) {
    if (e.code === "ER_DUP_FIELDNAME") {
      console.log("⊘ approver_user_ids column already exists — skipping");
    } else throw e;
  }

  // 3. Migrate existing approver_user_id data into approver_user_ids.
  // Guarded on the old column still existing: step 4 below drops it, so on a
  // re-run (this script is re-applied on every deploy) the SELECT would fail
  // with "Unknown column 'approver_user_id' in 'field list'".
  const [[oldCol]] = await conn.query(
    `SELECT COUNT(*) AS n FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'template_approval_steps'
        AND COLUMN_NAME = 'approver_user_id'`
  );
  if (oldCol.n === 0) {
    console.log("⊘ approver_user_id column already migrated away — skipping data backfill");
  } else {
    const [existing] = await conn.query(
      "SELECT id, approver_user_id FROM template_approval_steps WHERE approver_user_id IS NOT NULL AND (approver_user_ids IS NULL OR approver_user_ids = 'null')"
    );
    for (const row of existing) {
      await conn.query(
        "UPDATE template_approval_steps SET approver_user_ids = ? WHERE id = ?",
        [JSON.stringify([row.approver_user_id]), row.id]
      );
    }
    if (existing.length > 0) {
      console.log(`✓ Migrated ${existing.length} existing approver_user_id → approver_user_ids`);
    }
  }

  // 4. Drop FK constraint on approver_user_id, then drop the column
  try {
    await conn.query("ALTER TABLE template_approval_steps DROP FOREIGN KEY fk_tas_approver");
    console.log("✓ Dropped FK constraint fk_tas_approver");
  } catch (e) {
    if (e.code === "ER_CANT_DROP_FIELD_OR_KEY") {
      console.log("⊘ FK fk_tas_approver already dropped — skipping");
    } else throw e;
  }

  try {
    await conn.query("ALTER TABLE template_approval_steps DROP COLUMN approver_user_id");
    console.log("✓ Dropped old approver_user_id column");
  } catch (e) {
    if (e.code === "ER_CANT_DROP_FIELD_OR_KEY") {
      console.log("⊘ approver_user_id column already dropped — skipping");
    } else throw e;
  }

  console.log("\n✅ Template approval flow v2 migration complete.");
  await conn.end();
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
