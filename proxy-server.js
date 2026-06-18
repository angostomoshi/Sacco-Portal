const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { Pool } = require('pg');
const PDFDocument = require('pdfkit');
const nodemailer = require('nodemailer');

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
  console.log(`\n?? ${req.method} ${req.url}`);
  if (req.body && Object.keys(req.body).length > 0) {
    console.log(`   Body:`, req.body);
  }
  next();
});

// Database connection
const dbPool = new Pool({
  host: process.env.DB_HOST || '192.168.4.10',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'metrosacco',
  user: process.env.DB_USER || 'centre',
  password: process.env.DB_PASSWORD || 'centre123',
  ssl: false,
  connectionTimeoutMillis: 10000,
});

dbPool.connect((err) => {
  if (err) {
    console.error('? Database connection failed:', err.message);
  } else {
    console.log('? Database connected successfully');
  }
});

const LIVE_API_BASE = process.env.LIVE_API_BASE || 'http://192.168.4.10:8080/api/v1';
const SPRING_API_BASE = process.env.SPRING_API_BASE || 'http://192.168.4.10:8080/api/v1';

// ============================================
// UTILITY FUNCTIONS
// ============================================
// Convert DD/MM/YYYY format to YYYY-MM-DD for PostgreSQL
function convertDateFormat(dateStr) {
  if (!dateStr) return null;
  
  // Handle multiple formats
  if (dateStr.includes('/')) {
    // DD/MM/YYYY format
    const [day, month, year] = dateStr.split('/');
    return `${year}-${month}-${day}`;
  } else if (dateStr.includes('-') && dateStr.length === 10) {
    // Already in YYYY-MM-DD or DD-MM-YYYY format - check if it's already correct
    const parts = dateStr.split('-');
    if (parts[0].length === 4) {
      // Already YYYY-MM-DD
      return dateStr;
    } else {
      // DD-MM-YYYY format
      const [day, month, year] = parts;
      return `${year}-${month}-${day}`;
    }
  }
  
  return dateStr;
}

function normalizeProtocol(protocols) {
  return String(protocols || '').trim().toUpperCase();
}

async function getEmailServerSettings() {
  const result = await dbPool.query(
    `SELECT smtp_host,
            smpt_port,
            smtp_username,
            smtp_password,
            protocols,
            require_auth,
            smtp_debug,
            default_sender,
            company_id,
            sender_type
     FROM pb_emailserver_settings
     ORDER BY
       CASE
         WHEN lower(coalesce(default_sender, '')) = 'sacco@metro-hospital.com' THEN 0
         WHEN lower(coalesce(smtp_username, '')) = 'sacco@metro-hospital.com' THEN 1
         WHEN lower(coalesce(sender_type, '')) = 'general' THEN 2
         ELSE 3
       END,
       company_id NULLS LAST`
  );

  if (result.rows.length === 0) {
    throw new Error('SMTP settings not configured');
  }

  return result.rows[0];
}

async function sendOtpEmail({ recipientEmail, recipientName, memberNo, otpCode }) {
  const emailSettings = await getEmailServerSettings();
  const protocol = normalizeProtocol(emailSettings.protocols);
  const port = Number(emailSettings.smpt_port || 587);
  const secure = port === 465;

  const transport = nodemailer.createTransport({
    host: emailSettings.smtp_host,
    port,
    secure,
    requireTLS: !secure && (protocol.includes('TLS') || protocol.includes('START')),
    auth: emailSettings.require_auth ? {
      user: emailSettings.smtp_username,
      pass: emailSettings.smtp_password,
    } : undefined,
    logger: Boolean(emailSettings.smtp_debug),
    debug: Boolean(emailSettings.smtp_debug),
  });

  const sender = emailSettings.default_sender || emailSettings.smtp_username;
  const name = recipientName || 'Member';

  return transport.sendMail({
    from: sender,
    to: recipientEmail,
    subject: 'Metro Sacco Password Reset OTP',
    text: `Hello ${name},\n\nYour Metro Sacco password reset OTP is ${otpCode}.\nUse this code to change your password for member number ${memberNo}.\n\nIf you did not request this OTP, please ignore this email.\n\nMetro Sacco`,
    html: `
      <div style="font-family: Arial, sans-serif; color: #1f2937; line-height: 1.5;">
        <p>Hello ${name},</p>
        <p>Your Metro Sacco password reset OTP is:</p>
        <p style="font-size: 24px; font-weight: 700; letter-spacing: 4px;">${otpCode}</p>
        <p>Use this code to change your password for member number <strong>${memberNo}</strong>.</p>
        <p>If you did not request this OTP, you can ignore this email.</p>
        <p>Metro Sacco</p>
      </div>
    `,
  });
}

