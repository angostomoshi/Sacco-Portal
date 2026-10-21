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
const endDate = process.argv[3] || '2026-10-07';

function assertDate(value, label) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`${label} must be YYYY-MM-DD`);
}

function compactTimestamp(dateText, endOfDay = false) {
  return `${dateText.replace(/-/g, '')}${endOfDay ? '235959' : '000000'}`;
}

function formatSafaricomTimestamp(value) {
  const text = String(value || '').trim();
  if (!/^\d{14}$/.test(text)) return text;
  return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)} ${text.slice(8, 10)}:${text.slice(10, 12)}:${text.slice(12, 14)}`;
}

function csvEscape(value) {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function money(value) {
  return Number(Number(value || 0).toFixed(2));
}

function writeCsv(filePath, rows, summary) {
  const headers = [
    'Flow',
    'Direction',
    'Source Table',
    'Transaction Date',
    'M-Pesa Receipt No',
    'Sacco Receipt/Voucher',
    'Portal Match',
    'Portal Transaction ID',
    'Member No',
    'Customer/Member Name',
    'Purpose',
    'Account Reference',
    'Phone/Party',
    'Amount',
    'Status',
    'Result Code',
    'Result Description',
    'Shortcode',
    'Checkout/Conversation ID',
    'Ledger Posted',
    'Receipt Emailed',
  ];

  const lines = [
    headers.join(','),
    ...rows.map((row) => [
      row.flow,
      row.direction,
      row.source_table,
      formatSafaricomTimestamp(row.transaction_time),
      row.mpesa_receipt_no,
      row.sacco_receipt_no,
      row.portal_match,
      row.portal_transaction_id,
      row.member_no,
      row.customer_name,
      row.purpose,
      row.account_reference,
      row.phone_or_party,
      row.amount,
      row.status,
      row.result_code,
      row.result_desc,
      row.shortcode,
      row.provider_reference,
      row.ledger_posted,
      row.receipt_emailed,
    ].map(csvEscape).join(',')),
  ];

  lines.push('');
  lines.push('SUMMARY');
  lines.push(['Report Period', `${summary.startDate} to ${summary.endDate}`].map(csvEscape).join(','));
  lines.push(['Total Rows', summary.totalRows].map(csvEscape).join(','));
  lines.push(['C2B Money In Total', summary.c2bTotal].map(csvEscape).join(','));
  lines.push(['B2C Money Out Total', summary.b2cTotal].map(csvEscape).join(','));
  lines.push(['Net Movement', summary.netMovement].map(csvEscape).join(','));
  lines.push('');
  lines.push('Totals By Flow');
  lines.push(['Flow', 'Count', 'Amount'].map(csvEscape).join(','));
  for (const [flow, item] of Object.entries(summary.byFlow)) {
    lines.push([flow, item.count, item.amount].map(csvEscape).join(','));
  }
  lines.push('');
  lines.push('Totals By Purpose');
  lines.push(['Purpose', 'Count', 'Amount'].map(csvEscape).join(','));
  for (const [purpose, item] of Object.entries(summary.byPurpose)) {
    lines.push([purpose, item.count, item.amount].map(csvEscape).join(','));
  }
  lines.push('');
  lines.push('Counts By Portal Match');
  lines.push(['Portal Match', 'Count'].map(csvEscape).join(','));
  for (const [match, count] of Object.entries(summary.byPortalMatch)) {
    lines.push([match, count].map(csvEscape).join(','));
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
  statement_timeout: 60000,
});

(async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN READ ONLY');

    const startCompact = compactTimestamp(startDate);
    const endCompact = compactTimestamp(endDate, true);

    const result = await client.query(
      `WITH c2b AS (
         SELECT DISTINCT ON (c.trans_id)
                'C2B' AS flow,
                'Money In' AS direction,
                'mpesa_c2b_transactions' AS source_table,
                c.trans_time AS transaction_time,
                c.trans_id AS mpesa_receipt_no,
                COALESCE(t.receipt_no, '') AS sacco_receipt_no,
                t.id::text AS portal_transaction_id,
                COALESCE(t.member_no, sr.acc_no, '') AS member_no,
                COALESCE(sr.holders_name, c.customer_name, concat_ws(' ', c.first_name, c.middle_name, c.last_name), '') AS customer_name,
                COALESCE(
                  t.purpose,
                  CASE
                    WHEN c.bill_ref_number ~* '^MS[0-9]+' THEN 'member_deposit'
                    WHEN c.bill_ref_number LIKE '%/%' THEN 'loan_repayment'
                    ELSE 'outside_portal'
                  END
                ) AS purpose,
                COALESCE(t.account_reference, c.bill_ref_number, '') AS account_reference,
                COALESCE(c.msisdn, c.phone_no, '') AS phone_or_party,
                NULLIF(c.trans_amount, '')::numeric(14, 2) AS amount,
                COALESCE(t.status, 'success') AS status,
                0::int AS result_code,
                'C2B payment received' AS result_desc,
                COALESCE(c.business_short_code, '') AS shortcode,
                COALESCE(t.checkout_request_id, c.third_party_trans_id, '') AS provider_reference,
                COALESCE(t.ledger_posted, false) AS ledger_posted,
                COALESCE(t.receipt_emailed, false) AS receipt_emailed,
                CASE
                  WHEN t.id IS NULL THEN 'Outside portal / no portal match'
                  WHEN t.status = 'success' AND COALESCE(t.ledger_posted, false) = true THEN 'Portal posted'
                  WHEN t.status = 'success' THEN 'Portal success not posted'
                  WHEN t.status = 'pending' THEN 'Provider success, portal pending'
                  ELSE 'Portal status: ' || COALESCE(t.status, 'unknown')
                END AS portal_match
         FROM mpesa_c2b_transactions c
         LEFT JOIN LATERAL (
           SELECT *
           FROM pb_mpesa_transactions t
           WHERE t.mpesa_receipt_no = c.trans_id
              OR t.checkout_request_id = c.third_party_trans_id
           ORDER BY CASE WHEN t.status = 'success' THEN 0 ELSE 1 END, t.id
           LIMIT 1
         ) t ON true
         LEFT JOIN pb_share_register sr
           ON upper(trim(sr.acc_no)) = upper(trim(COALESCE(t.member_no, c.bill_ref_number)))
         WHERE c.trans_id IS NOT NULL
           AND c.trans_time BETWEEN $1 AND $2
         ORDER BY c.trans_id, c.trans_time, c.id
       ),
       b2c AS (
         SELECT DISTINCT ON (COALESCE(b.transaction_receipt, b.transactionid))
                'B2C' AS flow,
                'Money Out' AS direction,
                'mpesa_b2c_transactions' AS source_table,
                to_char(to_timestamp(b.transaction_completed_date_time, 'DD.MM.YYYY HH24:MI:SS'), 'YYYYMMDDHH24MISS') AS transaction_time,
                COALESCE(b.transaction_receipt, b.transactionid) AS mpesa_receipt_no,
                COALESCE(p.voucher_no, '') AS sacco_receipt_no,
                p.id::text AS portal_transaction_id,
                COALESCE(p.member_no, '') AS member_no,
                COALESCE(sr.holders_name, b.receiver_party_public_name, '') AS customer_name,
                COALESCE('emergency_advance', '') AS purpose,
                COALESCE(p.loan_no, '') AS account_reference,
                COALESCE(b.receiver_party_public_name, '') AS phone_or_party,
                b.transaction_amount::numeric(14, 2) AS amount,
                COALESCE(p.status, 'success') AS status,
                NULLIF(b.result_code, '')::int AS result_code,
                COALESCE(b.result_desc, 'B2C payment completed') AS result_desc,
                '' AS shortcode,
                COALESCE(b.originator_conversationid, b.conversationid, '') AS provider_reference,
                COALESCE(p.ledger_posted, false) AS ledger_posted,
                COALESCE(p.receipt_emailed, false) AS receipt_emailed,
                CASE
                  WHEN p.id IS NULL THEN 'Outside portal / no portal match'
                  WHEN p.status = 'success' AND COALESCE(p.ledger_posted, false) = true THEN 'Portal posted'
                  WHEN p.status = 'success' THEN 'Portal success not posted'
                  WHEN p.status = 'pending' THEN 'Provider success, portal pending'
                  ELSE 'Portal status: ' || COALESCE(p.status, 'unknown')
                END AS portal_match
         FROM mpesa_b2c_transactions b
         LEFT JOIN LATERAL (
           SELECT *
           FROM pb_mpesa_b2c_transactions p
           WHERE p.transaction_id = COALESCE(b.transaction_receipt, b.transactionid)
              OR p.originator_conversation_id = b.originator_conversationid
              OR p.conversation_id = b.conversationid
           ORDER BY CASE WHEN p.status = 'success' THEN 0 ELSE 1 END, p.id
           LIMIT 1
         ) p ON true
         LEFT JOIN pb_share_register sr
           ON upper(trim(sr.acc_no)) = upper(trim(p.member_no))
         WHERE b.result_code = '0'
           AND COALESCE(b.transaction_receipt, b.transactionid) IS NOT NULL
           AND to_timestamp(b.transaction_completed_date_time, 'DD.MM.YYYY HH24:MI:SS') >= $3::date
           AND to_timestamp(b.transaction_completed_date_time, 'DD.MM.YYYY HH24:MI:SS') < ($4::date + interval '1 day')
         ORDER BY COALESCE(b.transaction_receipt, b.transactionid), to_timestamp(b.transaction_completed_date_time, 'DD.MM.YYYY HH24:MI:SS'), b.id
       )
       SELECT *
       FROM (
         SELECT * FROM c2b
         UNION ALL
         SELECT * FROM b2c
       ) combined
       ORDER BY transaction_time, flow, mpesa_receipt_no`,
      [startCompact, endCompact, startDate, endDate]
    );

    await client.query('ROLLBACK');

    const summary = result.rows.reduce((acc, row) => {
      const amount = Number(row.amount || 0);
      acc.totalRows += 1;
      if (row.flow === 'C2B') acc.c2bTotal += amount;
      if (row.flow === 'B2C') acc.b2cTotal += amount;
      const flow = row.flow || 'Unknown';
      const purpose = row.purpose || 'unknown';
      acc.byFlow[flow] ||= { count: 0, amount: 0 };
      acc.byPurpose[purpose] ||= { count: 0, amount: 0 };
      acc.byFlow[flow].count += 1;
      acc.byFlow[flow].amount += amount;
      acc.byPurpose[purpose].count += 1;
      acc.byPurpose[purpose].amount += amount;
      acc.byPortalMatch[row.portal_match] = (acc.byPortalMatch[row.portal_match] || 0) + 1;
      return acc;
    }, { totalRows: 0, c2bTotal: 0, b2cTotal: 0, byFlow: {}, byPurpose: {}, byPortalMatch: {} });

    for (const item of Object.values(summary.byFlow)) item.amount = money(item.amount);
    for (const item of Object.values(summary.byPurpose)) item.amount = money(item.amount);
    summary.c2bTotal = money(summary.c2bTotal);
    summary.b2cTotal = money(summary.b2cTotal);
    summary.netMovement = money(summary.c2bTotal - summary.b2cTotal);
    summary.startDate = startDate;
    summary.endDate = endDate;

    const reportsDir = path.join(__dirname, '..', 'reports');
    fs.mkdirSync(reportsDir, { recursive: true });
    const reportPath = path.join(reportsDir, `full-mpesa-report-${startDate}-to-${endDate}.csv`);
    const summaryPath = path.join(reportsDir, `full-mpesa-report-${startDate}-to-${endDate}.summary.json`);

    writeCsv(reportPath, result.rows, summary);
    fs.writeFileSync(summaryPath, JSON.stringify({
      ...summary,
      generatedAt: new Date().toISOString(),
      reportPath,
    }, null, 2));

    console.log(JSON.stringify({
      reportPath,
      summaryPath,
      totalRows: summary.totalRows,
      c2bTotal: summary.c2bTotal,
      b2cTotal: summary.b2cTotal,
      netMovement: summary.netMovement,
      byFlow: summary.byFlow,
      byPortalMatch: summary.byPortalMatch,
    }, null, 2));
  } finally {
    client.release();
    await pool.end();
  }
})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
