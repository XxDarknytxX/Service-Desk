// Migration runner script
import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config();

async function runMigration() {
  const connection = await mysql.createConnection({
    host: process.env.DATABASE_HOST || 'localhost',
    port: process.env.DATABASE_PORT || 3306,
    user: process.env.DATABASE_USER || 'root',
    password: process.env.DATABASE_PASSWORD,
    database: process.env.DATABASE_NAME,
    multipleStatements: true
  });

  try {
    console.log('Connected to database');

    // Check if a specific migration file is provided as argument
    const migrationArg = process.argv[2];
    const migrationFile = migrationArg
      ? path.join(__dirname, migrationArg)
      : path.join(__dirname, 'src/config/migration schema.sql');

    console.log(`Running migration: ${migrationFile}`);
    const sql = fs.readFileSync(migrationFile, 'utf8');

    await connection.query(sql);

    console.log('Migration completed successfully!');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await connection.end();
  }
}

runMigration();