// ============================================
// LOAN APPLICATION EMAIL NOTIFICATIONS
// ============================================
async function sendLoanApplicationEmails({ memberNo, memberName, loanNo, amount, period, repayment, total }) {
  console.log(`\n?? [LOAN EMAIL] Sending loan application notifications for: ${memberNo}`);

  try {
    // 1. Fetch applicant's email from the member register
    const memberResult = await dbPool.query(
      `SELECT COALESCE(NULLIF(m.email_add, ''), '') AS email,
              COALESCE(NULLIF(m.holders_name, ''), $2) AS member_name
       FROM pb_share_register m
       WHERE m.acc_no = $1`,
      [memberNo, memberName]
    );

    const applicantEmail = memberResult.rows[0]?.email || null;
    const applicantName  = memberResult.rows[0]?.member_name || memberName || 'Member';

    // 2. Fetch SMTP settings
    const emailSettings = await getEmailServerSettings();
    const smtpPort  = Number(emailSettings.smpt_port || 587);
    const secure    = smtpPort === 465;
    const protocol  = normalizeProtocol(emailSettings.protocols);
    const sender    = emailSettings.default_sender || emailSettings.smtp_username;

    const transport = nodemailer.createTransport({
      host: emailSettings.smtp_host,
      port: smtpPort,
      secure,
      requireTLS: !secure && (protocol.includes('TLS') || protocol.includes('START')),
      auth: emailSettings.require_auth ? {
        user: emailSettings.smtp_username,
        pass: emailSettings.smtp_password,
      } : undefined,
      logger: Boolean(emailSettings.smtp_debug),
      debug:  Boolean(emailSettings.smtp_debug),
    });

    const appliedDate  = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
    const formatKES = (val) => Number(val).toLocaleString('en-KE', { minimumFractionDigits: 2 });

    // -- Applicant confirmation email --------------------------------------
    if (applicantEmail) {
      await transport.sendMail({
        from: sender,
        to: applicantEmail,
        subject: `Metro Sacco � Instant Loan Application Received (${loanNo})`,
        text: [
          `Dear ${applicantName},`,
          ``,
          `Your instant loan application has been received and is pending approval.`,
          ``,
          `LOAN APPLICATION SUMMARY`,
          `---------------------------------`,
          `Loan Number   : ${loanNo}`,
          `Member No     : ${memberNo}`,
          `Amount Applied: KES ${formatKES(amount)}`,
          `Period        : ${period} Month(s)`,
          `Monthly Rep.  : KES ${formatKES(repayment)}`,
          `Total Repay.  : KES ${formatKES(total)}`,
          `Date Applied  : ${appliedDate}`,
          `Status        : Pending Approval`,
          `---------------------------------`,
          ``,
          `You will be notified once the loan has been reviewed. For any queries, please contact the Sacco office.`,
          ``,
          `Metropolitan Hospital Sacco Ltd`,
        ].join('\n'),
        html: `
          <div style="font-family:Arial,sans-serif;color:#1f2937;line-height:1.6;max-width:600px;margin:0 auto">
            <div style="background:#00a3b5;padding:24px 32px;border-radius:8px 8px 0 0">
              <h2 style="color:#ffffff;margin:0;font-size:18px">Metropolitan Hospital Sacco Ltd</h2>
              <p style="color:#e0f7fa;margin:4px 0 0;font-size:13px">Loan Application Received</p>
            </div>
            <div style="background:#ffffff;padding:28px 32px;border:1px solid #e5e7eb;border-top:none">
              <p>Dear <strong>${applicantName}</strong>,</p>
              <p>Your instant loan application has been received and is currently <strong>pending approval</strong>.</p>

              <table style="width:100%;border-collapse:collapse;margin:20px 0;font-size:14px">
                <thead>
                  <tr style="background:#f3f4f6">
                    <th colspan="2" style="text-align:left;padding:10px 14px;border:1px solid #e5e7eb;color:#374151">Loan Application Summary</th>
                  </tr>
                </thead>
                <tbody>
                  <tr><td style="padding:8px 14px;border:1px solid #e5e7eb;color:#6b7280">Loan Number</td>   <td style="padding:8px 14px;border:1px solid #e5e7eb;font-weight:600">${loanNo}</td></tr>
                  <tr style="background:#f9fafb"><td style="padding:8px 14px;border:1px solid #e5e7eb;color:#6b7280">Member No</td>     <td style="padding:8px 14px;border:1px solid #e5e7eb;font-weight:600">${memberNo}</td></tr>
                  <tr><td style="padding:8px 14px;border:1px solid #e5e7eb;color:#6b7280">Amount Applied</td><td style="padding:8px 14px;border:1px solid #e5e7eb;font-weight:600">KES ${formatKES(amount)}</td></tr>
                  <tr style="background:#f9fafb"><td style="padding:8px 14px;border:1px solid #e5e7eb;color:#6b7280">Period</td>        <td style="padding:8px 14px;border:1px solid #e5e7eb;font-weight:600">${period} Month(s)</td></tr>
                  <tr><td style="padding:8px 14px;border:1px solid #e5e7eb;color:#6b7280">Monthly Repay.</td><td style="padding:8px 14px;border:1px solid #e5e7eb;font-weight:600">KES ${formatKES(repayment)}</td></tr>
                  <tr style="background:#f9fafb"><td style="padding:8px 14px;border:1px solid #e5e7eb;color:#6b7280">Total Repay.</td>  <td style="padding:8px 14px;border:1px solid #e5e7eb;font-weight:600">KES ${formatKES(total)}</td></tr>
                  <tr><td style="padding:8px 14px;border:1px solid #e5e7eb;color:#6b7280">Date Applied</td>  <td style="padding:8px 14px;border:1px solid #e5e7eb">${appliedDate}</td></tr>
                  <tr style="background:#fff7ed"><td style="padding:8px 14px;border:1px solid #e5e7eb;color:#6b7280">Status</td>        <td style="padding:8px 14px;border:1px solid #e5e7eb;font-weight:600;color:#d97706">? Pending Approval</td></tr>
                </tbody>
              </table>

              <p style="font-size:13px;color:#6b7280">You will be notified once the loan has been reviewed. For any queries, please contact the Sacco office.</p>
            </div>
            <div style="background:#f9fafb;padding:14px 32px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;text-align:center">
              <p style="margin:0;font-size:12px;color:#9ca3af">Metropolitan Hospital Sacco Ltd &mdash; Automated Notification</p>
            </div>
          </div>`,
      });
      console.log(`   ??  Applicant confirmation sent to ${applicantEmail}`);
    } else {
      console.warn(`   ??  No email address found for member ${memberNo} � skipping applicant email`);
    }

    // -- Admin notification email ------------------------------------------
    const ADMIN_EMAILS = ['sacco@metro-hospital.com', 'pwawerun@gmail.com'];
    await transport.sendMail({
      from: sender,
      to: ADMIN_EMAILS.join(', '),
      subject: `[ACTION REQUIRED] New Instant Loan Application � ${memberNo} (${loanNo})`,
      text: [
        `Dear Sacco Administrator,`,
        ``,
        `A new instant loan application has been submitted and requires your approval.`,
        ``,
        `LOAN APPLICATION SUMMARY`,
        `---------------------------------`,
        `Loan Number   : ${loanNo}`,
        `Member No     : ${memberNo}`,
        `Member Name   : ${applicantName}`,
        `Amount Applied: KES ${formatKES(amount)}`,
        `Period        : ${period} Month(s)`,
        `Monthly Rep.  : KES ${formatKES(repayment)}`,
        `Total Repay.  : KES ${formatKES(total)}`,
        `Date Applied  : ${appliedDate}`,
        `Status        : Pending Approval`,
        `---------------------------------`,
        ``,
        `Please log in to the Sacco administration system to review and approve or decline this application.`,
        ``,
        `Metropolitan Hospital Sacco Ltd`,
      ].join('\n'),
      html: `
        <div style="font-family:Arial,sans-serif;color:#1f2937;line-height:1.6;max-width:600px;margin:0 auto">
          <div style="background:#b91c1c;padding:24px 32px;border-radius:8px 8px 0 0">
            <h2 style="color:#ffffff;margin:0;font-size:18px">Metropolitan Hospital Sacco Ltd</h2>
            <p style="color:#fecaca;margin:4px 0 0;font-size:13px">?? Action Required � New Loan Application</p>
          </div>
          <div style="background:#ffffff;padding:28px 32px;border:1px solid #e5e7eb;border-top:none">
            <p>Dear Sacco Administrator,</p>
            <p>A new instant loan application has been submitted and is awaiting your approval:</p>

            <table style="width:100%;border-collapse:collapse;margin:20px 0;font-size:14px">
              <thead>
                <tr style="background:#f3f4f6">
                  <th colspan="2" style="text-align:left;padding:10px 14px;border:1px solid #e5e7eb;color:#374151">Loan Application Summary</th>
                </tr>
              </thead>
              <tbody>
                <tr><td style="padding:8px 14px;border:1px solid #e5e7eb;color:#6b7280">Loan Number</td>   <td style="padding:8px 14px;border:1px solid #e5e7eb;font-weight:600">${loanNo}</td></tr>
                <tr style="background:#f9fafb"><td style="padding:8px 14px;border:1px solid #e5e7eb;color:#6b7280">Member No</td>     <td style="padding:8px 14px;border:1px solid #e5e7eb;font-weight:600">${memberNo}</td></tr>
                <tr><td style="padding:8px 14px;border:1px solid #e5e7eb;color:#6b7280">Member Name</td>   <td style="padding:8px 14px;border:1px solid #e5e7eb;font-weight:600">${applicantName}</td></tr>
                <tr style="background:#f9fafb"><td style="padding:8px 14px;border:1px solid #e5e7eb;color:#6b7280">Amount Applied</td><td style="padding:8px 14px;border:1px solid #e5e7eb;font-weight:600">KES ${formatKES(amount)}</td></tr>
                <tr><td style="padding:8px 14px;border:1px solid #e5e7eb;color:#6b7280">Period</td>        <td style="padding:8px 14px;border:1px solid #e5e7eb;font-weight:600">${period} Month(s)</td></tr>
                <tr style="background:#f9fafb"><td style="padding:8px 14px;border:1px solid #e5e7eb;color:#6b7280">Monthly Repay.</td><td style="padding:8px 14px;border:1px solid #e5e7eb;font-weight:600">KES ${formatKES(repayment)}</td></tr>
                <tr><td style="padding:8px 14px;border:1px solid #e5e7eb;color:#6b7280">Total Repay.</td>  <td style="padding:8px 14px;border:1px solid #e5e7eb;font-weight:600">KES ${formatKES(total)}</td></tr>
                <tr style="background:#f9fafb"><td style="padding:8px 14px;border:1px solid #e5e7eb;color:#6b7280">Date Applied</td>  <td style="padding:8px 14px;border:1px solid #e5e7eb">${appliedDate}</td></tr>
                <tr style="background:#fff7ed"><td style="padding:8px 14px;border:1px solid #e5e7eb;color:#6b7280">Status</td>        <td style="padding:8px 14px;border:1px solid #e5e7eb;font-weight:600;color:#d97706">? Pending Approval</td></tr>
              </tbody>
            </table>

            <p style="font-size:13px">Please log in to the Sacco administration system to review and process this application.</p>
          </div>
          <div style="background:#f9fafb;padding:14px 32px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;text-align:center">
            <p style="margin:0;font-size:12px;color:#9ca3af">Metropolitan Hospital Sacco Ltd &mdash; Automated Notification</p>
          </div>
        </div>`,
    });
    console.log(`   ??  Admin notification sent to ${ADMIN_EMAILS.join(', ')}`);

  } catch (emailErr) {
    // Email failure must never crash the loan registration flow
    console.error('   ? [LOAN EMAIL] Failed to send loan application emails:', emailErr.message);
  }
}

