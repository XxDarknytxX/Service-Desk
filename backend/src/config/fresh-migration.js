// Fresh database migration - drops and recreates the database
import "dotenv/config";
import fs from "fs";
import path from "path";
import mysql from "mysql2/promise";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const unquote = (value) => (value || "").replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");

async function freshMigrate() {
  const db = process.env.DATABASE_NAME;
  const base = {
    host: process.env.DATABASE_HOST || "localhost",
    port: Number(process.env.DATABASE_PORT || 3306),
    user: unquote(process.env.DATABASE_USER),
    password: unquote(process.env.DATABASE_PASSWORD),
    multipleStatements: true
  };

  console.log("🔧 Starting FRESH database migration...");
  console.log(`⚠️  WARNING: This will DROP the database '${db}' if it exists!`);

  // Connect without database
  const admin = await mysql.createConnection(base);
  
  // Drop database if exists
  console.log(`🗑️  Dropping database '${db}' if it exists...`);
  await admin.query(`DROP DATABASE IF EXISTS \`${db}\`;`);
  
  // Create database
  console.log(`📦 Creating database '${db}'...`);
  await admin.query(
    `CREATE DATABASE \`${db}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`
  );
  console.log(`✅ Database '${db}' created`);
  await admin.end();

  // Connect to the new database
  const connection = await mysql.createConnection({
    ...base,
    database: db
  });

  // Read and execute complete schema
  const schemaPath = path.join(__dirname, "complete-schema.sql");
  console.log(`📄 Reading schema from: ${schemaPath}`);
  const sql = fs.readFileSync(schemaPath, "utf8");

  console.log(`🔨 Executing schema...`);
  await connection.query(sql);
  await connection.end();

  console.log("✅ Migration completed successfully!");
  console.log("\n📊 Database schema is up to date.");
  console.log("\n💡 Next steps:");
  console.log("   - Run 'node src/seed.js' to add sample data (optional)");
  console.log("   - Run 'npm start' to start the server");
}

freshMigrate().catch((err) => {
  console.error("❌ Migration failed:");
  console.error(err);
  process.exit(1);
});
