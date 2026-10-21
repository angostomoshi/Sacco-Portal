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

const targetTables = [
  'mpesa_stk_callback',
  'pb_mpesa_transactions',
  'mpesa_c2b_transactions',
  'pb_mpesa_c2b_transactions',
  'mpesa_b2c_transactions',
  'pb_mpesa_b2c_transactions',
];

(async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN READ ONLY');
    const columns = await client.query(
      `SELECT table_name, column_name, data_type
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = ANY($1)
       ORDER BY table_name, ordinal_position`,
      [targetTables]
    );
    const tables = await client.query(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_name ILIKE '%mpesa%'
       ORDER BY table_name`
    );
    console.log(JSON.stringify({ tables: tables.rows, columns: columns.rows }, null, 2));
    await client.query('ROLLBACK');
  } finally {
    client.release();
    await pool.end();
  }
})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
