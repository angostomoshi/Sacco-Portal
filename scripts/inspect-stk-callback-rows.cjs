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
    const columns = await client.query(
      `SELECT column_name, data_type
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'mpesa_stk_call_back'
       ORDER BY ordinal_position`
    );
    const callbacks = await client.query(
      `SELECT *
       FROM mpesa_stk_call_back
       ORDER BY id DESC
       LIMIT 10`
    );
    const transactions = await client.query(
      `SELECT id, checkout_request_id, merchant_request_id, member_no, purpose,
              account_reference, amount, status, ledger_posted, mpesa_receipt_no,
              receipt_no, tno, receipted, created_at, updated_at
       FROM pb_mpesa_transactions
       ORDER BY id DESC
       LIMIT 10`
    );
    console.log(JSON.stringify({
      columns: columns.rows,
      callbacks: callbacks.rows,
      transactions: transactions.rows,
    }, null, 2));
    await client.query('ROLLBACK');
  } finally {
    client.release();
    await pool.end();
  }
})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
