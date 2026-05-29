// proxy-server.js - With NEW JSON endpoint for table display
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

// Test database connection
dbPool.connect((err, client, release) => {
  if (err) {
    console.error('❌ Database connection failed:', err.message);
  } else {
    console.log('✅ Database connected successfully');
    release();
  }
});

// ============================================
// NEW API: LOAN STATEMENT JSON FOR TABLE DISPLAY
// Based on the Java StatementAccPdf logic
// ============================================
app.post('/api/v1/loan-statement-table', async (req, res) => {
  const { loanNo, memberNo, startDate, endDate } = req.body;
  
  console.log(`\n📊 NEW API - Generating JSON for Loan: ${loanNo}, Member: ${memberNo}`);
  console.log(`   Period: ${startDate} to ${endDate}`);
  
  try {
    // 1. Fetch header/organization info (like Java's pb_header)
    const headerResult = await dbPool.query(
      "SELECT header_name FROM pb_header LIMIT 1"
    );
    const organisationName = headerResult.rows[0]?.header_name || 'METROPOLITAN HOSPITAL SACCO LTD';
    
    // 2. Fetch loan details (like Java's pb_saccoloan query)
    const loanResult = await dbPool.query(
      `SELECT 
        lpurpose as purpose, 
        pymt_terms as terms,
        amount, 
        cdate as start_date, 
        edate as end_date, 
        period, 
        repayment,
        interest,
        premium
       FROM pb_saccoloan 
       WHERE loan_no = $1`,
      [loanNo]
    );
    
    if (loanResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Loan not found' });
    }
    const loan = loanResult.rows[0];
    
    // 3. Fetch member details (like Java's pb_share_register query)
    const memberResult = await dbPool.query(
      `SELECT 
        acc_no,
        holders_name, 
        postal_code || ' ' || postal_address as address,
        tel1, 
        email_add, 
        id_no
       FROM pb_share_register 
       WHERE acc_no = $1`,
      [memberNo]
    );
    
    if (memberResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Member not found' });
    }
    const member = memberResult.rows[0];
    
    // 4. Get opening balance (transactions before start date) - like Java's rsetTotals2
    const openingResult = await dbPool.query(
      `SELECT COALESCE(SUM(balance - credit_bal), 0) as opening_balance
       FROM ac_debtors 
       WHERE account_no = $1 
         AND invoice_no = $2 
         AND date::date < $3::date`,
      [memberNo, loanNo, startDate]
    );
    const openingBalance = parseFloat(openingResult.rows[0]?.opening_balance || 0);
    
    // 5. Fetch transactions (like Java's rset1 query)
    const transResult = await dbPool.query(
      `SELECT 
        TO_CHAR(DATE, 'DD/MM/YYYY') as trans_date,
        DATE as full_date,
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
       ORDER BY date ASC`,
      [memberNo, loanNo, startDate, endDate]
    );
    
    console.log(`   Found ${transResult.rows.length} transactions`);
    
    // 6. Build transaction list with running balance (like Java's while(rset1.next()) loop)
    let runningBalance = openingBalance;
    let totalDebit = 0;
    let totalCredit = 0;
    const transactions = [];
    
    // Add opening balance as first entry (like Java's "BAL/BF" row)
    transactions.push({
      date: '-',
      description: 'OPENING BALANCE',
      receiptNo: '-',
      referenceNo: '-',
      debit: 0,
      credit: 0,
      balance: openingBalance,
      isOpening: true
    });
    
    for (const row of transResult.rows) {
      const debit = parseFloat(row.debit) || 0;
      const credit = parseFloat(row.credit) || 0;
      runningBalance = runningBalance + debit - credit;
      totalDebit += debit;
      totalCredit += credit;
      
      // Combine receipt_no and cheque_no like Java does: "receipt_no||' '||cheque_no"
      const docNo = [row.receipt_no, row.cheque_no].filter(Boolean).join(' ') || '-';
      
      transactions.push({
        date: row.trans_date,
        description: row.item || row.reason || 'Transaction',
        receiptNo: row.receipt_no || '',
        chequeNo: row.cheque_no || '',
        docNo: docNo,
        referenceNo: row.reference_no || '',
        debit: debit,
        credit: credit,
        balance: runningBalance,
        dispatchNo: row.dispatch_no || '',
        isOpening: false
      });
    }
    
    // 7. Build response object matching Java report structure
    const responseData = {
      success: true,
      generatedAt: new Date().toISOString(),
      organisation: {
        name: organisationName,
        // These would come from pb_hospitalprofile in Java
        postalCode: '00100',
        boxNo: 'P.O. Box 12345',
        town: 'Nairobi',
        telNo: '020-1234567',
        email: 'info@metro-sacco.com'
      },
      member: {
        accNo: member.acc_no,
        name: member.holders_name || 'N/A',
        address: member.address || 'N/A',
        phone: member.tel1 || 'N/A',
        email: member.email_add || 'N/A',
        idNo: member.id_no || 'N/A'
      },
      loan: {
        loanNo: loanNo,
        type: loan.purpose || 'N/A',
        terms: loan.terms || 'N/A',
        amount: parseFloat(loan.amount || 0),
        startDate: loan.start_date,
        endDate: loan.end_date,
        period: parseFloat(loan.period || 0),
        repayment: parseFloat(loan.repayment || 0),
        interestRate: parseFloat(loan.interest || 0),
        premium: parseFloat(loan.premium || 0)
      },
      statement: {
        period: {
          from: startDate,
          to: endDate
        },
        openingBalance: openingBalance,
        closingBalance: runningBalance,
        transactions: transactions,
        summary: {
          totalDebit: totalDebit,
          totalCredit: totalCredit,
          transactionCount: transResult.rows.length,
          netChange: totalDebit - totalCredit
        }
      }
    };
    
    console.log(`   ✅ JSON response ready - Closing balance: ${runningBalance}`);
    res.json(responseData);
    
  } catch (error) {
    console.error('   ❌ Error:', error.message);
    console.error('   Stack:', error.stack);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      details: error.stack
    });
  }
});

