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
app.use(express.urlencoded({ extended: true }));

// ============================================
// TEST ENDPOINT
// ============================================
app.get('/api/v1/test', (req, res) => {
  res.json({ 
    message: 'Proxy server is working!', 
    time: new Date().toISOString(),
    status: 'running'
  });
});

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
  connectionTimeoutMillis: 30000,
  idleTimeoutMillis: 30000,
  keepAlive: true,
});

// Test database connection
dbPool.connect((err, client, release) => {
  if (err) {
    console.error('❌ Database connection failed:', err.message);
    console.error('   Please check VPN connection to 192.168.4.10');
  } else {
    console.log('✅ Database connected successfully');
    release();
  }
});

const LIVE_API_BASE = 'https://memberportal.metro-sacco.com/api/v1';

// ============================================
// DEBUG: Clear all OTPs for a member
// ============================================
app.delete('/api/v1/debug/clear-otp/:memberNo', async (req, res) => {
  const { memberNo } = req.params;
  
  try {
    const result = await dbPool.query(
      `DELETE FROM integration.user_name_otp WHERE "login name" = $1 RETURNING *`,
      [memberNo]
    );
    
    res.json({
      message: `Cleared ${result.rowCount} OTP(s) for ${memberNo}`,
      deleted_count: result.rowCount
    });
  } catch (error) {
    console.error('Clear OTP error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// DEBUG: Check OTPs for a member
// ============================================
app.get('/api/v1/debug/check-otp/:memberNo', async (req, res) => {
  const { memberNo } = req.params;
  
  try {
    const result = await dbPool.query(
      `SELECT "login name", passkey, "mobile no", "date", id, "created at"
       FROM integration.user_name_otp 
       WHERE "login name" = $1 
       ORDER BY "created at" DESC, "date" DESC`,
      [memberNo]
    );
    
    res.json({
      memberNo: memberNo,
      otps_found: result.rows,
      count: result.rows.length,
      message: "Use the latest OTP from this list"
    });
  } catch (error) {
    console.error('Check OTP error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// LOCAL ENDPOINT: REGISTER/SEND OTP
// ============================================
app.post('/api/v1/registerOtp', async (req, res) => {
  const { memberNo } = req.body;
  
  console.log(`\n📱 [LOCAL] OTP request for: ${memberNo}`);
  
  if (!memberNo || memberNo.trim() === "") {
    return res.status(400).json({ 
      success: false, 
      message: "Enter username" 
    });
  }
  
  try {
    // Check if member exists and get phone number
    const memberCheck = await dbPool.query(
      `SELECT acc_no, holders_name, tel1 FROM pb_share_register WHERE acc_no = $1`,
      [memberNo]
    );
    
    if (memberCheck.rows.length === 0) {
      console.log(`   ❌ Member not found: ${memberNo}`);
      return res.status(404).json({ 
        success: false, 
        message: "Member not found" 
      });
    }
    
    const member = memberCheck.rows[0];
    const phoneNumber = member.tel1;
    
    console.log(`   ✅ Member found: ${member.holders_name}`);
    console.log(`   📞 Phone: ${phoneNumber}`);
    
    // Generate a random 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000);
    console.log(`   🔑 Generated OTP: ${otp}`);
    
    // First, delete any existing OTP for this user
    await dbPool.query(
      `DELETE FROM integration.user_name_otp WHERE "login name" = $1`,
      [memberNo]
    );
    console.log(`   🗑️  Cleared existing OTPs`);
    
    // Insert new OTP with exact column names (using double quotes for spaces)
    const insertResult = await dbPool.query(
      `INSERT INTO integration.user_name_otp ("login name", passkey, "mobile no", "date", "created at") 
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) 
       RETURNING id`,
      [memberNo, otp, phoneNumber]
    );
    
    if (insertResult.rows.length > 0) {
      console.log(`   📝 Inserted new OTP successfully (ID: ${insertResult.rows[0].id})`);
    } else {
      console.log(`   ❌ Failed to insert OTP`);
      return res.status(500).json({ 
        success: false, 
        message: "Failed to save OTP. Please try again." 
      });
    }
    
    console.log(`   💡 OTP for ${memberNo}: ${otp}`);
    
    return res.status(200).json({
      success: true,
      message: `OTP sent successfully to ${phoneNumber || 'your phone'}`,
      otp: otp // Remove this line in production
    });
    
  } catch (error) {
    console.error(`   ❌ Error:`, error.message);
    console.error(`   Stack:`, error.stack);
    return res.status(500).json({ 
      success: false, 
      message: "Failed to generate OTP. Please try again.",
      details: error.message
    });
  }
});

// ============================================
// CHANGE PASSWORD ENDPOINT - Using exact column names with spaces
// ============================================
app.post('/api/v1/auth/change-password', async (req, res) => {
  const { memberNo, otp, newPassword, confirmPassword } = req.body;
  
  console.log(`\n🔐 Password change request for: ${memberNo}`);
  console.log(`   OTP provided: ${otp}`);
  console.log(`   New password length: ${newPassword ? newPassword.length : 0}`);
  
  // Validation
  if (!memberNo || memberNo.trim() === "") {
    console.log(`   ❌ Username missing`);
    return res.status(400).json({ 
      success: false, 
      message: "Enter username" 
    });
  }
  
  if (!otp || otp.trim() === "") {
    console.log(`   ❌ OTP missing`);
    return res.status(400).json({ 
      success: false, 
      message: "Enter OTP" 
    });
  }
  
  if (!newPassword || newPassword.trim() === "") {
    console.log(`   ❌ Password missing`);
    return res.status(400).json({ 
      success: false, 
      message: "Enter New Password" 
    });
  }
  
  if (newPassword !== confirmPassword) {
    console.log(`   ❌ Passwords do not match`);
    return res.status(400).json({ 
      success: false, 
      message: "New Password Does not Match - ReType Please!" 
    });
  }
  
  if (newPassword.length < 4) {
    console.log(`   ❌ Password too short`);
    return res.status(400).json({ 
      success: false, 
      message: "Password must be at least 4 characters" 
    });
  }
  
  let client;
  try {
    client = await dbPool.connect();
    
    // Step 1: Get the latest OTP - Using exact column names with quotes
    console.log(`   🔍 Verifying OTP...`);
    const otpResult = await client.query(
      `SELECT id, "login name", passkey, "date", "created at"
       FROM integration.user_name_otp 
       WHERE "login name" = $1 
       ORDER BY "created at" DESC, "date" DESC
       LIMIT 1`,
      [memberNo]
    );
    
    console.log(`   📝 Query executed, rows returned: ${otpResult.rows.length}`);
    
    if (otpResult.rows.length === 0) {
      console.log(`   ❌ No OTP found for user`);
      return res.status(404).json({ 
        success: false, 
        message: "No OTP found. Please request OTP first." 
      });
    }
    
    const storedRecord = otpResult.rows[0];
    const storedOtp = storedRecord.passkey;
    const providedOtp = parseInt(otp);
    
    console.log(`   📝 Stored OTP record ID: ${storedRecord.id}`);
    console.log(`   📝 Stored OTP: ${storedOtp}`);
    console.log(`   📝 Provided OTP: ${providedOtp}`);
    console.log(`   🕐 Created at: ${storedRecord['created at']}`);
    console.log(`   📅 Date: ${storedRecord.date}`);
    
    if (storedOtp !== providedOtp) {
      console.log(`   ❌ Invalid OTP - Expected: ${storedOtp}, Got: ${providedOtp}`);
      return res.status(401).json({ 
        success: false, 
        message: "Enter Correct Passkey" 
      });
    }
    
    console.log(`   ✅ OTP verified successfully`);
    
    // Step 2: Find the correct password column in pb_share_register
    const passwordColumnCheck = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'pb_share_register'
      AND (column_name ILIKE '%pass%' OR column_name ILIKE '%pwd%' OR column_name = 'pin')
    `);
    
    let passwordColumn = null;
    
    if (passwordColumnCheck.rows.length > 0) {
      passwordColumn = passwordColumnCheck.rows[0].column_name;
      console.log(`   🔧 Found password column: ${passwordColumn}`);
    } else {
      // Check all columns as fallback
      const allColumns = await client.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'pb_share_register'
      `);
      
      console.log(`   📋 Available columns:`, allColumns.rows.map(r => r.column_name));
      
      // Try common password column names
      const possibleColumns = ['pass', 'password', 'pwd', 'pin', 'security_code', 'member_password'];
      for (const col of possibleColumns) {
        const exists = allColumns.rows.some(r => r.column_name === col);
        if (exists) {
          passwordColumn = col;
          console.log(`   🔧 Using column: ${passwordColumn}`);
          break;
        }
      }
    }
    
    if (!passwordColumn) {
      console.log(`   ❌ No password column found`);
      return res.status(500).json({ 
        success: false, 
        message: "Database configuration error. Please contact support." 
      });
    }
    
    // Step 3: Check if member exists
    const memberCheck = await client.query(
      `SELECT acc_no, holders_name FROM pb_share_register WHERE acc_no = $1`,
      [memberNo]
    );
    
    if (memberCheck.rows.length === 0) {
      console.log(`   ❌ Member not found`);
      return res.status(404).json({ 
        success: false, 
        message: "Member account not found." 
      });
    }
    
    console.log(`   ✅ Member found: ${memberCheck.rows[0].holders_name}`);
    
    // Step 4: Update the password
    const updateQuery = `UPDATE pb_share_register SET "${passwordColumn}" = $1 WHERE acc_no = $2`;
    console.log(`   📝 Executing: ${updateQuery}`);
    
    const updateResult = await client.query(updateQuery, [newPassword, memberNo]);
    
    console.log(`   📊 Rows affected: ${updateResult.rowCount}`);
    
    if (updateResult.rowCount > 0) {
      console.log(`   ✅ Password changed successfully!`);
      
      // Delete the used OTP
      await client.query(
        `DELETE FROM integration.user_name_otp WHERE id = $1`,
        [storedRecord.id]
      );
      console.log(`   🗑️  Deleted used OTP`);
      
      return res.status(200).json({
        success: true,
        message: "Password Changed Successfully"
      });
    } else {
      console.log(`   ⚠️ No rows updated`);
      return res.status(500).json({ 
        success: false, 
        message: "Error Resetting the Password. Please try again." 
      });
    }
    
  } catch (error) {
    console.error(`   ❌ Error:`, error.message);
    console.error(`   Stack:`, error.stack);
    
    return res.status(500).json({ 
      success: false, 
      message: "Error Resetting the Password. Please try again.",
      details: error.message
    });
  } finally {
    if (client) client.release();
  }
});

// Forward middleware for other endpoints
app.use('/api/v1', async (req, res, next) => {
  const LOCAL_ENDPOINTS = ['/auth/change-password', '/registerOtp', '/loan-statement-direct', '/withdrawable-statement-direct'];
  const isLocalEndpoint = LOCAL_ENDPOINTS.some(endpoint => req.path === endpoint);
  
  if (isLocalEndpoint) {
    return next();
  }
  
  try {
    const liveUrl = `${LIVE_API_BASE}${req.path}`;
    console.log(`   🔄 FORWARDING to: ${liveUrl}`);
    
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
      res.status(error.response.status).json(error.response.data);
    } else {
      res.status(500).json({ error: 'Failed to connect to live server', message: error.message });
    }
  }
});

// ============================================
// LOCAL ENDPOINT: LOAN STATEMENT PDF (Keep your existing code)
// ============================================
// ... (your existing loan-statement-direct endpoint)

// ============================================
// LOCAL ENDPOINT: WITHDRAWABLE DEPOSIT STATEMENT PDF (Keep your existing code)
// ============================================
// ... (your existing withdrawable-statement-direct endpoint)

// ============================================
// Start the server
// ============================================
app.listen(port, '0.0.0.0', () => {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🚀 PROXY SERVER RUNNING`);
  console.log(`${'='.repeat(60)}`);
  console.log(`📍 URL: http://localhost:${port}`);
  console.log(`\n✅ FORWARDING to live server: ${LIVE_API_BASE}`);
  console.log(`\n✅ LOCAL ENDPOINTS:`);
  console.log(`   POST   /api/v1/auth/change-password (FIXED - using "login name" and "created at")`);
  console.log(`   POST   /api/v1/registerOtp`);
  console.log(`   POST   /api/v1/loan-statement-direct`);
  console.log(`   POST   /api/v1/withdrawable-statement-direct`);
  console.log(`\n🔍 DEBUG ENDPOINTS:`);
  console.log(`   GET    /api/v1/debug/check-otp/:memberNo`);
  console.log(`   DELETE /api/v1/debug/clear-otp/:memberNo`);
  console.log(`\n🧪 TEST ENDPOINT: http://localhost:${port}/api/v1/test`);
  console.log(`${'='.repeat(60)}\n`);
});