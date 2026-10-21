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

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN READ ONLY');

    const columns = await client.query(
      `SELECT table_name, column_name, data_type, character_maximum_length,
              column_default, is_nullable
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name IN ('ac_debtors', 'ac_wdeposit_payable', 'pb_mpesa_transactions', 'mpesa_c2b_transactions')
         AND column_name IN (
           'id', 'reference_no', 'receipt_no', 'cheque_no', 'tno',
           'mpesa_receipt_no', 'receipted', 'receipted_amount', 'amt_receipted',
           'trans_id', 'third_party_trans_id', 'bill_ref_number'
         )
       ORDER BY table_name, ordinal_position`
    );

    const triggers = await client.query(
      `SELECT event_object_table AS table_name, trigger_name, action_timing,
              event_manipulation, action_statement
       FROM information_schema.triggers
       WHERE trigger_schema = 'public'
         AND event_object_table IN ('ac_debtors', 'ac_wdeposit_payable', 'pb_mpesa_transactions', 'mpesa_c2b_transactions')
       ORDER BY event_object_table, trigger_name`
    );

    const sequences = await client.query(
      `SELECT schemaname, sequencename
       FROM pg_sequences
       WHERE schemaname = 'public'
         AND (
           sequencename ILIKE '%receipt%'
           OR sequencename ILIKE '%debt%'
           OR sequencename ILIKE '%mpesa%'
           OR sequencename ILIKE '%cash%'
         )
       ORDER BY sequencename`
    );

    const debtorRows = await client.query(
      `SELECT account_no, invoice_no, item, reference_no, receipt_no, cheque_no,
              balance, credit_bal, date
       FROM ac_debtors
       WHERE account_no = 'MS041'
       ORDER BY date DESC NULLS LAST, reference_no DESC NULLS LAST
       LIMIT 20`
    );

    const mpesaRows = await client.query(
      `SELECT id, checkout_request_id, member_no, purpose, account_reference,
              mpesa_receipt_no, receipt_no, tno, receipted, status, ledger_posted,
              created_at, updated_at
       FROM pb_mpesa_transactions
       WHERE member_no = 'MS041'
       ORDER BY id DESC
       LIMIT 10`
    );

    const numericMax = await client.query(
      `SELECT
         (SELECT MAX(reference_no::int) FROM ac_debtors WHERE reference_no ~ '^[0-9]+$') AS max_debtor_ref,
         (SELECT MAX(receipt_no::int) FROM ac_debtors WHERE receipt_no ~ '^[0-9]+$') AS max_debtor_receipt,
         (SELECT MAX(reference_no::int) FROM ac_wdeposit_payable WHERE reference_no ~ '^[0-9]+$') AS max_wdeposit_ref,
         (SELECT MAX(receipt_no::int) FROM ac_wdeposit_payable WHERE receipt_no ~ '^[0-9]+$') AS max_wdeposit_receipt,
         (SELECT MAX(receipt_no::int) FROM pb_mpesa_transactions WHERE receipt_no ~ '^[0-9]+$') AS max_mpesa_receipt`
    );

    await client.query('ROLLBACK');
    console.log(JSON.stringify({
      columns: columns.rows,
      triggers: triggers.rows,
      sequences: sequences.rows,
      numericMax: numericMax.rows[0],
      recentDebtors: debtorRows.rows,
      recentMpesa: mpesaRows.rows,
    }, null, 2));
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
