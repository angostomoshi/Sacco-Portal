const path = require('node:path');
const dotenv = require('dotenv');
const { Pool } = require('pg');

dotenv.config({
  path: path.join(__dirname, '..', '.env'),
  quiet: true,
  override: true,
});

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
      `SELECT result_code,
              COUNT(*)::int AS rows,
              COUNT(DISTINCT COALESCE(transaction_receipt, transactionid))::int AS distinct_receipts,
              COALESCE(SUM(transaction_amount), 0)::numeric(14, 2) AS total
       FROM mpesa_b2c_transactions
       GROUP BY result_code
       ORDER BY result_code`
    );
    const sample = await client.query(
      `SELECT id, originator_conversationid, conversationid, result_code, result_desc,
              transactionid, transaction_receipt, transaction_amount,
              transaction_completed_date_time, receiver_party_public_name
       FROM mpesa_b2c_transactions
       ORDER BY id DESC
       LIMIT 20`
    );
    const portal = await client.query(
      `SELECT id, originator_conversation_id, conversation_id, member_no, loan_no,
              amount, status, result_code, transaction_id, created_at, updated_at
       FROM pb_mpesa_b2c_transactions
       ORDER BY id DESC
       LIMIT 20`
    );
    await client.query('ROLLBACK');
    console.log(JSON.stringify({ counts: counts.rows, sample: sample.rows, portal: portal.rows }, null, 2));
  } finally {
    client.release();
    await pool.end();
  }
})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
