const dotenv = require('dotenv');
const { Pool } = require('pg');

dotenv.config();

const memberNo = process.argv[2] || 'MS041';

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
    const txns = await client.query(
      `SELECT id, checkout_request_id, merchant_request_id, member_no, purpose,
              account_reference, amount, status, result_code, result_desc,
              mpesa_receipt_no, receipt_no, tno, receipted, ledger_posted,
              receipt_emailed, created_at, updated_at
       FROM pb_mpesa_transactions
       WHERE upper(trim(member_no)) = upper(trim($1))
       ORDER BY id DESC
       LIMIT 5`,
      [memberNo]
    );

    const checkoutIds = txns.rows.map((row) => row.checkout_request_id);
    const callbacks = checkoutIds.length
      ? await client.query(
          `SELECT checkout_request_id, result_code, result_desc, mpesa_receipt_no,
                  amount, transaction_date
           FROM mpesa_stk_call_back
           WHERE checkout_request_id = ANY($1)
           ORDER BY id DESC`,
          [checkoutIds]
        )
      : { rows: [] };

    const loanRefs = txns.rows
      .filter((row) => row.purpose === 'loan_repayment')
      .map((row) => row.account_reference);
    const debtorRows = loanRefs.length
      ? await client.query(
          `SELECT account_no, invoice_no, item, reference_no, receipt_no,
                  balance, credit_bal, date
           FROM ac_debtors
           WHERE upper(trim(account_no)) = upper(trim($1))
             AND invoice_no = ANY($2)
           ORDER BY id DESC
           LIMIT 10`,
          [memberNo, loanRefs]
        )
      : { rows: [] };

    await client.query('ROLLBACK');
    console.log(JSON.stringify({
      memberNo,
      transactions: txns.rows,
      callbacks: callbacks.rows,
      loanLedgerRows: debtorRows.rows,
    }, null, 2));
  } finally {
    client.release();
    await pool.end();
  }
})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
