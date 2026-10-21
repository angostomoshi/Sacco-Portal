const path = require('node:path');
const dotenv = require('dotenv');
const { Pool } = require('pg');

dotenv.config({
  path: path.join(__dirname, '..', '.env'),
  quiet: true,
  override: true,
});

const startDate = process.argv[2] || '2026-01-01';
const endDate = process.argv[3] || '2026-10-07';
const startCompact = `${startDate.replace(/-/g, '')}000000`;
const endCompact = `${endDate.replace(/-/g, '')}235959`;

const pool = new Pool({
  host: process.env.PGHOST || process.env.DB_HOST || '192.168.4.10',
  port: process.env.PGPORT || process.env.DB_PORT || 5432,
  database: process.env.PGDATABASE || process.env.DB_NAME || 'metrosacco',
  user: process.env.PGUSER || process.env.DB_USER || 'centre',
  password: process.env.PGPASSWORD || process.env.DB_PASSWORD,
  connectionTimeoutMillis: 10000,
  statement_timeout: 15000,
});

(async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN READ ONLY');
    const counts = await client.query(
      `SELECT COUNT(*)::int AS rows,
              COUNT(DISTINCT trans_id)::int AS distinct_receipts,
              COALESCE(SUM(NULLIF(trans_amount, '')::numeric), 0)::numeric(14, 2) AS total
       FROM mpesa_c2b_transactions
       WHERE trans_id IS NOT NULL
         AND trans_time BETWEEN $1 AND $2`,
      [startCompact, endCompact]
    );
    const overlap = await client.query(
      `SELECT COUNT(DISTINCT c.trans_id)::int AS receipts_already_in_stk
       FROM mpesa_c2b_transactions c
       JOIN mpesa_stk_call_back s
         ON s.mpesa_receipt_no = c.trans_id
       WHERE c.trans_id IS NOT NULL
         AND c.trans_time BETWEEN $1 AND $2`,
      [startCompact, endCompact]
    );
    const sample = await client.query(
      `SELECT id, trans_id, trans_time, trans_amount, bill_ref_number,
              business_short_code, msisdn, phone_no, customer_name,
              first_name, middle_name, last_name, input_date
       FROM mpesa_c2b_transactions
       WHERE trans_id IS NOT NULL
         AND trans_time BETWEEN $1 AND $2
       ORDER BY trans_time DESC
       LIMIT 10`,
      [startCompact, endCompact]
    );
    await client.query('ROLLBACK');
    console.log(JSON.stringify({
      startDate,
      endDate,
      c2bCounts: counts.rows[0],
      overlapWithStk: overlap.rows[0],
      sample: sample.rows,
    }, null, 2));
  } finally {
    client.release();
    await pool.end();
  }
})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
