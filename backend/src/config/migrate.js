// src/config/migrate.js
import "dotenv/config";
import fs from "fs";
import path from "path";
import mysql from "mysql2/promise";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const unquote = (value) => (value || "").replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");

async function migrate() {
  const db = process.env.DATABASE_NAME;
  const base = {
    host: process.env.DATABASE_HOST || "localhost",
    port: Number(process.env.DATABASE_PORT || 3306),
    user: unquote(process.env.DATABASE_USER),
    password: unquote(process.env.DATABASE_PASSWORD),
    multipleStatements: true
  };

  console.log("🔧 Starting database migration...");

  // Create database if it doesn't exist
  const admin = await mysql.createConnection(base);
  if (db) {
    await admin.query(
      `CREATE DATABASE IF NOT EXISTS \`${db}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`
    );
    console.log(`✅ Database '${db}' ready`);
  }
  await admin.end();

  // Connect to the database
  const connection = await mysql.createConnection({
    ...base,
    database: db || undefined
  });

  // Read and execute migration schema
  const migrationPath = path.join(__dirname, "migration schema.sql");
  const sql = fs.readFileSync(migrationPath, "utf8");

  await connection.query(sql);
  await connection.end();

  console.log("✅ Migration completed successfully!");
  console.log("\n📊 Database schema is up to date.");
  console.log("\n💡 Next steps:");
  console.log("   - Run 'node src/seed.js' to add sample data (optional)");
  console.log("   - Run 'npm start' to start the server");
}

migrate().catch((err) => {
  console.error("❌ Migration failed:");
  console.error(err);
  process.exit(1);
});
