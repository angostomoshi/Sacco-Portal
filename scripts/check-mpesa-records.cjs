const path = require('node:path');
require('dotenv').config({
  path: path.join(__dirname, '..', '.env'),
  quiet: true,
  override: true,
});
const { Client } = require('pg');
const client = new Client({
  host: process.env.DB_HOST || '192.168.4.10', port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'metrosacco', user: process.env.DB_USER || 'centre',
  password: process.env.DB_PASSWORD, connectionTimeoutMillis: 10000, statement_timeout: 10000,
});

(async () => {
  try {
    await client.connect();
    await client.query('BEGIN READ ONLY');
    const stk = await client.query(`SELECT account_reference, amount, status, result_code,
      mpesa_receipt_no IS NOT NULL AS has_receipt, ledger_posted, receipt_emailed
      FROM pb_mpesa_transactions WHERE member_no = $1 AND checkout_request_id = $2`,
    ['MS041', 'ws_CO_120920261350566702890446']);
    const b2c = await client.query(`SELECT loan_no, amount, charge, status, result_code,
      transaction_id IS NOT NULL AS has_receipt, ledger_posted, receipt_emailed
      FROM pb_mpesa_b2c_transactions WHERE member_no = $1 AND conversation_id = $2`,
    ['MS041', 'AG_20260912_010010470sle7r0b734b']);
    const columns = await client.query(`SELECT table_name, column_name, data_type
      FROM information_schema.columns WHERE table_schema = 'public'
      AND ((table_name = 'ac_debtors' AND column_name IN ('debit','invoice_no','credit_bal'))
        OR (table_name = 'pb_mpesa_b2c_transactions' AND column_name IN ('voucher_no','interest_reference_no','ledger_posted','receipt_emailed')))
      ORDER BY table_name, column_name`);
    console.log(JSON.stringify({ stk: stk.rows, b2c: b2c.rows, schema: columns.rows }, null, 2));
    await client.query('ROLLBACK');
  } finally {
    await client.end();
  }
})().catch(error => { console.error(error.code || 'Database check failed'); process.exitCode = 1; });
