const path = require('node:path');
const dotenv = require('dotenv');
const { Pool } = require('pg');

dotenv.config({
  path: path.join(__dirname, '..', '.env'),
  quiet: true,
  override: true,
});

const memberNo = process.argv[2] || 'MS666';
const requestedAmount = Number(process.argv[3] || 1000);
const periodMonths = Number(process.argv[4] || 1);
const instantPurpose = 'METRO SACCO INSTANT LOAN';

const pool = new Pool({
  host: process.env.PGHOST || process.env.DB_HOST || '192.168.4.10',
  port: process.env.PGPORT || process.env.DB_PORT || 5432,
  database: process.env.PGDATABASE || process.env.DB_NAME || 'metrosacco',
  user: process.env.PGUSER || process.env.DB_USER || 'centre',
  password: process.env.PGPASSWORD || process.env.DB_PASSWORD,
  connectionTimeoutMillis: 10000,
  statement_timeout: 15000,
});

function formatKES(value) {
  return Number(value || 0).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

(async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN READ ONLY');

    const memberResult = await client.query(
      `SELECT acc_no, holders_name, date AS member_since,
              COALESCE(loan_blacklisted, false) AS loan_blacklisted
       FROM pb_share_register
       WHERE acc_no = $1`,
      [memberNo]
    );

    const eligibilityResult = await client.query(
      `SELECT
         COALESCE((SELECT SUM(COALESCE(credit, 0) - COALESCE(debit, 0))
                   FROM ac_shares_ledger
                   WHERE account_no = $1), 0) AS shares_ledger_balance,
         COALESCE((SELECT SUM(COALESCE(credit, 0) - COALESCE(debit, 0))
                   FROM ac_shares_capital
                   WHERE account_no = $1), 0) AS share_capital,
         COALESCE((SELECT MAX(outstanding)
                   FROM (
                     SELECT d.invoice_no,
                            SUM(COALESCE(d.balance, 0) - COALESCE(d.credit_bal, 0)) AS outstanding
                     FROM ac_debtors d
                     JOIN pb_saccoloan l ON l.mem_no = d.account_no AND l.loan_no = d.invoice_no
                     WHERE d.account_no = $1
                       AND upper(coalesce(l.lpurpose, d.item, '')) LIKE '%INSTANT LOAN%'
                     GROUP BY d.invoice_no
                     HAVING SUM(COALESCE(d.balance, 0) - COALESCE(d.credit_bal, 0)) > 0
                   ) unpaid_instant_loans), 0) AS active_instant_balance`,
      [memberNo]
    );

    const pendingResult = await client.query(
      `SELECT id, loan_no, amount, lpurpose,
              COALESCE(processed, false) AS processed
       FROM pb_saccoloan
       WHERE mem_no = $1
         AND COALESCE(processed, false) = false
         AND upper(coalesce(lpurpose, '')) = $2
       ORDER BY id DESC
       LIMIT 5`,
      [memberNo, instantPurpose]
    );

    const instantLoans = await client.query(
      `SELECT l.loan_no, l.lpurpose, l.amount,
              COALESCE(l.processed, false) AS processed,
              COALESCE(SUM(COALESCE(d.balance, 0) - COALESCE(d.credit_bal, 0)), 0) AS outstanding
       FROM pb_saccoloan l
       LEFT JOIN ac_debtors d ON d.account_no = l.mem_no AND d.invoice_no = l.loan_no
       WHERE l.mem_no = $1
         AND upper(coalesce(l.lpurpose, '')) LIKE '%INSTANT LOAN%'
       GROUP BY l.loan_no, l.lpurpose, l.amount, l.processed, l.id
       ORDER BY l.id DESC
       LIMIT 10`,
      [memberNo]
    );

    await client.query('ROLLBACK');

    const member = memberResult.rows[0] || null;
    const eligibility = eligibilityResult.rows[0] || {};
    const shareCapital = Number(eligibility.share_capital || 0);
    const sharesLedgerBalance = Number(eligibility.shares_ledger_balance || 0);
    const activeInstantBalance = Number(eligibility.active_instant_balance || 0);
    const reasons = [];
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    if (!member) reasons.push('Member record not found.');
    if (member?.loan_blacklisted) reasons.push('Member is loan_blacklisted.');
    if (member && (!member.member_since || new Date(member.member_since) > sixMonthsAgo)) {
      reasons.push('Membership is less than 6 months old or missing member_since date.');
    }
    if (shareCapital < 10000) reasons.push(`Share capital is KES ${formatKES(shareCapital)}, below KES 10,000 minimum.`);
    if (activeInstantBalance > 0) reasons.push(`Existing unpaid instant loan balance is KES ${formatKES(activeInstantBalance)}.`);
    if (sharesLedgerBalance < requestedAmount) reasons.push(`Shares ledger balance is KES ${formatKES(sharesLedgerBalance)}, below requested KES ${formatKES(requestedAmount)}.`);
    if (requestedAmount > sharesLedgerBalance * 3) reasons.push(`Requested amount exceeds 3x shares ledger limit of KES ${formatKES(sharesLedgerBalance * 3)}.`);
    if (pendingResult.rows.length > 0) reasons.push(`Pending instant loan application exists: ${pendingResult.rows[0].loan_no}.`);
    if (requestedAmount < 1000) reasons.push('Requested amount is below KES 1,000 minimum.');
    if (requestedAmount > 50000) reasons.push('Requested amount exceeds KES 50,000 instant loan cap.');
    if (periodMonths > 6) reasons.push('Requested period exceeds 6 months.');

    console.log(JSON.stringify({
      memberNo,
      requestedAmount,
      periodMonths,
      eligible: reasons.length === 0,
      reasons,
      member,
      balances: {
        sharesLedgerBalance,
        shareCapital,
        activeInstantBalance,
        shareCapitalBasedLimit: sharesLedgerBalance * 3,
      },
      pendingInstantLoans: pendingResult.rows,
      recentInstantLoans: instantLoans.rows,
    }, null, 2));
  } finally {
    client.release();
    await pool.end();
  }
})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
