const dotenv = require('dotenv');
const { Pool } = require('pg');

dotenv.config();

const pool = new Pool({
  host: process.env.PGHOST || '192.168.4.10',
  port: process.env.PGPORT || 5432,
  database: process.env.PGDATABASE || 'metrosacco',
  user: process.env.PGUSER || 'centre',
  password: process.env.PGPASSWORD || process.env.DB_PASSWORD,
});

(async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN READ ONLY');
    const result = await client.query(
      `SELECT p.proname, pg_get_functiondef(p.oid) AS definition
       FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public'
         AND p.proname IN ('rct_insert', 'rct_insertnew')`
    );
    await client.query('ROLLBACK');
    console.log(JSON.stringify(result.rows, null, 2));
  } finally {
    client.release();
    await pool.end();
  }
})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
