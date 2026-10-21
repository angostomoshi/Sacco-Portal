const dotenv = require('dotenv');
const { Pool } = require('pg');

dotenv.config();

const originatorConversationId = process.argv[2];
if (!originatorConversationId) {
  console.error('Usage: node scripts/inspect-b2c-flow.cjs ORIGINATOR_CONVERSATION_ID');
  process.exit(1);
}

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

    const portal = await client.query(
      `SELECT id, originator_conversation_id, conversation_id, loan_no, member_no,
              amount, charge, total_repayable, status, response_code, response_desc,
              result_code, result_desc, transaction_id, voucher_no,
              interest_reference_no, ledger_posted, receipt_emailed,
              created_at, updated_at
       FROM pb_mpesa_b2c_transactions
       WHERE originator_conversation_id = $1
          OR conversation_id = $1
       ORDER BY id DESC`,
      [originatorConversationId]
    );

    const provider = await client.query(
      `SELECT originator_conversationid, conversationid, result_code,
              result_desc, transactionid, transaction_receipt, transaction_amount,
              transaction_completed_date_time, receiver_party_public_name
       FROM mpesa_b2c_transactions
       WHERE originator_conversationid = $1
          OR conversationid = $1
       ORDER BY transaction_completed_date_time DESC NULLS LAST, conversationid DESC NULLS LAST`,
      [originatorConversationId]
    );

    const loans = portal.rows.length
      ? await client.query(
          `SELECT loan_no, mem_no, lpurpose, amount, premium, total,
                  coalesce(processed, false) AS processed
           FROM pb_saccoloan
           WHERE loan_no = ANY($1)
           ORDER BY loan_no DESC`,
          [portal.rows.map((row) => row.loan_no)]
        )
      : { rows: [] };

    const debtors = portal.rows.length
      ? await client.query(
          `SELECT account_no, invoice_no, item, reference_no, receipt_no,
                  cheque_no, debit, balance, credit_bal, user_name, date
           FROM ac_debtors
           WHERE invoice_no = ANY($1)
           ORDER BY date DESC NULLS LAST, reference_no DESC NULLS LAST`,
          [portal.rows.map((row) => row.loan_no)]
        )
      : { rows: [] };

    const cashbook = portal.rows.length
      ? await client.query(
          `SELECT transaction_no, voucher_no, receipt_no, account_no,
                  account_name, bank_name, debit, credit, user_name, date
           FROM ac_cash_book
           WHERE transaction_no = ANY($1)
              OR voucher_no = ANY($1)
           ORDER BY date DESC NULLS LAST, transaction_no DESC NULLS LAST`,
          [portal.rows.map((row) => row.voucher_no).filter(Boolean)]
        )
      : { rows: [] };

    await client.query('ROLLBACK');
    console.log(JSON.stringify({
      originatorConversationId,
      portal: portal.rows,
      provider: provider.rows,
      loans: loans.rows,
      debtors: debtors.rows,
      cashbook: cashbook.rows,
    }, null, 2));
  } finally {
    client.release();
    await pool.end();
  }
})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
