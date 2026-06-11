#!/usr/bin/env node
import "dotenv/config";
import mysql from 'mysql2/promise';

async function verifySchema() {
  const connection = await mysql.createConnection({
    host: process.env.DATABASE_HOST || 'localhost',
    port: Number(process.env.DATABASE_PORT) || 3306,
    user: process.env.DATABASE_USER || 'root',
    password: process.env.DATABASE_PASSWORD || '',
    database: process.env.DATABASE_NAME || 'base_app'
  });

  try {
    console.log('Verifying ticket_approvals table schema...\n');

    const [columns] = await connection.query('DESCRIBE ticket_approvals');

    console.log('Current columns in ticket_approvals:');
    console.table(columns.map(col => ({
      Field: col.Field,
      Type: col.Type,
      Null: col.Null,
      Key: col.Key,
      Default: col.Default
    })));

  } catch (error) {
    console.error('Verification failed:', error.message);
    process.exit(1);
  } finally {
    await connection.end();
  }
}

verifySchema();
