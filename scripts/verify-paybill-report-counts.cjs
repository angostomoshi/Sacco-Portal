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
    const byResult = await client.query(
      `SELECT COALESCE(result_code, 'NULL') AS result_code,
              COALESCE(result_desc, '') AS result_desc,
              COUNT(*)::int AS count,
              COALESCE(SUM(NULLIF(amount, '')::numeric), 0)::numeric(14, 2) AS total
       FROM mpesa_stk_call_back
       WHERE transaction_date BETWEEN $1 AND $2
          OR (transaction_date IS NULL AND id IS NOT NULL)
       GROUP BY result_code, result_desc
       ORDER BY result_code, result_desc`,
      [startCompact, endCompact]
    );

    const success = await client.query(
      `SELECT COUNT(*)::int AS rows,
              COUNT(DISTINCT mpesa_receipt_no)::int AS distinct_receipts,
              COALESCE(SUM(amount::numeric), 0)::numeric(14, 2) AS total
       FROM mpesa_stk_call_back
       WHERE result_code = '0'
         AND mpesa_receipt_no IS NOT NULL
         AND transaction_date BETWEEN $1 AND $2`,
      [startCompact, endCompact]
    );

    const unmatched = await client.query(
      `SELECT COUNT(*)::int AS count
       FROM mpesa_stk_call_back cb
       LEFT JOIN pb_mpesa_transactions t
         ON t.checkout_request_id = cb.checkout_request_id
       WHERE cb.result_code = '0'
         AND cb.mpesa_receipt_no IS NOT NULL
         AND cb.transaction_date BETWEEN $1 AND $2
         AND t.id IS NULL`,
      [startCompact, endCompact]
    );

    await client.query('ROLLBACK');
    console.log(JSON.stringify({
      startDate,
      endDate,
      successfulReceiptRows: success.rows[0],
      allCallbackRowsByResult: byResult.rows,
      successfulReceiptsWithoutPortalMatch: unmatched.rows[0].count,
    }, null, 2));
  } finally {
    client.release();
    await pool.end();
  }
})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
