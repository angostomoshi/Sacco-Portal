// proxy-server.js - Updated with direct database endpoint
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { Pool } = require('pg');
const PDFDocument = require('pdfkit');

const app = express();
const port = 3023;

app.use(cors());
app.use(express.json());

// Log all requests
app.use((req, res, next) => {
  console.log(`📡 ${req.method} ${req.url}`);
  next();
});

// ============================================
// DATABASE CONNECTION
// ============================================
const dbPool = new Pool({
  host: '192.168.4.10',
  port: 5432,
  database: 'sacco',
  user: 'postgres',
  password: 'legacy#007',
  ssl: false,
  connectionTimeoutMillis: 10000,
});

// Test database connection on startup
dbPool.connect((err, client, release) => {
  if (err) {
    console.error('❌ Database connection failed:', err.message);
    console.error('   Please check if you can reach 192.168.4.10:5432');
  } else {
    console.log('✅ Database connected successfully');
    release();
  }
});

// ============================================
// LOAN STATEMENT DIRECT DATABASE ENDPOINT
// ============================================
app.post('/api/v1/loan-statement-direct', async (req, res) => {
  const { loanNo, memberNo, startDate, endDate } = req.body;
  
  console.log(`\n📄 GENERATING LOAN STATEMENT (Direct DB)`);
  console.log(`   Loan Number: ${loanNo}`);
  console.log(`   Member Number: ${memberNo}`);
  console.log(`   Period: ${startDate} to ${endDate}`);
  
  try {
    // Fetch loan details from pb_saccoloan
    const loanQuery = `
      SELECT 
        lpurpose as purpose,
        amount,
        cdate as start_date,
        edate as end_date,
        period,
        repayment,
        interest,
        premium
      FROM pb_saccoloan 
      WHERE loan_no = $1
    `;
    const loanResult = await dbPool.query(loanQuery, [loanNo]);
    
    // Fetch member details from pb_share_register
    const memberQuery = `
      SELECT 
        holders_name,
        id_no,
        tel1,
        email_add,
        postal_address
      FROM pb_share_register 
      WHERE acc_no = $1
    `;
    const memberResult = await dbPool.query(memberQuery, [memberNo]);
    
    // Fetch transactions from ac_debtors
    const transQuery = `
      SELECT 
        TO_CHAR(DATE, 'DD/MM/YYYY') as trans_date,
        receipt_no,
        cheque_no,
        initcap(item) as item,
        initcap(reason) as reason,
        reference_no,
        COALESCE(balance, 0) as debit,
        COALESCE(credit_bal, 0) as credit,
        dispatch_no
      FROM ac_debtors 
      WHERE account_no = $1 
        AND invoice_no = $2
        AND date::date BETWEEN $3::date AND $4::date
        AND (balance <> 0 OR credit_bal <> 0)
      ORDER BY date
    `;
    const transResult = await dbPool.query(transQuery, [memberNo, loanNo, startDate, endDate]);
    
    // Calculate running balance
    let runningBalance = 0;
    const transactions = [];
    
    // Get opening balance (transactions before start date)
    const openingQuery = `
      SELECT COALESCE(SUM(balance - credit_bal), 0) as opening_balance
      FROM ac_debtors 
      WHERE account_no = $1 
        AND invoice_no = $2 
        AND date::date < $3::date
    `;
    const openingResult = await dbPool.query(openingQuery, [memberNo, loanNo, startDate]);
    let openingBalance = parseFloat(openingResult.rows[0]?.opening_balance) || 0;
    runningBalance = openingBalance;
    
    console.log(`   Opening Balance: ${openingBalance}`);
    console.log(`   Transactions found: ${transResult.rows.length}`);
    
    // Generate PDF
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const chunks = [];
    
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => {
      const pdfBuffer = Buffer.concat(chunks);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=loan-statement-${loanNo}.pdf`);
      res.send(pdfBuffer);
    });
    
    // PDF Header
    doc.fontSize(18).font('Helvetica-Bold').text('LOAN STATEMENT', { align: 'center' });
    doc.moveDown();
    
    // Member Information
    if (memberResult.rows[0]) {
      const member = memberResult.rows[0];
      doc.fontSize(10).font('Helvetica-Bold').text('MEMBER INFORMATION');
      doc.font('Helvetica');
      doc.text(`Name: ${member.holders_name || 'N/A'}`);
      doc.text(`Member No: ${memberNo}`);
      doc.text(`ID No: ${member.id_no || 'N/A'}`);
      doc.text(`Phone: ${member.tel1 || 'N/A'}`);
      doc.text(`Email: ${member.email_add || 'N/A'}`);
      doc.moveDown();
    }
    
    // Loan Information
    if (loanResult.rows[0]) {
      const loan = loanResult.rows[0];
      doc.font('Helvetica-Bold').text('LOAN INFORMATION');
      doc.font('Helvetica');
      doc.text(`Loan Number: ${loanNo}`);
      doc.text(`Purpose: ${loan.purpose || 'N/A'}`);
      doc.text(`Amount: KES ${parseFloat(loan.amount || 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`);
      doc.text(`Interest Rate: ${loan.interest || 0}%`);
      doc.text(`Period: ${loan.period || 0} months`);
      doc.text(`Start Date: ${loan.start_date || 'N/A'}`);
      doc.text(`End Date: ${loan.end_date || 'N/A'}`);
      doc.moveDown();
    }
    
    // Transaction Table Header
    doc.font('Helvetica-Bold').text('TRANSACTION HISTORY', { underline: true });
    doc.moveDown(0.5);
    
    // Table headers
    let yPos = doc.y;
    const col1 = 50;
    const col2 = 120;
    const col3 = 220;
    const col4 = 320;
    const col5 = 420;
    const col6 = 500;
    
    doc.fontSize(8);
    doc.text('Date', col1, yPos);
    doc.text('Description', col2, yPos);
    doc.text('Ref No', col3, yPos);
    doc.text('Debit (KES)', col4, yPos, { width: 80, align: 'right' });
    doc.text('Credit (KES)', col5, yPos, { width: 80, align: 'right' });
    doc.text('Balance (KES)', col6, yPos, { width: 80, align: 'right' });
    
    // Draw line
    doc.moveTo(50, yPos + 5).lineTo(550, yPos + 5).stroke();
    yPos += 15;
    
    // Opening balance row
    doc.text('BALANCE B/F', col2, yPos);
    doc.text('', col3, yPos);
    doc.text('', col4, yPos);
    doc.text('', col5, yPos);
    doc.text(runningBalance.toLocaleString(undefined, {minimumFractionDigits: 2}), col6, yPos, { width: 80, align: 'right' });
    yPos += 15;
    
    // Transaction rows
    for (const row of transResult.rows) {
      const debit = parseFloat(row.debit) || 0;
      const credit = parseFloat(row.credit) || 0;
      runningBalance = runningBalance + debit - credit;
      
      if (yPos > 750) {
        doc.addPage();
        yPos = 50;
      }
      
      doc.text(row.trans_date || '-', col1, yPos);
      doc.text((row.item || row.reason || 'Transaction').substring(0, 30), col2, yPos);
      doc.text(row.reference_no || '-', col3, yPos);
      doc.text(debit > 0 ? debit.toLocaleString(undefined, {minimumFractionDigits: 2}) : '-', col4, yPos, { width: 80, align: 'right' });
      doc.text(credit > 0 ? credit.toLocaleString(undefined, {minimumFractionDigits: 2}) : '-', col5, yPos, { width: 80, align: 'right' });
      doc.text(runningBalance.toLocaleString(undefined, {minimumFractionDigits: 2}), col6, yPos, { width: 80, align: 'right' });
      yPos += 12;
    }
    
    // Footer
    doc.moveDown(2);
    doc.fontSize(8).text('This is a computer-generated statement. For official use, please visit the Sacco office.', { align: 'center' });
    doc.text(`Generated on: ${new Date().toLocaleString()}`, { align: 'center' });
    
    doc.end();
    
    console.log(`   ✓ PDF generated successfully`);
    console.log(`   Final Balance: ${runningBalance.toLocaleString()}`);
    
  } catch (error) {
    console.error(`   ✗ Error generating statement:`, error.message);
    console.error(`   Details:`, error.stack);
    
    // Send error response
    res.status(500).json({ 
      success: false,
      message: 'Failed to generate loan statement',
      error: error.message 
    });
  }
});

// ============================================
// Proxy all other API requests to live server
// ============================================
app.all('/api/v1/*', async (req, res) => {
  // Skip our custom endpoint
  if (req.path === '/api/v1/loan-statement-direct') {
    return;
  }
  
  try {
    const liveUrl = `https://memberportal.metro-sacco.com${req.originalUrl}`;
    console.log(`   → Forwarding to: ${liveUrl}`);
    
    const authToken = req.headers.authorization;
    const response = await axios({
      method: req.method,
      url: liveUrl,
      data: req.body,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...(authToken && { 'Authorization': authToken })
      },
      timeout: 30000
    });
    
    res.status(response.status).json(response.data);
  } catch (error) {
    console.error('Proxy error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    mode: 'proxy',
    db_connected: true,
    timestamp: new Date().toISOString()
  });
});

// Test database endpoint
app.get('/api/test-db', async (req, res) => {
  try {
    const result = await dbPool.query('SELECT NOW() as current_time');
    res.json({ 
      success: true, 
      message: 'Database connected',
      time: result.rows[0].current_time 
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

app.listen(port, '0.0.0.0', () => {
  console.log(`\n🚀 PROXY SERVER RUNNING on port ${port}`);
  console.log(`📍 http://localhost:${port}`);
  console.log(`\n📄 Loan Statement Endpoint:`);
  console.log(`   POST http://localhost:${port}/api/v1/loan-statement-direct`);
  console.log(`\n🔍 Test Database:`);
  console.log(`   GET http://localhost:${port}/api/test-db`);
  console.log(`\n✅ Make sure you can reach 192.168.4.10:5432`);
});