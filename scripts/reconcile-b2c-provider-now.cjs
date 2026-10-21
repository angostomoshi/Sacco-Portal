const dotenv = require('dotenv');
const { Pool } = require('pg');

dotenv.config();

const originatorConversationId = process.argv[2];
const APPLY = process.argv.includes('--apply');

if (!originatorConversationId || !APPLY) {
  console.error('Usage: node scripts/reconcile-b2c-provider-now.cjs ORIGINATOR_CONVERSATION_ID --apply');
  process.exit(1);
}

const EMERGENCY_ADVANCE_PURPOSE = 'METRO SACCO EMERGENCY ADVANCE';
const EMERGENCY_ADVANCE_ACCOUNTING_USER = 'b2c_user';
const EMERGENCY_ADVANCE_DEBTOR_CODE = '20-23-131';
const EMERGENCY_ADVANCE_INTEREST_CODE = '80-00-006';
const MPESA_B2C_GL_CODE = '20-25-011';

const pool = new Pool({
  host: process.env.PGHOST || '192.168.4.10',
  port: process.env.PGPORT || 5432,
  database: process.env.PGDATABASE || 'metrosacco',
  user: process.env.PGUSER || 'centre',
  password: process.env.PGPASSWORD || process.env.DB_PASSWORD,
});

function getEmergencyAdvanceMemberGroup(member) {
  if (/locum/i.test(String(member?.mem_category || ''))) return 'METROPOLITAN LOCUM STAFF';
  if (/external/i.test(String(member?.mem_category || ''))) return 'EXTERNAL MEMBERS';
  return 'METROPOLITAN STAFF';
}

async function getNextAccountingReference(client, prefix, sources) {
  const normalizedPrefix = String(prefix || '').toUpperCase().replace(/[^A-Z]/g, '');
  if (!normalizedPrefix) throw new Error('Invalid accounting reference prefix.');

  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`accounting-ref-${normalizedPrefix}`]);
  const unionSql = sources.map(({ table, column }) => (
    `SELECT MAX((substring(${column} from '^${normalizedPrefix}([0-9]+)$'))::int) AS max_no
     FROM ${table}
     WHERE ${column} ~ '^${normalizedPrefix}[0-9]+$'`
  )).join('\nUNION ALL\n');
  const result = await client.query(`SELECT COALESCE(MAX(max_no), 0) + 1 AS next_no FROM (${unionSql}) refs`);
  return `${normalizedPrefix}${Number(result.rows[0].next_no || 1)}`;
}

async function getNextVoucherNo(client) {
  await client.query("SELECT pg_advisory_xact_lock(hashtext('accounting-ref-VCE'))");
  const result = await client.query(`
    SELECT 'VCE' || (COALESCE(MAX(max_no), 0) + 1) AS next_no
    FROM (
      SELECT MAX((substring(reference_no from '^VCE([0-9]+)$'))::int) AS max_no
      FROM ac_debtors WHERE reference_no ~ '^VCE[0-9]+$'
      UNION ALL
      SELECT MAX((substring(receipt_no from '^VCE([0-9]+)$'))::int)
      FROM ac_debtors WHERE receipt_no ~ '^VCE[0-9]+$'
      UNION ALL
      SELECT MAX((substring(voucher_no from '^VCE([0-9]+)$'))::int)
      FROM ac_cash_book WHERE voucher_no ~ '^VCE[0-9]+$'
      UNION ALL
      SELECT MAX((substring(transaction_no from '^VCE([0-9]+)$'))::int)
      FROM ac_cash_book WHERE transaction_no ~ '^VCE[0-9]+$'
      UNION ALL
      SELECT MAX((substring(reference_no from '^VC([0-9]+)$'))::int)
      FROM ac_debtors WHERE reference_no ~ '^VC[0-9]+$'
      UNION ALL
      SELECT MAX((substring(voucher_no from '^VC([0-9]+)$'))::int)
      FROM ac_cash_book WHERE voucher_no ~ '^VC[0-9]+$'
      UNION ALL
      SELECT MAX((substring(transaction_no from '^VC([0-9]+)$'))::int)
      FROM ac_cash_book WHERE transaction_no ~ '^VC[0-9]+$'
    ) refs
  `);
  return result.rows[0].next_no;
}

