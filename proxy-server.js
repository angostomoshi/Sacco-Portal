const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { Pool } = require('pg');
const PDFDocument = require('pdfkit');
const bcrypt = require('bcrypt');

const app = express();
const port = process.env.PORT || 3023; // Use environment variable for port

// CORS configuration
app.use(cors({
  origin: true,
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
  host: process.env.DB_HOST || '192.168.4.10',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'sacco',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'legacy#007',
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

const LIVE_API_BASE = process.env.LIVE_API_BASE || 'http://192.168.4.6:3023/api/v1';

// ============================================
// LOCAL ENDPOINTS (including change-password)
// ============================================
const LOCAL_ENDPOINTS = [
  '/loan-statement-direct', 
  '/withdrawable-statement-direct',
  '/loan/apply',
  '/instant/',
  '/auth/change-password'  // ← THIS IS THE KEY FIX
];

// ============================================
// FORWARDING MIDDLEWARE
// ============================================
app.use('/api/v1', async (req, res, next) => {
  console.log(`\n🔍 Checking path: ${req.path}`);
  
  // Check if this is a local endpoint
  const isLocalEndpoint = LOCAL_ENDPOINTS.some(endpoint => {
    if (endpoint === '/instant/') {
      return req.path.startsWith('/instant/');
    }
    return req.path === endpoint;
  });
  
  console.log(`   Is local endpoint? ${isLocalEndpoint}`);
  
  if (isLocalEndpoint) {
    console.log(`   ✅ Handling locally`);
    return next();
  }
  
  // Forward to live server
  console.log(`   🔄 FORWARDING to live server: ${req.path}`);
  
  try {
    const liveUrl = `${LIVE_API_BASE}${req.path}`;
    console.log(`   🔄 FORWARDING to: ${liveUrl}`);
    
    // Build forwarded headers - include cookies and all original headers
    const forwardHeaders = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };
    
    // Forward Authorization token if present
    if (req.headers.authorization) {
      forwardHeaders['Authorization'] = req.headers.authorization;
    }
    
    // Forward cookies (important for Spring Security CSRF/session)
    if (req.headers.cookie) {
      forwardHeaders['Cookie'] = req.headers.cookie;
    }
    
    // Forward X-XSRF-TOKEN if present (Spring CSRF token)
    if (req.headers['x-xsrf-token']) {
      forwardHeaders['X-XSRF-TOKEN'] = req.headers['x-xsrf-token'];
    }
    
    const response = await axios({
      method: req.method,
      url: liveUrl,
      data: req.body,
      params: req.query,
      headers: forwardHeaders,
      timeout: 30000,
      withCredentials: true
    });
    
    console.log(`   ✅ Response: ${response.status}`);
    
    // Forward any Set-Cookie headers from the live server back to the client
    if (response.headers['set-cookie']) {
      res.setHeader('Set-Cookie', response.headers['set-cookie']);
    }
    
    res.status(response.status).json(response.data);
  } catch (error) {
    console.error(`   ❌ Forwarding error:`, error.message);
    if (error.response) {
      console.log(`   📝 Live server responded with: ${error.response.status}`);
      console.log(`   📝 Response body:`, JSON.stringify(error.response.data));
      res.status(error.response.status).json(error.response.data);
    } else {
      return res.status(500).json({ error: 'Failed to connect to live server', message: error.message });
    }
  }
});

// ============================================
// LOCAL ENDPOINT: CHANGE PASSWORD
// ============================================
app.post('/api/v1/auth/change-password', async (req, res) => {
  console.log('\n🔐 [LOCAL] Password change request:');
  console.log('   Body:', req.body);
  
  const { memberNo, otp, newPassword, confirmPassword } = req.body;
  
  // Validate input
  if (!memberNo || !otp || !newPassword) {
    return res.status(400).json({ 
      status: 1, 
      message: 'Missing required fields: memberNo, otp, or newPassword' 
    });
  }
  
  if (newPassword !== confirmPassword) {
    return res.status(400).json({ 
      status: 1, 
      message: 'Passwords do not match' 
    });
  }
  
  try {
    // First, verify the OTP (you need to implement OTP storage/verification)
    // For now, we'll skip OTP verification or you can implement it
    
    // Hash the new password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);
    
    // Update password in your local database
    // Note: Adjust the table name and column names based on your actual database schema
    const updateResult = await dbPool.query(
      `UPDATE pb_share_register 
       SET password = $1, 
           updated_at = CURRENT_TIMESTAMP 
       WHERE acc_no = $2 
       RETURNING acc_no, holders_name`,
      [hashedPassword, memberNo]
    );
    
    if (updateResult.rows.length === 0) {
      return res.status(404).json({ 
        status: 1, 
        message: 'Member not found' 
      });
    }
    
    console.log(`   ✅ Password updated successfully for member: ${memberNo}`);
    
    // Return success response (matching the expected format)
    res.status(200).json({
      status: 0,  // 0 typically means success in your API
      message: 'Password changed successfully',
      memberNo: memberNo,
      token: null // Or generate a new token if needed
    });
    
  } catch (error) {
    console.error('   ❌ Error updating password:', error.message);
    res.status(500).json({ 
      status: 1, 
      message: 'Failed to change password: ' + error.message 
    });
  }
});

// ============================================
// LOCAL ENDPOINT: GET INSTANT LOANS
// ============================================
app.get('/api/v1/instant/:memberNo', async (req, res) => {
  const { memberNo } = req.params;
  console.log(`\n⚡ [LOCAL] Fetching instant loans for: ${memberNo}`);
  
  try {
    const columnsCheck = await dbPool.query(
      `SELECT column_name 
       FROM information_schema.columns 
       WHERE table_name = 'pb_saccoloan' 
       AND column_name IN ('status', 'loan_status')
       ORDER BY column_name`
    );
    
    const availableColumns = columnsCheck.rows.map(row => row.column_name);
    
    let query = `
      SELECT 
        loan_no as "loanNo",
        lpurpose as "loanPurpose", 
        cdate as "startDate",
        edate as "endDate",
        period,
        amount,
        amount as "outStanding"
    `;
    
    if (availableColumns.includes('status')) {
      query += `, status`;
    } else if (availableColumns.includes('loan_status')) {
      query += `, loan_status as "status"`;
    }
    
    query += ` FROM pb_saccoloan WHERE mem_no = $1 ORDER BY cdate DESC`;
    
    const loans = await dbPool.query(query, [memberNo]);
    
    res.status(200).json({
      success: true,
      data: loans.rows,
      source: "local",
      count: loans.rows.length
    });
  } catch (dbError) {
    console.error(`   ❌ Database error:`, dbError.message);
    res.status(500).json({ 
      success: false, 
      message: "Failed to fetch instant loans",
      error: dbError.message 
    });
  }
});

// ============================================
// LOCAL ENDPOINT: SUBMIT LOAN APPLICATION
// ============================================
app.post('/api/v1/loan/apply', async (req, res) => {
  console.log('\n📝 New Loan Application Received:');
  console.log(JSON.stringify(req.body, null, 2));
  
  const {
    memberNo,
    memberName,
    loanType,
    loanAmount,
    periodMonths,
    interestRate,
    monthlyDeduction,
    totalAmount,
    applicationDate
  } = req.body;
  
  try {
    const memberCheck = await dbPool.query(
      `SELECT acc_no, holders_name, id_no, email_add, postal_code, tel1 
       FROM pb_share_register WHERE acc_no = $1`,
      [memberNo]
    );
    
    if (memberCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Member not found' });
    }
    
    const member = memberCheck.rows[0];
    const year = new Date().getFullYear();
    const loanNoResult = await dbPool.query(
      `SELECT COALESCE(MAX(CAST(SPLIT_PART(loan_no, '/', 1) AS INTEGER)), 0) + 1 as loan_seq 
       FROM pb_saccoloan WHERE loan_no LIKE '%/${year}'`
    );
    const loanSeq = loanNoResult.rows[0].loan_seq;
    const loanNumber = `${loanSeq}/${year}`;
    
    const startDate = new Date(applicationDate || new Date());
    const endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + parseInt(periodMonths));
    
    const formattedStartDate = startDate.toISOString().split('T')[0];
    const formattedEndDate = endDate.toISOString().split('T')[0];
    
    const columnsCheck = await dbPool.query(
      `SELECT column_name 
       FROM information_schema.columns 
       WHERE table_name = 'pb_saccoloan'`
    );
    
    const existingColumns = columnsCheck.rows.map(row => row.column_name);
    
    const insertFields = [
      'mem_no', 'member_name', 'loan_no', 'pno', 'wstation', 'employer', 
      'poastal_code', 'categ', 'email_address', 'security1', 'id_no', 
      'lpurpose', 'pymt_terms', 'cdate', 'edate', 'amount', 'period', 
      'repayment', 'interest', 'premium', 'user_name', 'input_date', 'total'
    ];
    
    const insertValues = [
      memberNo, memberName, loanNumber, '', 'METROPOLITAN', 'Metropolitan',
      member.postal_code || '', 'METROPOLITAN STAFF', member.email_add || '', 
      'Shares', member.id_no || '', loanType, 'Monthly', formattedStartDate,
      formattedEndDate, parseFloat(loanAmount), parseInt(periodMonths),
      parseFloat(monthlyDeduction), parseFloat(interestRate), 
      parseFloat(totalAmount), 'web_user', new Date(), parseFloat(totalAmount)
    ];
    
    if (existingColumns.includes('status')) {
      insertFields.push('status');
      insertValues.push('Pending');
    }
    
    const placeholders = insertValues.map((_, i) => `$${i + 1}`).join(', ');
    const insertQuery = `INSERT INTO pb_saccoloan (${insertFields.join(', ')}) VALUES (${placeholders})`;
    
    await dbPool.query(insertQuery, insertValues);
    
    res.status(200).json({
      success: true,
      message: 'Loan application submitted successfully',
      loanNumber: loanNumber,
      data: {
        memberNo,
        loanNumber,
        amount: loanAmount,
        period: periodMonths,
        monthlyDeduction,
        totalAmount
      }
    });
    
  } catch (error) {
    console.error(`   ❌ Error:`, error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to submit loan application: ' + error.message
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
  console.log(`🚀 PROXY SERVER RUNNING ON PORT ${port}`);
  console.log(`${'='.repeat(60)}`);
  console.log(`📍 URL: http://localhost:${port}`);
  console.log(`\n✅ LOCAL ENDPOINTS (handled by this proxy):`);
  console.log(`   POST   /api/v1/auth/change-password - NOW HANDLED LOCALLY ✅`);
  console.log(`   POST   /api/v1/loan/apply - Submit loan application`);
  console.log(`   GET    /api/v1/instant/:memberNo - Fetch member's loans`);
  console.log(`   POST   /api/v1/loan-statement-direct`);
  console.log(`   POST   /api/v1/withdrawable-statement-direct`);
  console.log(`\n🔄 FORWARDED ENDPOINTS (handled by live server):`);
  console.log(`   POST   /api/v1/auth/authenticate - Login handled by live`);
  console.log(`   All other /api/v1/* requests will be forwarded to live server`);
  console.log(`${'='.repeat(60)}\n`);
});