import { Pool } from 'pg';
import 'dotenv/config';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function testConnection() {
  const client = await pool.query('SELECT NOW()');
  console.log('Database connection successful:', client.rows[0]);
}

testConnection().catch((err) => {
  console.error('Database connection failed:', err);
});