// ============================================
// ORIGINAL PDF ENDPOINT (kept for download functionality)
// ============================================
app.post('/api/v1/loan-statement-direct', async (req, res) => {
  const { loanNo, memberNo, startDate, endDate } = req.body;
  
  console.log(`\n📄 Generating PDF for Loan: ${loanNo}, Member: ${memberNo}`);
  
  try {
    const loanResult = await dbPool.query(
      'SELECT lpurpose as purpose, amount, cdate as start_date, edate as end_date, period, interest FROM pb_saccoloan WHERE loan_no = $1',
      [loanNo]
    );
    
    const memberResult = await dbPool.query(
      'SELECT holders_name, id_no, tel1, email_add FROM pb_share_register WHERE acc_no = $1',
      [memberNo]
    );
    
    const transResult = await dbPool.query(
      `SELECT TO_CHAR(DATE, 'DD/MM/YYYY') as trans_date, 
              initcap(item) as item, reference_no, 
              COALESCE(balance, 0) as debit, 
              COALESCE(credit_bal, 0) as credit
       FROM ac_debtors 
       WHERE account_no = $1 AND invoice_no = $2
       AND date::date BETWEEN $3::date AND $4::date
       ORDER BY date`,
      [memberNo, loanNo, startDate, endDate]
    );
    
    const doc = new PDFDocument({ margin: 50 });
    const chunks = [];
    
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => {
      const pdfBuffer = Buffer.concat(chunks);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=loan-statement-${loanNo}.pdf`);
      res.send(pdfBuffer);
    });
    
    doc.fontSize(18).font('Helvetica-Bold').text('LOAN STATEMENT', { align: 'center' });
    doc.moveDown();
    
    if (memberResult.rows[0]) {
      const m = memberResult.rows[0];
      doc.fontSize(10);
      doc.font('Helvetica-Bold').text('MEMBER INFORMATION');
      doc.font('Helvetica');
      doc.text(`Name: ${m.holders_name || 'N/A'}`);
      doc.text(`Member No: ${memberNo}`);
      doc.text(`ID No: ${m.id_no || 'N/A'}`);
      doc.text(`Phone: ${m.tel1 || 'N/A'}`);
      doc.text(`Email: ${m.email_add || 'N/A'}`);
      doc.moveDown();
    }
    
    if (loanResult.rows[0]) {
      const l = loanResult.rows[0];
      doc.font('Helvetica-Bold').text('LOAN INFORMATION');
      doc.font('Helvetica');
      doc.text(`Loan Number: ${loanNo}`);
      doc.text(`Purpose: ${l.purpose || 'N/A'}`);
      doc.text(`Amount: KES ${parseFloat(l.amount || 0).toLocaleString()}`);
      doc.text(`Interest Rate: ${l.interest || 0}%`);
      doc.text(`Period: ${l.period || 0} months`);
      doc.text(`Start Date: ${l.start_date || 'N/A'}`);
      doc.text(`End Date: ${l.end_date || 'N/A'}`);
      doc.moveDown();
    }
    
    doc.font('Helvetica-Bold').text('TRANSACTION HISTORY', { underline: true });
    doc.moveDown(0.5);
    
    let runningBalance = 0;
    doc.font('Helvetica').fontSize(8);
    
    transResult.rows.forEach((row, idx) => {
      const debit = parseFloat(row.debit) || 0;
      const credit = parseFloat(row.credit) || 0;
      runningBalance = runningBalance + debit - credit;
      doc.text(`${row.trans_date} | ${row.item || 'Transaction'} | Debit: ${debit.toLocaleString()} | Credit: ${credit.toLocaleString()} | Balance: ${runningBalance.toLocaleString()}`);
      if (idx < transResult.rows.length - 1) doc.moveDown(0.3);
    });
    
    doc.moveDown();
    doc.font('Helvetica-Bold').text(`Closing Balance: KES ${runningBalance.toLocaleString(undefined, {minimumFractionDigits: 2})}`);
    doc.end();
    
  } catch (error) {
    console.error('   ❌ Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// HEALTH CHECK ENDPOINTS
// ============================================
app.get('/api/test-db', async (req, res) => {
  try {
    const result = await dbPool.query('SELECT NOW() as current_time');
    res.json({ success: true, message: 'Database connected', time: result.rows[0].current_time });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', server: 'proxy-server', port: port, timestamp: new Date().toISOString() });
});

// ============================================
// PROXY OTHER API REQUESTS TO LIVE SERVER
// ============================================
app.use('/api/v1', async (req, res, next) => {
  // Skip our custom endpoints
  if (req.path === '/loan-statement-direct' || req.path === '/loan-statement-table') {
    return next();
  }
  
  try {
    const liveUrl = `https://memberportal.metro-sacco.com${req.originalUrl}`;
    console.log(`   → Proxying to: ${liveUrl}`);
    const response = await axios({ method: req.method, url: liveUrl, data: req.body, headers: { 'Content-Type': 'application/json' }, timeout: 30000 });
    res.status(response.status).json(response.data);
  } catch (error) {
    console.error('   ✗ Proxy error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.use('/api', async (req, res) => {
  try {
    const liveUrl = `https://memberportal.metro-sacco.com${req.originalUrl}`;
    const response = await axios({ method: req.method, url: liveUrl, data: req.body, headers: { 'Content-Type': 'application/json' } });
    res.status(response.status).json(response.data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Start the server
app.listen(port, '0.0.0.0', () => {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`🚀 PROXY SERVER RUNNING`);
  console.log(`${'='.repeat(50)}`);
  console.log(`📍 URL: http://localhost:${port}`);
  console.log(`\n🆕 NEW API - Returns JSON for table display:`);
  console.log(`   POST /api/v1/loan-statement-table`);
  console.log(`\n📄 ORIGINAL API - Returns PDF:`);
  console.log(`   POST /api/v1/loan-statement-direct`);
  console.log(`\n🔍 TEST ENDPOINTS:`);
  console.log(`   GET  /api/test-db`);
  console.log(`   GET  /api/health`);
  console.log(`${'='.repeat(50)}\n`);
});