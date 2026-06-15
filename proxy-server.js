const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { Pool } = require('pg');
const PDFDocument = require('pdfkit');

const app = express();
const port = 3023;

// CORS configuration
app.use(cors({
  origin: 'http://localhost:3000',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Cookie', 'X-Requested-With']
}));

app.use(express.json());

// Disable caching
app.use('/api/v1', (req, res, next) => {
  res.header('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.header('Pragma', 'no-cache');
  res.header('Expires', '0');
  next();
});
app.disable('etag');

// Logging middleware
app.use((req, res, next) => {
  console.log(`\n📡 ${req.method} ${req.url}`);
  if (req.body && Object.keys(req.body).length > 0) {
    console.log(`   Body:`, req.body);
  }
  next();
});

// Database connection
const dbPool = new Pool({
  host: '192.168.4.10',
  port: 5432,
  database: 'sacco',
  user: 'postgres',
  password: 'legacy#007',
  ssl: false,
  connectionTimeoutMillis: 10000,
});

dbPool.connect((err) => {
  if (err) {
    console.error('❌ Database connection failed:', err.message);
  } else {
    console.log('✅ Database connected successfully');
  }
});

const LIVE_API_BASE = 'https://memberportal.metro-sacco.com/api/v1';

// ============================================
// LOCAL ENDPOINTS (Handled by this proxy)
// ============================================
const LOCAL_ENDPOINTS = [
  '/auth/change-password',  // Handle password change locally
  '/loan-statement-direct', 
  '/withdrawable-statement-direct'
];

// ============================================
// MIDDLEWARE: Route requests
// ============================================
app.use('/api/v1', async (req, res, next) => {
  // Check if this is a local endpoint
  const isLocalEndpoint = LOCAL_ENDPOINTS.some(endpoint => req.path === endpoint);
  
  if (isLocalEndpoint) {
    return next(); // Handle locally
  }
  
  // Forward all other requests to live server
  try {
    const liveUrl = `${LIVE_API_BASE}${req.path}`;
    console.log(`   🔄 FORWARDING to live server: ${liveUrl}`);
    
    const response = await axios({
      method: req.method,
      url: liveUrl,
      data: req.body,
      params: req.query,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...(req.headers.authorization && { 'Authorization': req.headers.authorization })
      },
      timeout: 30000
    });
    
    console.log(`   ✅ Response: ${response.status}`);
    res.status(response.status).json(response.data);
  } catch (error) {
    console.error(`   ❌ Forwarding error:`, error.message);
    if (error.response) {
      console.log(`   📝 Live server responded with: ${error.response.status}`);
      res.status(error.response.status).json(error.response.data);
    } else {
      res.status(500).json({ error: 'Failed to connect to live server', message: error.message });
    }
  }
});