// ============================================
// DEBUG: Clear all OTPs for a member
// ============================================
// Endpoints handled by THIS proxy server locally (PDF generation etc.)
const LOCAL_ENDPOINTS = [
  '/auth/registerOtp',
  '/loan/apply',
  '/loan-statement-direct', 
  '/withdrawable-statement-direct',
];

const LOCAL_ENDPOINT_PREFIXES = [
  '/instant/',
  '/loan-applications/',
];

// Endpoints that must go to the Spring Boot backend (port 8080)
const SPRING_ENDPOINTS = [
  '/auth/change-password',
  '/auth/authenticate',
  '/auth/register',
];

// ============================================
// MIDDLEWARE: Route requests
// ============================================
app.use('/api/v1', async (req, res, next) => {
  console.log(`\n?? Checking path: ${req.path}`);

  // Check if this is a locally-handled endpoint (PDF etc.)
  const isLocalEndpoint =
    LOCAL_ENDPOINTS.some(endpoint => req.path === endpoint) ||
    LOCAL_ENDPOINT_PREFIXES.some(prefix => req.path.startsWith(prefix));

  if (isLocalEndpoint) {
    console.log(`   ? Handling locally: ${req.path}`);
    return next();
  }

  // Check if this should go to the Spring Boot backend
  const isSpringEndpoint = SPRING_ENDPOINTS.some(endpoint => req.path.startsWith(endpoint));

  if (isSpringEndpoint) {
    console.log(`   ?? FORWARDING to Spring Boot: ${req.path}`);
    try {
      // Map proxy paths to Spring Boot paths
      let springPath = req.path;
      if (req.path === '/auth/change-password') {
        // Frontend POSTs to /auth/change-password, Spring Boot expects PUT /auth/changePassword
        springPath = '/auth/changePassword';
      } else if (req.path === '/loan/apply') {
        springPath = '/instant/register';
      }

      const springUrl = `${SPRING_API_BASE}${springPath}`;
      console.log(`   ?? Spring URL: ${springUrl}`);

      // Map request body fields to Spring Boot's ChangePasswordRequest
      let springBody = req.body;
      if (req.path === '/auth/change-password') {
        springBody = {
          memberNo: req.body.memberNo,
          otp: parseInt(req.body.otp, 10),
          password: req.body.newPassword || req.body.password,
        };
        console.log(`   ?? Mapped body for Spring Boot:`, springBody);
      }

      // Snapshot original frontend loan fields BEFORE remapping
      const originalLoanBody = req.path === '/loan/apply' ? { ...req.body } : null;

      if (req.path === '/loan/apply') {
        springBody = {
          memNo: req.body.memberNo,
          memberName: req.body.memberName,
          amount: req.body.loanAmount,
          period: req.body.periodMonths,
          repayment: req.body.monthlyDeduction,
          total: req.body.totalAmount,
          interest: req.body.interestAmount,
        };
        console.log(`   Mapped loan application body for Spring Boot:`, springBody);
      }

      const forwardHeaders = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      };
      if (req.headers.authorization) {
        forwardHeaders['Authorization'] = req.headers.authorization;
      }

      // Spring Boot expects PUT for changePassword
      const springMethod = req.path === '/auth/change-password' ? 'PUT' : req.method;

      const response = await axios({
        method: springMethod,
        url: springUrl,
        data: springBody,
        params: req.query,
        headers: forwardHeaders,
        timeout: 30000,
      });

      console.log(`   ? Spring Boot response: ${response.status}`);

      // -- Fire-and-forget email notifications for successful loan application --
      if (req.path === '/loan/apply' && response.status === 201 && originalLoanBody) {
        const createdLoan = response.data || {};
        setImmediate(() => {
          sendLoanApplicationEmails({
            memberNo:  originalLoanBody.memberNo,
            memberName: originalLoanBody.memberName,
            loanNo:    createdLoan.loanNo || createdLoan.loan_no || 'N/A',
            amount:    originalLoanBody.loanAmount,
            period:    originalLoanBody.periodMonths,
            repayment: originalLoanBody.monthlyDeduction,
            total:     originalLoanBody.totalAmount,
          });
        });
        console.log(`   ?? Email notifications queued for loan application`);
      }

      return res.status(response.status).json(response.data);
    } catch (error) {
      console.error(`   ? Spring Boot error:`, error.message);
      if (error.response) {
        return res.status(error.response.status).json(error.response.data);
      }
      return res.status(500).json({ error: 'Spring Boot backend unavailable', message: error.message });
    }
  }

  // Default: Forward to live remote server
  console.log(`   ?? FORWARDING to live server: ${req.path}`);
  try {
    const liveUrl = `${LIVE_API_BASE}${req.path}`;
    console.log(`   ?? Forwarding to: ${liveUrl}`);

    const forwardHeaders = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };
    if (req.headers.authorization) {
      forwardHeaders['Authorization'] = req.headers.authorization;
    }
    if (req.headers.cookie) {
      forwardHeaders['Cookie'] = req.headers.cookie;
    }
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
      withCredentials: true,
    });

    console.log(`   ? Response: ${response.status}`);
    if (response.headers['set-cookie']) {
      res.setHeader('Set-Cookie', response.headers['set-cookie']);
    }
    res.status(response.status).json(response.data);
  } catch (error) {
    console.error('Forwarding error:', error.message);
    if (error.response) {
      res.status(error.response.status).json(error.response.data);
    } else {
      res.status(500).json({ error: 'Failed to connect to live server', message: error.message });
    }
  }
});

