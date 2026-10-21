const dotenv = require('dotenv');
const { Pool } = require('pg');

dotenv.config();

const DRY_RUN = process.argv.includes('--dry-run');
const APPLY = process.argv.includes('--apply');

if (!DRY_RUN && !APPLY) {
  console.error('Use --dry-run to inspect or --apply to delete the latest unposted MS041 Emergency Advance test.');
  process.exit(1);
}

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
    await client.query('BEGIN');

    const candidateResult = await client.query(
      `SELECT b.id, b.originator_conversation_id, b.conversation_id, b.loan_no,
              b.member_no, b.amount, b.charge, b.total_repayable, b.status,
              b.result_code, b.result_desc, b.transaction_id, b.ledger_posted,
              b.created_at
       FROM pb_mpesa_b2c_transactions b
       JOIN pb_saccoloan l
         ON l.loan_no = b.loan_no
        AND upper(trim(l.mem_no)) = upper(trim(b.member_no))
       WHERE upper(trim(b.member_no)) = 'MS041'
         AND upper(coalesce(l.lpurpose, '')) IN ('EMERGENCY ADVANCE', 'METRO SACCO EMERGENCY ADVANCE')
         AND coalesce(b.ledger_posted, false) = false
       ORDER BY b.id DESC
       LIMIT 1`
    );

    const latestRows = await client.query(
      `SELECT b.id, b.loan_no, b.amount, b.status, b.result_code,
              b.transaction_id, b.ledger_posted, b.created_at
       FROM pb_mpesa_b2c_transactions b
       WHERE upper(trim(b.member_no)) = 'MS041'
       ORDER BY b.id DESC
       LIMIT 10`
    );

    const advanceLoans = await client.query(
      `SELECT loan_no, mem_no, lpurpose, amount, coalesce(processed, false) AS processed
       FROM pb_saccoloan
       WHERE upper(trim(mem_no)) = 'MS041'
         AND upper(coalesce(lpurpose, '')) IN ('EMERGENCY ADVANCE', 'METRO SACCO EMERGENCY ADVANCE')
       ORDER BY loan_no DESC
       LIMIT 10`
    );

    const candidate = candidateResult.rows[0] || null;

    if (DRY_RUN || !candidate) {
      console.log(JSON.stringify({
        dryRun: true,
        candidate,
        latestB2C: latestRows.rows,
        emergencyAdvanceLoans: advanceLoans.rows,
      }, null, 2));
      await client.query('ROLLBACK');
      return;
    }

    const debtorCheck = await client.query(
      `SELECT id
       FROM ac_debtors
       WHERE upper(trim(account_no)) = 'MS041'
         AND invoice_no = $1
       LIMIT 1`,
      [candidate.loan_no]
    );

    if (debtorCheck.rows.length > 0) {
      throw new Error(`Refusing to delete ${candidate.loan_no}; accounting rows already exist in ac_debtors.`);
    }

    await client.query(
      `DELETE FROM pb_mpesa_b2c_transactions
       WHERE id = $1
         AND coalesce(ledger_posted, false) = false`,
      [candidate.id]
    );

    await client.query(
      `DELETE FROM pb_saccoloan
       WHERE loan_no = $1
         AND upper(trim(mem_no)) = 'MS041'
         AND upper(coalesce(lpurpose, '')) IN ('EMERGENCY ADVANCE', 'METRO SACCO EMERGENCY ADVANCE')
         AND coalesce(processed, false) = false`,
      [candidate.loan_no]
    );

    await client.query('COMMIT');
    console.log(JSON.stringify({
      deleted: true,
      loanNo: candidate.loan_no,
      b2cId: candidate.id,
      status: candidate.status,
      amount: candidate.amount,
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
