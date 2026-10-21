const dotenv = require('dotenv');
const { Pool } = require('pg');

dotenv.config();

const memberNo = process.argv[2] || 'MS041';
const purpose = 'METRO SACCO EMERGENCY ADVANCE';

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
    const eligibility = await client.query(
      `SELECT
         COALESCE((SELECT SUM(COALESCE(credit, 0) - COALESCE(debit, 0))
                   FROM ac_shares_ledger
                   WHERE account_no = $1), 0) AS savings_balance,
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
                       AND upper(coalesce(l.lpurpose, d.item, '')) = $2
                     GROUP BY d.invoice_no
                     HAVING SUM(COALESCE(d.balance, 0) - COALESCE(d.credit_bal, 0)) > 0
                   ) active_advances), 0) AS active_advance_balance,
         COALESCE((SELECT COUNT(*)
                   FROM pb_saccoloan
                   WHERE mem_no = $1
                     AND upper(coalesce(lpurpose, '')) = $2
                     AND COALESCE(processed, false) = false), 0) AS pending_advances`,
      [memberNo, purpose]
    );

    const advances = await client.query(
      `SELECT l.loan_no,
              l.amount,
              coalesce(l.processed, false) AS processed,
              COALESCE(SUM(COALESCE(d.balance, 0) - COALESCE(d.credit_bal, 0)), 0) AS outstanding
       FROM pb_saccoloan l
       LEFT JOIN ac_debtors d ON d.account_no = l.mem_no AND d.invoice_no = l.loan_no
       WHERE l.mem_no = $1
         AND upper(coalesce(l.lpurpose, '')) = $2
       GROUP BY l.loan_no, l.amount, l.processed
       ORDER BY l.loan_no DESC`,
      [memberNo, purpose]
    );

    await client.query('ROLLBACK');
    console.log(JSON.stringify({
      memberNo,
      eligibility: eligibility.rows[0],
      emergencyAdvances: advances.rows,
    }, null, 2));
  } finally {
    client.release();
    await pool.end();
  }
})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