// ============================================
// LOCAL ENDPOINT: CHANGE PASSWORD
// ============================================
// NOTE: /api/v1/auth/change-password is now forwarded to Spring Boot via SPRING_ENDPOINTS above.
// The old local implementation has been removed — Spring Boot handles OTP verification + password update.

// ============================================
// LOCAL ENDPOINT: REGISTER/SEND OTP
// ============================================
app.post('/api/v1/auth/registerOtp', async (req, res) => {
  const memberNo = String(req.body?.memberNo || '').trim();
  const requestedEmail = String(req.body?.email || '').trim();
  const requestedMobile = String(req.body?.mobileNo || req.body?.phoneNo || '').trim();
  console.log(`\n📧 [LOCAL] Sending OTP for: ${memberNo}`);

  if (!memberNo) {
    return res.status(400).json({ message: 'Member number is required.' });
  }

  if (requestedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(requestedEmail)) {
    return res.status(400).json({ message: 'Please enter a valid email address.' });
  }

  try {
    let memberResult;
    if (requestedEmail) {
      memberResult = await dbPool.query(
        `SELECT m.acc_no AS member_no,
                $2::text AS email,
                COALESCE(NULLIF(m.holders_name, ''), m.acc_no) AS member_name,
                COALESCE(NULLIF($3::text, ''), m.tel1) AS tel1
         FROM pb_share_register m
         WHERE m.acc_no = $1`,
        [memberNo, requestedEmail, requestedMobile]
      );
    } else {
      memberResult = await dbPool.query(
        `SELECT u.member_no,
                COALESCE(NULLIF(m.email_add, ''), NULLIF(u.email, '')) AS email,
                COALESCE(NULLIF(m.holders_name, ''), u.member_no) AS member_name,
                m.tel1
         FROM pb_users u
         LEFT JOIN pb_share_register m ON m.acc_no = u.member_no
         WHERE u.member_no = $1`,
        [memberNo]
      );
    }

    if (memberResult.rows.length === 0) {
      return res.status(404).json({
        message: requestedEmail
          ? 'Member record not found for that member number.'
          : 'Portal account not found for that member number.',
      });
    }

    const member = memberResult.rows[0];
    if (!member.email) {
      return res.status(400).json({ message: 'No email address is registered for this member account.' });
    }

    await dbPool.query(
      `UPDATE pb_sacco_passkey
       SET key_used = true
       WHERE member_no = $1
         AND logged_in = true
         AND key_used = false`,
      [memberNo]
    );

    const insertResult = await dbPool.query(
      `INSERT INTO pb_sacco_passkey (member_no, phone_no, email, logged_in, sms_sent, key_used)
       VALUES ($1, $2, $3, true, false, false)
       RETURNING id, pass_key, cdate`,
      [memberNo, member.tel1 || null, member.email]
    );

    const otpRecord = insertResult.rows[0];

    try {
      await sendOtpEmail({
        recipientEmail: member.email,
        recipientName: member.member_name,
        memberNo,
        otpCode: otpRecord.pass_key,
      });
    } catch (emailError) {
      await dbPool.query(`UPDATE pb_sacco_passkey SET key_used = true WHERE id = $1`, [otpRecord.id]);
      console.error('❌ Failed to send OTP email:', emailError.message);
      return res.status(500).json({
        message: 'Failed to send OTP email. Please try again.',
      });
    }

    return res.status(201).json({
      memberNo,
      email: member.email,
      message: `OTP sent successfully to ${member.email}. Please check your email.`,
      sentAt: otpRecord.cdate,
    });
  } catch (error) {
    console.error('❌ OTP email flow failed:', error.message);
    return res.status(500).json({
      message: 'Unable to send OTP right now. Please try again later.',
    });
  }
});

