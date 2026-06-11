#!/usr/bin/env node
import mysql from 'mysql2/promise';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function runMigration() {
  const connection = await mysql.createConnection({
    host: process.env.DATABASE_HOST || 'localhost',
    user: process.env.DATABASE_USER || 'root',
    password: process.env.DATABASE_PASSWORD || 'pool',
    database: process.env.DATABASE_NAME || 'servicedesk',
    multipleStatements: true
  });

  try {
    console.log('Running migration to add missing approval columns...');

    const sql = readFileSync(join(__dirname, 'fix-approval-columns.sql'), 'utf8');

    await connection.query(sql);

    console.log('✓ Migration completed successfully!');
    console.log('✓ Added columns: require_all_at_level, return_to_agent_id, return_to_team_id');

  } catch (error) {
    console.error('Migration failed:', error.message);
    process.exit(1);
  } finally {
    await connection.end();
  }
}

runMigration();
