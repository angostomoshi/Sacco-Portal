const fs = require('node:fs');
const path = require('node:path');
const dotenv = require('dotenv');
const { Pool } = require('pg');

dotenv.config({
  path: path.join(__dirname, '..', '.env'),
  quiet: true,
  override: true,
});

const startDate = process.argv[2] || '2026-01-01';
const endDate = process.argv[3] || new Date().toISOString().slice(0, 10);

function assertDate(value, label) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${label} must be YYYY-MM-DD`);
  }
}

function addDays(dateText, days) {
  const date = new Date(`${dateText}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function compactTimestamp(dateText, endOfDay = false) {
  return `${dateText.replace(/-/g, '')}${endOfDay ? '235959' : '000000'}`;
}

function formatSafaricomTimestamp(value) {
  const text = String(value || '').trim();
  if (!/^\d{14}$/.test(text)) return '';
  return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)} ${text.slice(8, 10)}:${text.slice(10, 12)}:${text.slice(12, 14)}`;
}

function csvEscape(value) {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function writeCsv(filePath, rows, summary) {
  const headers = [
    'Transaction Date',
    'M-Pesa Receipt No',
    'Sacco Receipt No',
    'Portal Match',
    'Portal Transaction ID',
    'Member No',
    'Member Name',
    'Purpose',
    'Account Reference',
    'Phone Number',
    'Amount',
    'Status',
    'Result Code',
    'Result Description',
    'Checkout Request ID',
    'Merchant Request ID',
    'Ledger Posted',
    'Receipt Emailed',
  ];

  const lines = [
    headers.join(','),
    ...rows.map((row) => [
      formatSafaricomTimestamp(row.safaricom_transaction_date) || row.portal_transaction_date || row.created_at,
      row.mpesa_receipt_no,
      row.receipt_no,
      row.portal_match,
      row.portal_transaction_id,
      row.member_no,
      row.member_name,
      row.purpose,
      row.account_reference,
      row.phone_no,
      row.amount,
      row.status,
      row.result_code,
      row.result_desc,
      row.checkout_request_id,
      row.merchant_request_id,
      row.ledger_posted,
      row.receipt_emailed,
    ].map(csvEscape).join(',')),
  ];

  lines.push('');
  lines.push(['SUMMARY'].map(csvEscape).join(','));
  lines.push(['Total Successful Paybill Receipts', summary.count].map(csvEscape).join(','));
  lines.push(['Total Amount', Number(summary.totalAmount.toFixed(2))].map(csvEscape).join(','));
  lines.push('');
  lines.push(['Totals By Purpose'].map(csvEscape).join(','));
  lines.push(['Purpose', 'Amount'].map(csvEscape).join(','));
  for (const [purpose, amount] of Object.entries(summary.byPurpose)) {
    lines.push([purpose, Number(amount.toFixed(2))].map(csvEscape).join(','));
  }
  lines.push('');
  lines.push(['Counts By Portal Match'].map(csvEscape).join(','));
  lines.push(['Portal Match', 'Count'].map(csvEscape).join(','));
  for (const [portalMatch, count] of Object.entries(summary.byPortalMatch)) {
    lines.push([portalMatch, count].map(csvEscape).join(','));
  }

  fs.writeFileSync(filePath, `${lines.join('\r\n')}\r\n`);
}

assertDate(startDate, 'start date');
assertDate(endDate, 'end date');

const pool = new Pool({
  host: process.env.PGHOST || process.env.DB_HOST || '192.168.4.10',
  port: process.env.PGPORT || process.env.DB_PORT || 5432,
  database: process.env.PGDATABASE || process.env.DB_NAME || 'metrosacco',
  user: process.env.PGUSER || process.env.DB_USER || 'centre',
  password: process.env.PGPASSWORD || process.env.DB_PASSWORD,
  connectionTimeoutMillis: 10000,
  statement_timeout: 30000,
});

(async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN READ ONLY');

    const startCompact = compactTimestamp(startDate);
    const endCompact = compactTimestamp(endDate, true);
    const endExclusive = addDays(endDate, 1);

    const result = await client.query(
      `WITH successful_callbacks AS (
         SELECT DISTINCT ON (mpesa_receipt_no)
                *
         FROM mpesa_stk_call_back
         WHERE result_code = '0'
           AND mpesa_receipt_no IS NOT NULL
           AND transaction_date BETWEEN $1 AND $2
         ORDER BY mpesa_receipt_no, transaction_date, id
       )
       SELECT
         cb.id AS callback_id,
         t.id AS portal_transaction_id,
         cb.transaction_date AS safaricom_transaction_date,
         to_char(t.transaction_date, 'YYYY-MM-DD HH24:MI:SS') AS portal_transaction_date,
         to_char(t.created_at, 'YYYY-MM-DD HH24:MI:SS') AS created_at,
         cb.mpesa_receipt_no,
         COALESCE(t.receipt_no, '') AS receipt_no,
         COALESCE(t.member_no, '') AS member_no,
         COALESCE(sr.holders_name, sr.short_name, '') AS member_name,
         COALESCE(t.purpose, '') AS purpose,
         COALESCE(t.account_reference, '') AS account_reference,
         COALESCE(cb.customer_phone_number, t.phone_no, '') AS phone_no,
         cb.amount::numeric(14, 2) AS amount,
         COALESCE(t.status, 'success') AS status,
         NULLIF(cb.result_code, '')::int AS result_code,
         cb.result_desc,
         cb.checkout_request_id,
         cb.merchant_request_id,
         COALESCE(t.ledger_posted, false) AS ledger_posted,
         COALESCE(t.receipt_emailed, false) AS receipt_emailed,
         CASE
           WHEN t.id IS NULL THEN 'Outside portal / no portal match'
           WHEN t.status = 'success' AND COALESCE(t.ledger_posted, false) = true THEN 'Portal posted'
           WHEN t.status = 'success' THEN 'Portal success not posted'
           WHEN t.status = 'pending' THEN 'Provider success, portal pending'
           ELSE 'Portal status: ' || COALESCE(t.status, 'unknown')
         END AS portal_match
       FROM successful_callbacks cb
       LEFT JOIN LATERAL (
         SELECT *
         FROM pb_mpesa_transactions t
         WHERE t.checkout_request_id = cb.checkout_request_id
         ORDER BY
           CASE WHEN t.status = 'success' THEN 0 ELSE 1 END,
           t.id
         LIMIT 1
       ) t ON true
       LEFT JOIN pb_share_register sr
         ON upper(trim(sr.acc_no)) = upper(trim(t.member_no))
       ORDER BY cb.transaction_date, cb.id`,
      [startCompact, endCompact]
    );

    const summary = result.rows.reduce((acc, row) => {
      acc.count += 1;
      acc.totalAmount += Number(row.amount || 0);
      const purpose = row.purpose || 'outside_portal';
      acc.byPurpose[purpose] = (acc.byPurpose[purpose] || 0) + Number(row.amount || 0);
      acc.byPortalMatch[row.portal_match] = (acc.byPortalMatch[row.portal_match] || 0) + 1;
      return acc;
    }, { count: 0, totalAmount: 0, byPurpose: {}, byPortalMatch: {} });

    await client.query('ROLLBACK');

    const reportsDir = path.join(__dirname, '..', 'reports');
    fs.mkdirSync(reportsDir, { recursive: true });
    const reportPath = path.join(reportsDir, `safaricom-paybill-report-${startDate}-to-${endDate}.csv`);
    const summaryPath = path.join(reportsDir, `safaricom-paybill-report-${startDate}-to-${endDate}.summary.json`);

    writeCsv(reportPath, result.rows, summary);
    fs.writeFileSync(summaryPath, JSON.stringify({
      startDate,
      endDate,
      generatedAt: new Date().toISOString(),
      successfulTransactions: summary.count,
      totalAmount: Number(summary.totalAmount.toFixed(2)),
      totalsByPurpose: Object.fromEntries(
        Object.entries(summary.byPurpose).map(([purpose, amount]) => [purpose, Number(amount.toFixed(2))])
      ),
      countsByPortalMatch: summary.byPortalMatch,
      reportPath,
    }, null, 2));

    console.log(JSON.stringify({
      startDate,
      endDate,
      rows: summary.count,
      totalAmount: Number(summary.totalAmount.toFixed(2)),
      totalsByPurpose: Object.fromEntries(
        Object.entries(summary.byPurpose).map(([purpose, amount]) => [purpose, Number(amount.toFixed(2))])
      ),
      countsByPortalMatch: summary.byPortalMatch,
      reportPath,
      summaryPath,
    }, null, 2));
  } finally {
    client.release();
    await pool.end();
  }
})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