// ============================================
// LOCAL ENDPOINT: INSTANT LOAN APPLICATION
// ============================================
app.post('/api/v1/loan/apply', async (req, res) => {
  const {
    memberNo,
    memberName,
    loanAmount,
    periodMonths,
    interestAmount,
    totalAmount,
    monthlyDeduction,
    loanType,
  } = req.body || {};

  const amount = Number(loanAmount || 0);
  const period = Number(periodMonths || 0);
  const interest = Number(interestAmount || 0);
  const total = Number(totalAmount || 0);
  const repayment = Number(monthlyDeduction || 0);
  const normalizedMemberNo = String(memberNo || '').trim();

  console.log(`\n📝 [LOCAL] Registering instant loan in pb_saccoloan for: ${normalizedMemberNo}`);

  if (!normalizedMemberNo) {
    return res.status(400).json({ message: 'Member number is required.' });
  }

  if (!amount || amount <= 0 || !period || period <= 0) {
    return res.status(400).json({ message: 'Valid loan amount and period are required.' });
  }

  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');

    const memberResult = await client.query(
      `SELECT acc_no,
              holders_name,
              id_no,
              email_add,
              tel1,
              postal_address,
              postal_code
       FROM pb_share_register
       WHERE acc_no = $1`,
      [normalizedMemberNo]
    );

    if (memberResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Member record not found.' });
    }

    const member = memberResult.rows[0];
    const year = new Date().getFullYear();
    const nextLoanResult = await client.query(
      `SELECT COALESCE(MAX(split_part(loan_no, '/', 1)::integer), 0) + 1 AS next_no
       FROM pb_saccoloan
       WHERE loan_no ~ $1`,
      [`^[0-9]+/${year}$`]
    );

    const loanNo = `${nextLoanResult.rows[0].next_no}/${year}`;
    const startDate = new Date();
    const endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + period);
    const applicantName = memberName || member.holders_name || normalizedMemberNo;

    await client.query(
      `INSERT INTO pb_saccoloan (
         mem_no,
         member_name,
         loan_no,
         postal_address,
         postal_code,
         email_address,
         id_no,
         lpurpose,
         pymt_terms,
         cdate,
         edate,
         amount,
         period,
         repayment,
         interest,
         premium,
         total,
         user_name,
         input_date,
         charge_int,
         processed,
         sms_sent,
         sms_processed,
         security
       )
       VALUES (
         $1, $2, $3, $4, $5, $6, $7,
         $8, 'monthly', $9, $10, $11, $12, $13, $14, $13, $15,
         'centre', $9, true, false, false, false, 'Shares'
       )`,
      [
        normalizedMemberNo,
        applicantName,
        loanNo,
        member.postal_address || null,
        member.postal_code || null,
        member.email_add || null,
        member.id_no || null,
        loanType || 'METRO SACCO INSTANT LOAN',
        startDate,
        endDate,
        amount,
        period,
        repayment,
        interest,
        total,
      ]
    );

    await client.query('COMMIT');

    setImmediate(() => {
      sendLoanApplicationEmails({
        memberNo: normalizedMemberNo,
        memberName: applicantName,
        loanNo,
        amount,
        period,
        repayment,
        total,
      });
    });

    return res.status(201).json({
      success: true,
      loanNo,
      loanNumber: loanNo,
      message: 'Instant loan application registered successfully.',
    });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('❌ Failed to register instant loan locally:', error.message);
    return res.status(500).json({
      message: 'We could not register the loan application right now.',
      error: error.message,
    });
  } finally {
    client.release();
  }
});

// ============================================
// LOCAL ENDPOINT: ACTIVE INSTANT LOANS
// ============================================
app.get('/api/v1/instant/:memberNo', async (req, res) => {
  const { memberNo } = req.params;
  console.log(`\n📘 [LOCAL] Fetching active instant loans for: ${memberNo}`);

  try {
    const activeLoanResult = await dbPool.query(
      `SELECT loan_no AS "loanNo",
              initcap(lpurpose) AS "loanPurpose",
              cdate AS "startDate",
              edate AS "endDate",
              period,
              amount,
              SUM(balance - credit_bal) AS "outStanding"
       FROM ac_debtors, pb_saccoloan
       WHERE mem_no = account_no
         AND invoice_no = loan_no
         AND account_no = $1
       GROUP BY loan_no, lpurpose, amount, cdate, edate, period
       HAVING SUM(balance - credit_bal) <> 0
       ORDER BY cdate`,
      [memberNo]
    );

    if (activeLoanResult.rows.length === 0) {
      return res.json({
        status: 404,
        message: 'Could not fetch data',
        data: null,
      });
    }

    return res.json({
      status: 200,
      message: 'OK',
      data: activeLoanResult.rows,
    });
  } catch (error) {
    console.error('❌ Failed to fetch active instant loans:', error.message);
    return res.status(500).json({
      error: 'Failed to fetch active instant loans',
      message: error.message,
    });
  }
});

// ============================================
// LOCAL ENDPOINT: PENDING LOAN APPLICATIONS
// ============================================
app.get('/api/v1/loan-applications/:memberNo', async (req, res) => {
  const { memberNo } = req.params;
  console.log(`\n📋 [LOCAL] Fetching pending loan applications for: ${memberNo}`);

  try {
    const pendingResult = await dbPool.query(
      `SELECT loan_no AS "loanNo",
              initcap(lpurpose) AS "loanPurpose",
              cdate AS "startDate",
              edate AS "endDate",
              period,
              amount,
              total,
              repayment,
              interest,
              COALESCE(total, amount, 0) AS "outStanding",
              true AS "isPending",
              'Pending Approval' AS status
       FROM pb_saccoloan
       WHERE mem_no = $1
         AND COALESCE(processed, false) = false
       ORDER BY cdate DESC, id DESC`,
      [memberNo]
    );

    return res.json({
      success: true,
      data: pendingResult.rows,
    });
  } catch (error) {
    console.error('❌ Failed to fetch pending loan applications:', error.message);
    return res.status(500).json({
      error: 'Failed to fetch pending loan applications',
      message: error.message,
    });
  }
});