async function getNextInterestReferenceNo(client) {
  return getNextAccountingReference(client, 'INT', [
    { table: 'ac_debtors', column: 'reference_no' },
    { table: 'ac_ledger', column: 'voucher_no' },
    { table: 'ac_ledger', column: 'receipt_no' },
    { table: 'ac_ledger', column: 'transaction_no' },
  ]);
}

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const txnResult = await client.query(
      `SELECT id, originator_conversation_id, conversation_id, loan_no, member_no,
              amount, charge, total_repayable, status, ledger_posted
       FROM pb_mpesa_b2c_transactions
       WHERE originator_conversation_id = $1
          OR conversation_id = $1
       ORDER BY id DESC
       LIMIT 1
       FOR UPDATE`,
      [originatorConversationId]
    );
    const txn = txnResult.rows[0];
    if (!txn) throw new Error('Portal B2C transaction not found.');
    if (txn.ledger_posted || txn.status !== 'pending') {
      throw new Error(`Refusing to post transaction in status ${txn.status}, ledger_posted=${txn.ledger_posted}.`);
    }

    const existingDebtors = await client.query(
      `SELECT 1
       FROM ac_debtors
       WHERE account_no = $1
         AND invoice_no = $2
       LIMIT 1`,
      [txn.member_no, txn.loan_no]
    );
    if (existingDebtors.rows.length > 0) {
      throw new Error(`Refusing to post ${txn.loan_no}; accounting rows already exist.`);
    }

    const providerResult = await client.query(
      `SELECT originator_conversationid, conversationid, result_code, result_desc,
              transactionid, transaction_receipt, transaction_amount,
              transaction_completed_date_time, receiver_party_public_name
       FROM mpesa_b2c_transactions
       WHERE originator_conversationid IN ($1, $2)
          OR conversationid IN ($1, $2)
       ORDER BY transaction_completed_date_time DESC NULLS LAST, conversationid DESC NULLS LAST
       LIMIT 1`,
      [txn.originator_conversation_id, txn.conversation_id]
    );
    const provider = providerResult.rows[0];
    if (!provider) throw new Error('Provider B2C callback row not found.');

    const resultCode = Number(provider.result_code);
    const transactionId = provider.transaction_receipt || provider.transactionid || null;
    const providerAmount = Number(provider.transaction_amount || 0);
    const expectedAmount = Number(txn.amount || 0);
    if (resultCode !== 0 || !transactionId) {
      throw new Error(`Provider result is not successful: ${provider.result_code} ${provider.result_desc || ''}`);
    }
    if (Math.round(providerAmount) !== Math.round(expectedAmount)) {
      throw new Error(`Amount mismatch. Provider ${providerAmount}, portal ${expectedAmount}.`);
    }

    const memberResult = await client.query(
      `SELECT holders_name, mem_category
       FROM pb_share_register
       WHERE acc_no = $1`,
      [txn.member_no]
    );
    const member = memberResult.rows[0] || {};
    const memberName = member.holders_name || txn.member_no;
    const memberGroup = getEmergencyAdvanceMemberGroup(member);
    const voucherNo = await getNextVoucherNo(client);
    const interestReferenceNo = await getNextInterestReferenceNo(client);
    const mpesaReference = String(transactionId).slice(0, 50);
    const b2cAccountNo = process.env.MPESA_B2C_CASHBOOK_ACCOUNT_NO
      || process.env.MPESA_B2C_SHORTCODE
      || process.env.MPESA_SHORTCODE
      || '3011803';
    const resultRaw = JSON.stringify({ source: 'mpesa_b2c_transactions', ...provider });

    await client.query(
      `UPDATE pb_mpesa_b2c_transactions
       SET status = 'success',
           result_code = $2,
           result_desc = $3,
           transaction_id = $4,
           result_raw = $5,
           updated_at = now()
       WHERE id = $1
         AND ledger_posted = false`,
      [txn.id, resultCode, provider.result_desc || null, transactionId, resultRaw]
    );

    await client.query(
      `INSERT INTO ac_debtors (
         activity_code, dealer, item, payee, reason, account_no, receipt_no,
         cheque_no, journal_no, reference_no, transaction_type, debit, credit,
         date, invoice_no, description, approved, paid, user_name, cash_point,
         balance, credit_bal, trans_date
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7,
               $8, '', $7, 'Payments', $9, 0,
               now(), $10, 'DEBTORS LEDGER', true, false, $11, 'Cashier',
               $9, 0, now())`,
      [
        EMERGENCY_ADVANCE_DEBTOR_CODE,
        memberGroup,
        EMERGENCY_ADVANCE_PURPOSE,
        memberName,
        'Emergency Advance loan',
        txn.member_no,
        voucherNo,
        mpesaReference,
        txn.amount,
        txn.loan_no,
        EMERGENCY_ADVANCE_ACCOUNTING_USER,
      ]
    );

    if (Number(txn.charge || 0) > 0) {
      await client.query(
        `INSERT INTO ac_debtors (
           activity_code, dealer, item, payee, reason, account_no, receipt_no,
           cheque_no, journal_no, reference_no, transaction_type, debit, credit,
           date, invoice_no, description, approved, paid, user_name,
           balance, credit_bal, trans_date
         )
         VALUES ($1, $2, $3, $4, 'Instant Advance Interest', $5, '',
                 $6, '12.00', $7, 'Interest', $8, 0,
                 now(), $9, 'Debtors', false, false, $10,
                 $8, 0, now())`,
        [
          EMERGENCY_ADVANCE_DEBTOR_CODE,
          memberGroup,
          EMERGENCY_ADVANCE_PURPOSE,
          memberName,
          txn.member_no,
          mpesaReference,
          voucherNo,
          txn.charge,
          txn.loan_no,
          EMERGENCY_ADVANCE_ACCOUNTING_USER,
        ]
      );

      await client.query(
        `INSERT INTO ac_ledger (
           activity_code, description, patient_no, dealer, reason, voucher_no,
           payee, gl_code, cheque_no, receipt_no, journal_no, service_type,
           transaction_type, debit, credit, date, transaction_no, closed,
           reconciled, withdrawn, user_name, billing_time
         )
         VALUES ($1, $2, $3, $4, 'Interest', $5,
                 $6, $7, $8, $5, $9, $2,
                 'Interest', 0, $10, now(), $5, false,
                 false, false, $11, now())`,
        [
          EMERGENCY_ADVANCE_INTEREST_CODE,
          EMERGENCY_ADVANCE_PURPOSE,
          txn.member_no,
          memberName,
          interestReferenceNo,
          memberGroup,
          EMERGENCY_ADVANCE_DEBTOR_CODE,
          mpesaReference,
          txn.loan_no,
          txn.charge,
          EMERGENCY_ADVANCE_ACCOUNTING_USER,
        ]
      );
    }

    await client.query(
      `INSERT INTO ac_cash_book (
         activity_code, description, dealer, payment_mode, voucher_no, payee,
         drawer, drawer_bank, gl_code, cheque_no, slip_no, receipt_no,
         journal_no, account_no, account_name, bank_name, transaction_type,
         debit, credit, date, transaction_no, closed, reconciled, banked,
         user_name, cash_point, shift_no, chq_date, approved, fm_approval
       )
       VALUES ($1, $2, $3, 'M-PESA', $4, $3,
               $5, '', $6, $7, '', '',
               $8, $9, 'M-Pesa B2C', 'MPESA B2C', 'Payment',
               0, $10, now(), $4, true, false, false,
               $11, 'Cashier', '', now(), false, false)`,
      [
        EMERGENCY_ADVANCE_DEBTOR_CODE,
        EMERGENCY_ADVANCE_PURPOSE,
        memberName,
        voucherNo,
        memberGroup,
        MPESA_B2C_GL_CODE,
        mpesaReference,
        txn.loan_no,
        b2cAccountNo,
        txn.amount,
        EMERGENCY_ADVANCE_ACCOUNTING_USER,
      ]
    );

    await client.query(
      `UPDATE pb_saccoloan
       SET processed = true, sms_processed = false
       WHERE loan_no = $1 AND mem_no = $2`,
      [txn.loan_no, txn.member_no]
    );

    await client.query(
      `UPDATE pb_mpesa_b2c_transactions
       SET ledger_posted = true,
           ledger_posted_at = now(),
           voucher_no = $2,
           interest_reference_no = $3,
           accounting_user = $4
       WHERE id = $1`,
      [txn.id, voucherNo, interestReferenceNo, EMERGENCY_ADVANCE_ACCOUNTING_USER]
    );

    await client.query('COMMIT');
    console.log(JSON.stringify({
      reconciled: true,
      loanNo: txn.loan_no,
      transactionId,
      voucherNo,
      interestReferenceNo,
      amount: Number(txn.amount),
      charge: Number(txn.charge),
    }, null, 2));
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
