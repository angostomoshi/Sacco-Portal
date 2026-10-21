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
    const result = await client.query(
      `SELECT table_name, column_name, data_type, character_maximum_length
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name IN ('ac_debtors', 'ac_wdeposit_payable', 'pb_mpesa_transactions')
         AND column_name IN (
           'reference_no', 'receipt_no', 'mpesa_receipt_no',
           'checkout_request_id', 'merchant_request_id', 'tno'
         )
       ORDER BY table_name, column_name`
    );
    console.log(JSON.stringify(result.rows, null, 2));
  } finally {
    client.release();
    await pool.end();
  }
})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