// ============================================
// LOCAL ENDPOINT: LOAN STATEMENT PDF
// ============================================
app.post('/api/v1/loan-statement-direct', async (req, res) => {
  const {
    loanNo,
    memberNo,
    startDate,
    endDate,
    principalAmount,
    outstandingBalance,
    purpose: requestedPurpose,
    period: requestedPeriod,
    status: requestedStatus,
    isPending: requestedIsPending,
  } = req.body;
  console.log(`\n📄 [LOCAL] Generating PDF for Loan: ${loanNo}`);
  
  try {
    const headerResult = await dbPool.query("SELECT header_name FROM pb_header LIMIT 1");
    const organisationName = headerResult.rows[0]?.header_name || 'METROPOLITAN HOSPITAL SACCO LTD';
    
    let loanResult = await dbPool.query(
      `SELECT lpurpose as purpose, amount, cdate as start_date, edate as end_date, period, interest
       FROM pb_saccoloan WHERE loan_no = $1`,
      [loanNo]
    );

    let isPendingApplication = false;
    if (loanResult.rows.length === 0) {
      loanResult = await dbPool.query(
        `SELECT lpurpose as purpose,
                amount,
                cdate as start_date,
                edate as end_date,
                period,
                interest,
                repayment,
                total
         FROM pb_saccoloan1
         WHERE loan_no = $1`,
        [loanNo]
      );
      isPendingApplication = loanResult.rows.length > 0;
    }

    if (loanResult.rows.length === 0) {
      return res.status(404).json({ error: 'Loan not found' });
    }
    const loan = loanResult.rows[0];
    const normalizedStartDate = convertDateFormat(startDate) || loan.start_date;
    const normalizedEndDate = convertDateFormat(endDate) || loan.end_date;
    const displayPrincipal = parseFloat(principalAmount ?? loan.amount ?? 0) || 0;
    const displayOutstanding = parseFloat(outstandingBalance ?? loan.total ?? loan.amount ?? 0) || 0;
    const displayPurpose = requestedPurpose || loan.purpose || 'N/A';
    const displayPeriod = requestedPeriod ?? loan.period ?? 0;
    const displayStatus = requestedStatus || (requestedIsPending || isPendingApplication ? 'Pending Approval' : 'Active');
    
    const memberResult = await dbPool.query(
      `SELECT holders_name, id_no, tel1, email_add, acc_no 
       FROM pb_share_register WHERE acc_no = $1`,
      [memberNo]
    );
    
    if (memberResult.rows.length === 0) {
      return res.status(404).json({ error: 'Member not found' });
    }
    const member = memberResult.rows[0];
    
    let openingBalance = 0;
    let transResult = { rows: [] };

    if (!isPendingApplication) {
      const openingResult = await dbPool.query(
        `SELECT COALESCE(SUM(balance - credit_bal), 0) as opening_balance
         FROM ac_debtors 
         WHERE account_no = $1 AND invoice_no = $2 AND date::date < $3::date`,
        [memberNo, loanNo, normalizedStartDate]
      );
      openingBalance = parseFloat(openingResult.rows[0]?.opening_balance || 0);

      transResult = await dbPool.query(
        `SELECT TO_CHAR(date, 'DD/MM/YYYY') as trans_date,
                initcap(item) as item, reference_no, receipt_no,
                COALESCE(balance, 0) as debit, COALESCE(credit_bal, 0) as credit
         FROM ac_debtors 
         WHERE account_no = $1 AND invoice_no = $2
           AND date::date BETWEEN $3::date AND $4::date
           AND (balance <> 0 OR credit_bal <> 0)
         ORDER BY date ASC`,
        [memberNo, loanNo, normalizedStartDate, normalizedEndDate]
      );
    }
    
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const chunks = [];
    
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => {
      const pdfBuffer = Buffer.concat(chunks);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=loan-statement-${loanNo}.pdf`);
      res.send(pdfBuffer);
    });

    const pageLeft = 50;
    const pageRight = 550;
    const pageWidth = pageRight - pageLeft;
    const formatMoney = (value) => Number(value || 0).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

    const drawSectionTitle = (title) => {
      doc.moveDown(0.2);
      doc
        .font('Helvetica-Bold')
        .fontSize(10)
        .fillColor('#111827')
        .text(title, pageLeft, doc.y, {
          width: pageWidth,
          align: 'center',
        });
      doc.moveDown(0.35);
    };

    const drawReportFooter = () => {
      if (doc.y > 725) {
        doc.addPage();
      }

      doc.moveDown(0.7);
      doc
        .font('Helvetica')
        .fontSize(8)
        .fillColor('#374151')
        .text('This is a computer-generated statement.', pageLeft, doc.y, {
          width: pageWidth,
          align: 'center',
        });
      doc.moveDown(0.25);
      doc.text(`Generated on: ${new Date().toLocaleString()}`, pageLeft, doc.y, {
        width: pageWidth,
        align: 'center',
      });
      doc.fillColor('#000000');
    };

    const drawInfoTable = (title, rows) => {
      drawSectionTitle(title);
      let y = doc.y + 6;
      const rowHeight = 20;
      const columns = [
        { x: pageLeft, width: 78, type: 'label' },
        { x: pageLeft + 78, width: 172, type: 'value' },
        { x: pageLeft + 250, width: 78, type: 'label' },
        { x: pageLeft + 328, width: 172, type: 'value' },
      ];

      rows.forEach((row) => {
        columns.forEach((column, index) => {
          doc.rect(column.x, y, column.width, rowHeight).stroke();
          doc
            .font(column.type === 'label' ? 'Helvetica-Bold' : 'Helvetica')
            .fontSize(8)
            .text(row[index] || '', column.x + 4, y + 6, {
              width: column.width - 8,
              height: rowHeight - 6,
              ellipsis: true,
            });
        });
        y += rowHeight;
      });

      doc.y = y + 10;
    };

    const transactionColumns = [
      { key: 'date', label: 'Date', x: pageLeft, width: 52, align: 'left' },
      { key: 'description', label: 'Description', x: pageLeft + 52, width: 130, align: 'left' },
      { key: 'refNo', label: 'Ref No', x: pageLeft + 182, width: 58, align: 'left' },
      { key: 'receiptNo', label: 'Receipt No', x: pageLeft + 240, width: 58, align: 'left' },
      { key: 'debit', label: 'Debit (KES)', x: pageLeft + 298, width: 67, align: 'right' },
      { key: 'credit', label: 'Credit (KES)', x: pageLeft + 365, width: 67, align: 'right' },
      { key: 'balance', label: 'Running Amt (KES)', x: pageLeft + 432, width: 68, align: 'right' },
    ];

    const drawTransactionHeader = (y) => {
      doc.rect(pageLeft, y, pageWidth, 20).fillAndStroke('#f3f4f6', '#111827');
      transactionColumns.forEach((column) => {
        doc
          .fillColor('#111827')
          .font('Helvetica-Bold')
          .fontSize(7.5)
          .text(column.label, column.x + 4, y + 6, {
            width: column.width - 8,
            align: column.align,
          });
      });
      doc.fillColor('#000000');
      return y + 20;
    };

    const drawTransactionRow = (y, row, options = {}) => {
      const rowHeight = options.rowHeight || 18;
      doc.rect(pageLeft, y, pageWidth, rowHeight).stroke();

      transactionColumns.forEach((column) => {
        doc.moveTo(column.x, y).lineTo(column.x, y + rowHeight).stroke();
        doc
          .font(options.bold ? 'Helvetica-Bold' : 'Helvetica')
          .fontSize(7.5)
          .text(row[column.key] || '-', column.x + 4, y + 5, {
            width: column.width - 8,
            height: rowHeight - 5,
            align: column.align,
            ellipsis: true,
          });
      });
      doc.moveTo(pageRight, y).lineTo(pageRight, y + rowHeight).stroke();

      return y + rowHeight;
    };
    
    // Generate PDF
    doc.fontSize(16).font('Helvetica-Bold').text(organisationName, { align: 'center' });
    doc.moveDown();
    doc
      .fontSize(14)
      .font('Helvetica-Bold')
      .text(isPendingApplication ? 'LOAN APPLICATION SUMMARY' : 'LOAN STATEMENT', { align: 'center' });
    doc.moveDown();
    
    drawInfoTable('MEMBER INFORMATION', [
      ['Name', member.holders_name || 'N/A', 'Member No', member.acc_no || memberNo],
      ['ID No', member.id_no || 'N/A', 'Phone', member.tel1 || 'N/A'],
      ['Email', member.email_add || 'N/A', 'Print Date', new Date().toLocaleDateString('en-GB')],
    ]);

    const loanInfoRows = [
      ['Loan Number', loanNo, 'Purpose', displayPurpose],
      ['Principal', `KES ${formatMoney(displayPrincipal)}`, 'Outstanding', `KES ${formatMoney(displayOutstanding)}`],
      ['Interest Rate', `${loan.interest || 0}%`, 'Period', `${displayPeriod || 0} months`],
      ['Start Date', loan.start_date ? new Date(loan.start_date).toLocaleDateString('en-GB') : 'N/A', 'End Date', loan.end_date ? new Date(loan.end_date).toLocaleDateString('en-GB') : 'N/A'],
      ['Status', displayStatus, '', ''],
    ];
    if (isPendingApplication) {
      loanInfoRows.push([
        'Monthly Repayment',
        `KES ${formatMoney(loan.repayment)}`,
        'Total Repayable',
        `KES ${formatMoney(loan.total)}`,
      ]);
    }
    drawInfoTable('LOAN INFORMATION', loanInfoRows);

    if (isPendingApplication) {
      drawSectionTitle('APPLICATION STATUS');
      doc.moveDown(0.5);
      doc.font('Helvetica').fontSize(10);
      doc.text('This loan was created successfully and is still pending approval/posting.', pageLeft, doc.y, {
        width: pageWidth,
        align: 'center',
      });
      doc.text('A full transactional loan statement becomes available after the loan is posted to the live loan ledger.', pageLeft, doc.y, {
        width: pageWidth,
        align: 'center',
      });
    } else {
      drawSectionTitle('TRANSACTION HISTORY');

      let runningBalance = openingBalance;
      let totalDebit = 0, totalCredit = 0;
      let y = doc.y + 10;

      y = drawTransactionHeader(y);
      y = drawTransactionRow(y, {
        date: '-',
        description: 'OPENING BALANCE',
        refNo: '-',
        receiptNo: '-',
        debit: '-',
        credit: '-',
        balance: formatMoney(openingBalance),
      }, { bold: true });

      for (const row of transResult.rows) {
        const debit = parseFloat(row.debit) || 0;
        const credit = parseFloat(row.credit) || 0;
        runningBalance = runningBalance + debit - credit;
        totalDebit += debit;
        totalCredit += credit;

        if (y > 700) {
          doc.addPage();
          y = 50;
          y = drawTransactionHeader(y);
        }

        y = drawTransactionRow(y, {
          date: row.trans_date || '-',
          description: row.item || 'Transaction',
          refNo: row.reference_no || '-',
          receiptNo: row.receipt_no || '-',
          debit: debit > 0 ? formatMoney(debit) : '-',
          credit: credit > 0 ? formatMoney(credit) : '-',
          balance: formatMoney(runningBalance),
        });
      }

      if (y > 680) {
        doc.addPage();
        y = drawTransactionHeader(50);
      }
      y += 4;
      y = drawTransactionRow(y, {
        date: '',
        description: 'TOTALS',
        refNo: '',
        receiptNo: '',
        debit: formatMoney(totalDebit),
        credit: formatMoney(totalCredit),
        balance: formatMoney(runningBalance),
      }, { bold: true });
      y = drawTransactionRow(y, {
        date: '',
        description: 'CLOSING BALANCE',
        refNo: '',
        receiptNo: '',
        debit: '',
        credit: '',
        balance: formatMoney(runningBalance),
      }, { bold: true });
      doc.y = y + 10;
    }
    
    drawReportFooter();
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
    
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const chunks = [];
    
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => {
      const pdfBuffer = Buffer.concat(chunks);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=withdrawable-statement-${accountNo}.pdf`);
      res.send(pdfBuffer);
    });

    const pageLeft = 50;
    const pageRight = 550;
    const pageWidth = pageRight - pageLeft;
    const formatMoney = (value) => Number(value || 0).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

    const drawSectionTitle = (title) => {
      doc.moveDown(0.2);
      doc
        .font('Helvetica-Bold')
        .fontSize(10)
        .fillColor('#111827')
        .text(title, pageLeft, doc.y, {
          width: pageWidth,
          align: 'center',
        });
      doc.moveDown(0.35);
    };

    const drawInfoTable = (title, rows) => {
      drawSectionTitle(title);
      let y = doc.y + 6;
      const rowHeight = 20;
      const columns = [
        { x: pageLeft, width: 78, type: 'label' },
        { x: pageLeft + 78, width: 172, type: 'value' },
        { x: pageLeft + 250, width: 78, type: 'label' },
        { x: pageLeft + 328, width: 172, type: 'value' },
      ];

      rows.forEach((row) => {
        columns.forEach((column, index) => {
          doc.rect(column.x, y, column.width, rowHeight).stroke();
          doc
            .font(column.type === 'label' ? 'Helvetica-Bold' : 'Helvetica')
            .fontSize(8)
            .fillColor('#111827')
            .text(row[index] || '', column.x + 4, y + 6, {
              width: column.width - 8,
              height: rowHeight - 6,
              ellipsis: true,
            });
        });
        y += rowHeight;
      });

      doc.y = y + 10;
    };

    const transactionColumns = [
      { key: 'date', label: 'Date', x: pageLeft, width: 52, align: 'left' },
      { key: 'description', label: 'Narration', x: pageLeft + 52, width: 130, align: 'left' },
      { key: 'refNo', label: 'Ref No', x: pageLeft + 182, width: 58, align: 'left' },
      { key: 'receiptNo', label: 'Receipt No', x: pageLeft + 240, width: 58, align: 'left' },
      { key: 'debit', label: 'Withdrawn (KES)', x: pageLeft + 298, width: 67, align: 'right' },
      { key: 'credit', label: 'Deposited (KES)', x: pageLeft + 365, width: 67, align: 'right' },
      { key: 'balance', label: 'Running Amt (KES)', x: pageLeft + 432, width: 68, align: 'right' },
    ];

    const drawTransactionHeader = (y) => {
      doc.rect(pageLeft, y, pageWidth, 22).fillAndStroke('#f3f4f6', '#111827');
      transactionColumns.forEach((column) => {
        doc
          .fillColor('#111827')
          .font('Helvetica-Bold')
          .fontSize(7)
          .text(column.label, column.x + 4, y + 6, {
            width: column.width - 8,
            align: column.align,
          });
      });
      doc.fillColor('#000000');
      return y + 22;
    };

    const drawTransactionRow = (y, row, options = {}) => {
      const rowHeight = options.rowHeight || 18;
      doc.rect(pageLeft, y, pageWidth, rowHeight).stroke();

      transactionColumns.forEach((column) => {
        doc.moveTo(column.x, y).lineTo(column.x, y + rowHeight).stroke();
        doc
          .font(options.bold ? 'Helvetica-Bold' : 'Helvetica')
          .fontSize(7.5)
          .fillColor('#111827')
          .text(row[column.key] || '-', column.x + 4, y + 5, {
            width: column.width - 8,
            height: rowHeight - 5,
            align: column.align,
            ellipsis: true,
          });
      });
      doc.moveTo(pageRight, y).lineTo(pageRight, y + rowHeight).stroke();

      return y + rowHeight;
    };

    const drawReportFooter = () => {
      if (doc.y > 725) {
        doc.addPage();
      }

      doc.moveDown(0.7);
      doc
        .font('Helvetica')
        .fontSize(8)
        .fillColor('#374151')
        .text('This is a computer-generated statement.', pageLeft, doc.y, {
          width: pageWidth,
          align: 'center',
        });
      doc.moveDown(0.25);
      doc.text(`Generated on: ${new Date().toLocaleString()}`, pageLeft, doc.y, {
        width: pageWidth,
        align: 'center',
      });
      doc.fillColor('#000000');
    };
    
    doc.fontSize(16).font('Helvetica-Bold').text(organisationName, { align: 'center' });
    doc.moveDown();
    doc.fontSize(14).font('Helvetica-Bold').text('WITHDRAWABLE DEPOSITS STATEMENT', { align: 'center' });
    doc.moveDown();
    
    drawInfoTable('ACCOUNT INFORMATION', [
      ['Name', account.holders_name || 'N/A', 'Account No', account.acc_no || accountNo],
      ['ID No', account.id_no || 'N/A', 'Phone', account.tel1 || 'N/A'],
      ['Email', account.email_add || 'N/A', 'Print Date', new Date().toLocaleDateString('en-GB')],
    ]);

    drawInfoTable('STATEMENT PERIOD', [
      ['From', new Date(startDate).toLocaleDateString('en-GB'), 'To', new Date(endDate).toLocaleDateString('en-GB')],
    ]);

    drawSectionTitle('TRANSACTION HISTORY');
    
    let runningBalance = openingBalance;
    let totalDebit = 0, totalCredit = 0;
    let y = doc.y + 10;
    
    y = drawTransactionHeader(y);
    y = drawTransactionRow(y, {
      date: '-',
      description: 'BAL/BF',
      refNo: '-',
      receiptNo: '-',
      debit: '-',
      credit: '-',
      balance: formatMoney(openingBalance),
    }, { bold: true });
    
    for (const row of transResult.rows) {
      const debit = parseFloat(row.debit) || 0;
      const credit = parseFloat(row.credit) || 0;
      runningBalance = runningBalance + credit - debit;
      totalDebit += debit;
      totalCredit += credit;
      
      if (y > 700) {
        doc.addPage();
        y = 50;
        y = drawTransactionHeader(y);
      }
      
      y = drawTransactionRow(y, {
        date: row.trans_date || '-',
        description: row.item || 'Transaction',
        refNo: row.reference_no || '-',
        receiptNo: row.receipt_no || '-',
        debit: debit > 0 ? formatMoney(debit) : '-',
        credit: credit > 0 ? formatMoney(credit) : '-',
        balance: formatMoney(runningBalance),
      });
    }
    
    if (y > 680) {
      doc.addPage();
      y = drawTransactionHeader(50);
    }
    y += 4;
    y = drawTransactionRow(y, {
      date: '',
      description: 'TOTALS',
      refNo: '',
      receiptNo: '',
      debit: formatMoney(totalDebit),
      credit: formatMoney(totalCredit),
      balance: formatMoney(runningBalance),
    }, { bold: true });
    y = drawTransactionRow(y, {
      date: '',
      description: 'CLOSING BALANCE',
      refNo: '',
      receiptNo: '',
      debit: '',
      credit: '',
      balance: formatMoney(runningBalance),
    }, { bold: true });
    doc.y = y + 10;
    
    drawReportFooter();
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
  console.log(`🚀 PROXY SERVER RUNNING on port ${port}`);
  console.log(`${'='.repeat(60)}`);
  console.log(`📍 URL: http://localhost:${port}`);
  console.log(`\n🌱 Spring Boot backend: ${SPRING_API_BASE}`);
  console.log(`🔄 Live remote server:  ${LIVE_API_BASE}`);
  console.log(`\n✅ SPRING BOOT ENDPOINTS (→ localhost:8080):`);
  console.log(`   POST   /api/v1/auth/registerOtp  →  POST /api/v1/auth/registerOtp`);
  console.log(`   POST   /api/v1/auth/change-password  →  PUT /api/v1/auth/changePassword`);
  console.log(`   POST   /api/v1/auth/authenticate`);
  console.log(`   POST   /api/v1/auth/register`);
  console.log(`\n📄 LOCAL ENDPOINTS (handled here):`);
  console.log(`   POST   /api/v1/loan-statement-direct`);
  console.log(`   POST   /api/v1/withdrawable-statement-direct`);
  console.log(`\n🧪 TEST ENDPOINT: http://localhost:${port}/api/v1/test`);
  console.log(`${'='.repeat(60)}\n`);
});



