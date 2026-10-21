const path = require('node:path');
require('dotenv').config({
  path: path.join(__dirname, '..', '.env'),
  quiet: true,
  override: true,
});
const axios = require('axios');
const { getMpesaRuntime } = require('../lib/mpesa-runtime');

async function main() {
  const checkoutRequestId = process.argv[2];
  if (!checkoutRequestId || !/^ws_CO_[A-Za-z0-9_]+$/.test(checkoutRequestId)) {
    throw new Error('Supply an existing ws_CO_ checkout request ID.');
  }
  const runtime = getMpesaRuntime(process.env);
  const shortcode = process.env.MPESA_SHORTCODE;
  const timestamp = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Nairobi', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date());
  const parts = Object.fromEntries(timestamp.map(p => [p.type, p.value]));
  const stamp = ['year', 'month', 'day', 'hour', 'minute', 'second'].map(k => parts[k]).join('');
  const token = await axios.get(`${runtime.baseUrl}/oauth/v1/generate?grant_type=client_credentials`, {
    auth: { username: process.env.MPESA_CONSUMER_KEY, password: process.env.MPESA_CONSUMER_SECRET },
    timeout: 15000,
  });
  const response = await axios.post(`${runtime.baseUrl}/mpesa/stkpushquery/v1/query`, {
    BusinessShortCode: shortcode,
    Password: Buffer.from(`${shortcode}${process.env.MPESA_PASSKEY}${stamp}`).toString('base64'),
    Timestamp: stamp,
    CheckoutRequestID: checkoutRequestId,
  }, { headers: { Authorization: `Bearer ${token.data.access_token}` }, timeout: 20000 });
  const data = response.data;
  console.log(JSON.stringify({
    environment: runtime.environment, apiHost: new URL(runtime.baseUrl).host,
    shortcode, checkoutRequestId, httpStatus: response.status,
    responseCode: data.ResponseCode, responseDescription: data.ResponseDescription,
    resultCode: data.ResultCode, resultDescription: data.ResultDesc,
    errorCode: data.errorCode, errorMessage: data.errorMessage,
  }, null, 2));
}

main().catch(error => {
  console.error(JSON.stringify({
    httpStatus: error.response?.status, errorCode: error.response?.data?.errorCode || error.code,
    message: error.response?.data?.errorMessage || 'Status query failed. No payment initiated.',
  }));
  process.exitCode = 1;
});
