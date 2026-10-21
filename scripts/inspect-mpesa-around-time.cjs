const path = require('node:path');
const dotenv = require('dotenv');
const { Pool } = require('pg');

dotenv.config({
  path: path.join(__dirname, '..', '.env'),
  quiet: true,
  override: true,
});

const targetDate = process.argv[2] || new Date().toISOString().slice(0, 10);
const fromTime = process.argv[3] || '05:00';
const toTime = process.argv[4] || '07:30';

const pool = new Pool({
  host: process.env.PGHOST || process.env.DB_HOST || '192.168.4.10',
  port: process.env.PGPORT || process.env.DB_PORT || 5432,
  database: process.env.PGDATABASE || process.env.DB_NAME || 'metrosacco',
  user: process.env.PGUSER || process.env.DB_USER || 'centre',
  password: process.env.PGPASSWORD || process.env.DB_PASSWORD,
  connectionTimeoutMillis: 10000,
  statement_timeout: 15000,
});

function compactRows(rows) {
  return rows.map((row) => Object.fromEntries(
    Object.entries(row).filter(([, value]) => value !== null && value !== undefined)
  ));
}

(async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN READ ONLY');

    const windowResult = await client.query(
      `SELECT
         (($1::date + $2::time) AT TIME ZONE 'Africa/Nairobi') AS from_utc,
         (($1::date + $3::time) AT TIME ZONE 'Africa/Nairobi') AS to_utc`,
      [targetDate, fromTime, toTime]
    );
    const { from_utc: fromUtc, to_utc: toUtc } = windowResult.rows[0];

    const portalTxns = await client.query(
      `SELECT id, checkout_request_id, merchant_request_id, member_no, purpose,
              account_reference, amount, status, result_code, result_desc,
              mpesa_receipt_no, receipt_no, tno, receipted, ledger_posted,
              receipt_emailed,
              created_at AT TIME ZONE 'Africa/Nairobi' AS created_eat,
              updated_at AT TIME ZONE 'Africa/Nairobi' AS updated_eat,
              ledger_posted_at AT TIME ZONE 'Africa/Nairobi' AS ledger_posted_eat
       FROM pb_mpesa_transactions
       WHERE created_at BETWEEN $1 AND $2
          OR updated_at BETWEEN $1 AND $2
       ORDER BY COALESCE(updated_at, created_at) DESC, id DESC`,
      [fromUtc, toUtc]
    );

    const checkoutIds = portalTxns.rows.map((row) => row.checkout_request_id).filter(Boolean);
    const memberNos = [...new Set(portalTxns.rows.map((row) => row.member_no).filter(Boolean))];
    const loanRefs = portalTxns.rows
      .filter((row) => row.purpose === 'loan_repayment')
      .map((row) => row.account_reference)
      .filter(Boolean);

    const stkCallbacks = checkoutIds.length
      ? await client.query(
          `SELECT id, checkout_request_id, merchant_request_id, result_code, result_desc,
                  mpesa_receipt_no, customer_phone_number, amount, transaction_date,
                  to_timestamp(NULLIF(transaction_date, ''), 'YYYYMMDDHH24MISS') AT TIME ZONE 'Africa/Nairobi' AS transaction_eat
           FROM mpesa_stk_call_back
           WHERE checkout_request_id = ANY($1)
           ORDER BY id DESC`,
          [checkoutIds]
        )
      : { rows: [] };

    const callbackRowsAroundTime = await client.query(
      `SELECT id, checkout_request_id, merchant_request_id, result_code, result_desc,
              mpesa_receipt_no, customer_phone_number, amount, transaction_date,
              to_timestamp(NULLIF(transaction_date, ''), 'YYYYMMDDHH24MISS') AT TIME ZONE 'Africa/Nairobi' AS transaction_eat
       FROM mpesa_stk_call_back
       WHERE to_timestamp(NULLIF(transaction_date, ''), 'YYYYMMDDHH24MISS') BETWEEN $1 AND $2
       ORDER BY id DESC`,
      [fromUtc, toUtc]
    );

    const debtorRows = memberNos.length
      ? await client.query(
          `SELECT id, account_no, invoice_no, item, reason, reference_no, receipt_no,
                  cheque_no, journal_no, transaction_type, debit, credit, balance,
                  credit_bal, date AT TIME ZONE 'Africa/Nairobi' AS date_eat,
                  trans_date AT TIME ZONE 'Africa/Nairobi' AS trans_date_eat
           FROM ac_debtors
           WHERE upper(trim(account_no)) = ANY($1)
             AND (
               date BETWEEN $2 AND $3
               OR trans_date BETWEEN $2 AND $3
               OR invoice_no = ANY($4)
             )
           ORDER BY id DESC
           LIMIT 50`,
          [memberNos.map((memberNo) => memberNo.trim().toUpperCase()), fromUtc, toUtc, loanRefs]
        )
      : { rows: [] };

    const depositRows = memberNos.length
      ? await client.query(
          `SELECT account_no, activity_code, item, reference_no, receipt_no,
                  credit, debit, date AT TIME ZONE 'Africa/Nairobi' AS date_eat
           FROM ac_wdeposit_payable
           WHERE upper(trim(account_no)) = ANY($1)
             AND date BETWEEN $2 AND $3
           ORDER BY date DESC, reference_no DESC, receipt_no DESC
           LIMIT 50`,
          [memberNos.map((memberNo) => memberNo.trim().toUpperCase()), fromUtc, toUtc]
        )
      : { rows: [] };

    const shareRows = memberNos.length
      ? await client.query(
          `SELECT account_no, activity_code, item, reference_no, receipt_no,
                  credit, debit, date AT TIME ZONE 'Africa/Nairobi' AS date_eat
           FROM ac_shares_ledger
           WHERE upper(trim(account_no)) = ANY($1)
             AND date BETWEEN $2 AND $3
           ORDER BY date DESC, reference_no DESC, receipt_no DESC
           LIMIT 50`,
          [memberNos.map((memberNo) => memberNo.trim().toUpperCase()), fromUtc, toUtc]
        )
      : { rows: [] };

    const b2cRows = await client.query(
      `SELECT id, originator_conversation_id, conversation_id, loan_no, member_no,
              phone_no, amount, charge, total_repayable, status, result_code,
              result_desc, transaction_id, voucher_no, interest_reference_no,
              ledger_posted, receipt_emailed,
              created_at AT TIME ZONE 'Africa/Nairobi' AS created_eat,
              updated_at AT TIME ZONE 'Africa/Nairobi' AS updated_eat,
              ledger_posted_at AT TIME ZONE 'Africa/Nairobi' AS ledger_posted_eat
       FROM pb_mpesa_b2c_transactions
       WHERE created_at BETWEEN $1 AND $2
          OR updated_at BETWEEN $1 AND $2
       ORDER BY COALESCE(updated_at, created_at) DESC, id DESC`,
      [fromUtc, toUtc]
    );

    const b2cMemberNos = [...new Set(b2cRows.rows.map((row) => row.member_no).filter(Boolean))];
    const b2cLoanNos = b2cRows.rows.map((row) => row.loan_no).filter(Boolean);
    const b2cDebtorRows = b2cMemberNos.length
      ? await client.query(
          `SELECT id, account_no, invoice_no, item, reason, reference_no, receipt_no,
                  cheque_no, journal_no, transaction_type, debit, credit, balance,
                  credit_bal, date AT TIME ZONE 'Africa/Nairobi' AS date_eat,
                  trans_date AT TIME ZONE 'Africa/Nairobi' AS trans_date_eat
           FROM ac_debtors
           WHERE upper(trim(account_no)) = ANY($1)
             AND (
               date BETWEEN $2 AND $3
               OR trans_date BETWEEN $2 AND $3
               OR invoice_no = ANY($4)
             )
           ORDER BY id DESC
           LIMIT 50`,
          [b2cMemberNos.map((memberNo) => memberNo.trim().toUpperCase()), fromUtc, toUtc, b2cLoanNos]
        )
      : { rows: [] };

    await client.query('ROLLBACK');

    console.log(JSON.stringify({
      window: { targetDate, fromTime, toTime, timezone: 'Africa/Nairobi', fromUtc, toUtc },
      portalTransactions: compactRows(portalTxns.rows),
      matchedStkCallbacks: compactRows(stkCallbacks.rows),
      stkCallbacksAroundTime: compactRows(callbackRowsAroundTime.rows),
      debtorRows: compactRows(debtorRows.rows),
      depositRows: compactRows(depositRows.rows),
      shareRows: compactRows(shareRows.rows),
      b2cTransactions: compactRows(b2cRows.rows),
      b2cDebtorRows: compactRows(b2cDebtorRows.rows),
    }, null, 2));
  } finally {
    client.release();
    await pool.end();
  }
})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