// ============================================
// LOCAL ENDPOINT: CHANGE PASSWORD
// ============================================
app.post('/api/v1/auth/change-password', async (req, res) => {
  const { memberNo, otp, newPassword, confirmPassword } = req.body;
  
  console.log(`\n🔐 [LOCAL] Password change request for: ${memberNo}`);
  console.log(`   OTP provided: ${otp}`);
  console.log(`   New password length: ${newPassword?.length}`);
  
  // Validation
  if (newPassword !== confirmPassword) {
    console.log(`   ❌ Passwords do not match`);
    return res.status(400).json({ success: false, message: 'Passwords do not match' });
  }
  
  if (!otp || otp.length < 4) {
    console.log(`   ❌ Invalid OTP`);
    return res.status(400).json({ success: false, message: 'Please enter a valid OTP' });
  }
  
  if (!newPassword || newPassword.length < 4) {
    console.log(`   ❌ Password too short`);
    return res.status(400).json({ success: false, message: 'Password must be at least 4 characters' });
  }
  
  try {
    // Check if member exists
    console.log(`   📊 Checking if member exists...`);
    const memberCheck = await dbPool.query(
      `SELECT acc_no, holders_name FROM pb_share_register WHERE acc_no = $1`, 
      [memberNo]
    );
    
    if (memberCheck.rows.length === 0) {
      console.log(`   ❌ Member not found: ${memberNo}`);
      return res.status(404).json({ success: false, message: 'Member not found.' });
    }
    
    console.log(`   ✅ Member found: ${memberCheck.rows[0].holders_name}`);
    
    // Check what columns exist in the table
    const columns = await dbPool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'pb_share_register' 
      AND column_name IN ('pass', 'password', 'pwd', 'member_password', 'login_password')
    `);
    
    let passwordColumn = 'pass'; // default
    if (columns.rows.length > 0) {
      passwordColumn = columns.rows[0].column_name;
      console.log(`   📝 Found password column: ${passwordColumn}`);
    } else {
      console.log(`   ⚠️ No password column found, using 'pass' as default`);
    }
    
    // Update the password
    console.log(`   💾 Updating password...`);
    const updateQuery = `UPDATE pb_share_register SET "${passwordColumn}" = $1 WHERE acc_no = $2`;
    const result = await dbPool.query(updateQuery, [newPassword, memberNo]);
    
    console.log(`   ✅ Password updated successfully for ${memberNo}!`);
    console.log(`   📊 Rows affected: ${result.rowCount}`);
    
    return res.status(200).json({
      success: true,
      message: 'Password changed successfully! You can now login with your new password.'
    });
    
  } catch (dbError) {
    console.error(`   ❌ Database error:`, dbError.message);
    console.error(`   📝 Full error:`, dbError);
    return res.status(500).json({ 
      success: false, 
      message: 'Failed to change password. Please try again later.',
      error: dbError.message
    });
  }
});

// ============================================
// LOCAL ENDPOINT: LOAN STATEMENT PDF
// ============================================
app.post('/api/v1/loan-statement-direct', async (req, res) => {
  const { loanNo, memberNo, startDate, endDate } = req.body;
  console.log(`\n📄 [LOCAL] Generating PDF for Loan: ${loanNo}`);
  
  try {
    const headerResult = await dbPool.query("SELECT header_name FROM pb_header LIMIT 1");
    const organisationName = headerResult.rows[0]?.header_name || 'METROPOLITAN HOSPITAL SACCO LTD';
    
    const loanResult = await dbPool.query(
      `SELECT lpurpose as purpose, amount, cdate as start_date, edate as end_date, period, interest
       FROM pb_saccoloan WHERE loan_no = $1`,
      [loanNo]
    );
    
    if (loanResult.rows.length === 0) {
      return res.status(404).json({ error: 'Loan not found' });
    }
    const loan = loanResult.rows[0];
    
    const memberResult = await dbPool.query(
      `SELECT holders_name, id_no, tel1, email_add, acc_no 
       FROM pb_share_register WHERE acc_no = $1`,
      [memberNo]
    );
    
    if (memberResult.rows.length === 0) {
      return res.status(404).json({ error: 'Member not found' });
    }
    const member = memberResult.rows[0];
    
    const openingResult = await dbPool.query(
      `SELECT COALESCE(SUM(balance - credit_bal), 0) as opening_balance
       FROM ac_debtors 
       WHERE account_no = $1 AND invoice_no = $2 AND date::date < $3::date`,
      [memberNo, loanNo, startDate]
    );
    const openingBalance = parseFloat(openingResult.rows[0]?.opening_balance || 0);
    
    const transResult = await dbPool.query(
      `SELECT TO_CHAR(date, 'DD/MM/YYYY') as trans_date,
              initcap(item) as item, reference_no, receipt_no,
              COALESCE(balance, 0) as debit, COALESCE(credit_bal, 0) as credit
       FROM ac_debtors 
       WHERE account_no = $1 AND invoice_no = $2
         AND date::date BETWEEN $3::date AND $4::date
         AND (balance <> 0 OR credit_bal <> 0)
       ORDER BY date ASC`,
      [memberNo, loanNo, startDate, endDate]
    );
    
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const chunks = [];
    
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => {
      const pdfBuffer = Buffer.concat(chunks);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=loan-statement-${loanNo}.pdf`);
      res.send(pdfBuffer);
    });
    
    // Generate PDF
    doc.fontSize(16).font('Helvetica-Bold').text(organisationName, { align: 'center' });
    doc.moveDown();
    doc.fontSize(14).font('Helvetica-Bold').text('LOAN STATEMENT', { align: 'center' });
    doc.moveDown();
    
    doc.fontSize(10).font('Helvetica-Bold').text('MEMBER INFORMATION');
    doc.font('Helvetica');
    doc.text(`Name: ${member.holders_name || 'N/A'}`);
    doc.text(`Member No: ${member.acc_no || memberNo}`);
    doc.text(`ID No: ${member.id_no || 'N/A'}`);
    doc.text(`Phone: ${member.tel1 || 'N/A'}`);
    doc.text(`Email: ${member.email_add || 'N/A'}`);
    doc.moveDown();
    
    doc.font('Helvetica-Bold').text('LOAN INFORMATION');
    doc.font('Helvetica');
    doc.text(`Loan Number: ${loanNo}`);
    doc.text(`Purpose: ${loan.purpose || 'N/A'}`);
    doc.text(`Amount: KES ${parseFloat(loan.amount || 0).toLocaleString()}`);
    doc.text(`Interest Rate: ${loan.interest || 0}%`);
    doc.text(`Period: ${loan.period || 0} months`);
    doc.text(`Start Date: ${loan.start_date ? new Date(loan.start_date).toLocaleDateString('en-GB') : 'N/A'}`);
    doc.text(`End Date: ${loan.end_date ? new Date(loan.end_date).toLocaleDateString('en-GB') : 'N/A'}`);
    doc.moveDown();
    
    doc.font('Helvetica-Bold').text('TRANSACTION HISTORY', { underline: true });
    doc.moveDown(0.5);
    
    let runningBalance = openingBalance;
    let totalDebit = 0, totalCredit = 0;
    let y = doc.y + 10;
    
    doc.font('Helvetica-Bold').fontSize(8);
    doc.text('Date', 50, y);
    doc.text('Description', 100, y);
    doc.text('Ref No', 250, y);
    doc.text('Receipt No', 320, y);
    doc.text('Debit (KES)', 400, y, { align: 'right' });
    doc.text('Credit (KES)', 470, y, { align: 'right' });
    doc.moveTo(50, y + 12).lineTo(550, y + 12).stroke();
    y += 18;
    doc.font('Helvetica').fontSize(8);
    
    doc.text('-', 50, y);
    doc.text('OPENING BALANCE', 100, y);
    doc.text('-', 250, y);
    doc.text('-', 320, y);
    doc.text(openingBalance.toLocaleString(undefined, { minimumFractionDigits: 2 }), 400, y, { align: 'right' });
    doc.text('-', 470, y, { align: 'right' });
    y += 15;
    
    for (const row of transResult.rows) {
      const debit = parseFloat(row.debit) || 0;
      const credit = parseFloat(row.credit) || 0;
      runningBalance = runningBalance + debit - credit;
      totalDebit += debit;
      totalCredit += credit;
      
      if (y > 700) {
        doc.addPage();
        y = 50;
        doc.font('Helvetica-Bold').fontSize(8);
        doc.text('Date', 50, y);
        doc.text('Description', 100, y);
        doc.text('Ref No', 250, y);
        doc.text('Receipt No', 320, y);
        doc.text('Debit (KES)', 400, y, { align: 'right' });
        doc.text('Credit (KES)', 470, y, { align: 'right' });
        doc.moveTo(50, y + 12).lineTo(550, y + 12).stroke();
        y += 18;
        doc.font('Helvetica').fontSize(8);
      }
      
      doc.text(row.trans_date || '-', 50, y);
      doc.text((row.item || 'Transaction').substring(0, 30), 100, y);
      doc.text((row.reference_no || '-').substring(0, 15), 250, y);
      doc.text((row.receipt_no || '-').substring(0, 15), 320, y);
      doc.text(debit > 0 ? debit.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '-', 400, y, { align: 'right' });
      doc.text(credit > 0 ? credit.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '-', 470, y, { align: 'right' });
      y += 15;
    }
    
    y += 5;
    doc.font('Helvetica-Bold');
    doc.text('TOTALS', 100, y);
    doc.text(totalDebit.toLocaleString(undefined, { minimumFractionDigits: 2 }), 400, y, { align: 'right' });
    doc.text(totalCredit.toLocaleString(undefined, { minimumFractionDigits: 2 }), 470, y, { align: 'right' });
    y += 15;
    doc.text('CLOSING BALANCE', 100, y);
    doc.text(runningBalance.toLocaleString(undefined, { minimumFractionDigits: 2 }), 400, y, { align: 'right' });
    
    doc.moveDown();
    doc.fontSize(8).font('Helvetica');
    doc.text('This is a computer-generated statement.', { align: 'center' });
    doc.text(`Generated on: ${new Date().toLocaleString()}`, { align: 'center' });
    doc.end();
    
  } catch (error) {
    console.error('   ❌ Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// LOCAL ENDPOINT: WITHDRAWABLE DEPOSIT STATEMENT PDF
// ============================================
app.post('/api/v1/withdrawable-statement-direct', async (req, res) => {
  const { accountNo, startDate, endDate } = req.body;
  console.log(`\n📄 [LOCAL] Generating Withdrawable Statement for: ${accountNo}`);
  
  try {
    const headerResult = await dbPool.query("SELECT header_name FROM pb_header LIMIT 1");
    const organisationName = headerResult.rows[0]?.header_name || 'METROPOLITAN HOSPITAL SACCO LTD';
    
    const accountResult = await dbPool.query(
      `SELECT holders_name, acc_no, tel1, postal_code, postal_address, id_no, email_add
       FROM pb_wdeposit_register WHERE acc_no = $1`,
      [accountNo]
    );
    
    if (accountResult.rows.length === 0) {
      return res.status(404).json({ error: 'Account not found' });
    }
    const account = accountResult.rows[0];
    
    const openingResult = await dbPool.query(
      `SELECT COALESCE(SUM(credit - debit), 0) as opening_balance
       FROM ac_wdeposit_payable 
       WHERE account_no = $1 AND date::date < $2::date`,
      [accountNo, startDate]
    );
    const openingBalance = parseFloat(openingResult.rows[0]?.opening_balance || 0);
    
    const transResult = await dbPool.query(
      `SELECT TO_CHAR(date, 'DD/MM/YYYY') as trans_date,
              initcap(item) as item, reference_no, receipt_no,
              COALESCE(debit, 0) as debit, COALESCE(credit, 0) as credit
       FROM ac_wdeposit_payable 
       WHERE account_no = $1 
         AND date::date BETWEEN $2::date AND $3::date
         AND (debit <> 0 OR credit <> 0)
       ORDER BY date ASC`,
      [accountNo, startDate, endDate]
    );
    
    const interestResult = await dbPool.query(
      `SELECT COALESCE(SUM(credit - debit), 0) as period_interest
       FROM ac_wdeposit_payable 
       WHERE account_no = $1 
         AND date::date BETWEEN $2::date AND $3::date
         AND reference_no ILIKE 'WINT%'`,
      [accountNo, startDate, endDate]
    );
    
    const periodInterest = parseFloat(interestResult.rows[0]?.period_interest || 0);
    
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const chunks = [];
    
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => {
      const pdfBuffer = Buffer.concat(chunks);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=withdrawable-statement-${accountNo}.pdf`);
      res.send(pdfBuffer);
    });
    
    doc.fontSize(16).font('Helvetica-Bold').text(organisationName, { align: 'center' });
    doc.moveDown();
    doc.fontSize(14).font('Helvetica-Bold').text('WITHDRAWABLE DEPOSITS STATEMENT', { align: 'center' });
    doc.moveDown();
    
    doc.fontSize(10).font('Helvetica-Bold').text('ACCOUNT INFORMATION');
    doc.font('Helvetica');
    doc.text(`Name: ${account.holders_name || 'N/A'}`);
    doc.text(`Account No: ${account.acc_no || accountNo}`);
    doc.text(`ID No: ${account.id_no || 'N/A'}`);
    doc.text(`Phone: ${account.tel1 || 'N/A'}`);
    doc.text(`Email: ${account.email_add || 'N/A'}`);
    doc.moveDown();
    
    doc.font('Helvetica-Bold').text(`STATEMENT PERIOD: ${new Date(startDate).toLocaleDateString('en-GB')} TO ${new Date(endDate).toLocaleDateString('en-GB')}`);
    doc.text(`Print Date: ${new Date().toLocaleDateString('en-GB')}`);
    doc.moveDown();
    
    doc.font('Helvetica-Bold').text('TRANSACTION HISTORY', { underline: true });
    doc.moveDown(0.5);
    
    let runningBalance = openingBalance;
    let totalDebit = 0, totalCredit = 0;
    let y = doc.y + 10;
    
    doc.font('Helvetica-Bold').fontSize(8);
    doc.text('Date', 50, y);
    doc.text('Narration', 100, y);
    doc.text('Ref No', 250, y);
    doc.text('Receipt No', 320, y);
    doc.text('Withdrawn (KES)', 400, y, { align: 'right' });
    doc.text('Deposited (KES)', 470, y, { align: 'right' });
    doc.moveTo(50, y + 12).lineTo(550, y + 12).stroke();
    y += 18;
    doc.font('Helvetica').fontSize(8);
    
    doc.text('-', 50, y);
    doc.text('BAL/BF', 100, y);
    doc.text('-', 250, y);
    doc.text('-', 320, y);
    doc.text(openingBalance.toLocaleString(undefined, { minimumFractionDigits: 2 }), 400, y, { align: 'right' });
    doc.text('-', 470, y, { align: 'right' });
    y += 15;
    
    for (const row of transResult.rows) {
      const debit = parseFloat(row.debit) || 0;
      const credit = parseFloat(row.credit) || 0;
      runningBalance = runningBalance + credit - debit;
      totalDebit += debit;
      totalCredit += credit;
      
      if (y > 700) {
        doc.addPage();
        y = 50;
        doc.font('Helvetica-Bold').fontSize(8);
        doc.text('Date', 50, y);
        doc.text('Narration', 100, y);
        doc.text('Ref No', 250, y);
        doc.text('Receipt No', 320, y);
        doc.text('Withdrawn (KES)', 400, y, { align: 'right' });
        doc.text('Deposited (KES)', 470, y, { align: 'right' });
        doc.moveTo(50, y + 12).lineTo(550, y + 12).stroke();
        y += 18;
        doc.font('Helvetica').fontSize(8);
      }
      
      doc.text(row.trans_date || '-', 50, y);
      doc.text((row.item || 'Transaction').substring(0, 35), 100, y);
      doc.text((row.reference_no || '-').substring(0, 15), 250, y);
      doc.text((row.receipt_no || '-').substring(0, 15), 320, y);
      doc.text(debit > 0 ? debit.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '-', 400, y, { align: 'right' });
      doc.text(credit > 0 ? credit.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '-', 470, y, { align: 'right' });
      y += 15;
    }
    
    y += 5;
    doc.font('Helvetica-Bold');
    doc.text('TOTALS', 100, y);
    doc.text(totalDebit.toLocaleString(undefined, { minimumFractionDigits: 2 }), 400, y, { align: 'right' });
    doc.text(totalCredit.toLocaleString(undefined, { minimumFractionDigits: 2 }), 470, y, { align: 'right' });
    y += 15;
    doc.text('CLOSING BALANCE', 100, y);
    doc.text(runningBalance.toLocaleString(undefined, { minimumFractionDigits: 2 }), 400, y, { align: 'right' });
    y += 20;
    
    if (periodInterest !== 0) {
      doc.font('Helvetica-Bold').text('INTEREST INFORMATION', { underline: true });
      doc.font('Helvetica');
      doc.text(`INTEREST FOR THE PERIOD: KES ${periodInterest.toLocaleString(undefined, { minimumFractionDigits: 2 })}`);
    }
    
    doc.moveDown();
    doc.fontSize(8).font('Helvetica');
    doc.text('This is a computer-generated statement.', { align: 'center' });
    doc.text(`Generated on: ${new Date().toLocaleString()}`, { align: 'center' });
    doc.end();
    
  } catch (error) {
    console.error('   ❌ Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Start the server
// ============================================
app.listen(port, '0.0.0.0', () => {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🚀 PROXY SERVER RUNNING`);
  console.log(`${'='.repeat(60)}`);
  console.log(`📍 URL: http://localhost:${port}`);
  console.log(`\n✅ FORWARDING to live server: ${LIVE_API_BASE}`);
  console.log(`   All /api/v1/* requests will be forwarded EXCEPT:`);
  console.log(`\n✅ LOCAL ENDPOINTS (handled by this proxy):`);
  console.log(`   POST   /api/v1/auth/change-password (Direct DB Update)`);
  console.log(`   POST   /api/v1/loan-statement-direct`);
  console.log(`   POST   /api/v1/withdrawable-statement-direct`);
  console.log(`\n📝 Your React components keep their API calls as is:`);
  console.log(`   OTP sending → forwarded to live server (works!)`);
  console.log(`   Password change → handled locally (updates database directly)`);
  console.log(`   PDF generation → handled locally`);
  console.log(`${'='.repeat(60)}\n`);
});