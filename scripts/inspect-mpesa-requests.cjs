const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { getMpesaRuntime, describeMpesaRequest } = require('../lib/mpesa-runtime');
const env = require('dotenv').parse(fs.readFileSync(path.join(__dirname, '..', '.env')));
const source = fs.readFileSync(path.join(__dirname, '..', 'proxy-server.js'), 'utf8');
const start = source.indexOf('function buildMpesaTimestamp()');
const end = source.indexOf('function normalizeProtocol(', start);
const runtime = getMpesaRuntime(env);
const captured = [];
const tokenRequests = [];
const context = {
  process: { env }, Buffer, URL, mpesaRuntime: runtime, MPESA_BASE_URL: runtime.baseUrl,
  describeMpesaRequest, console: { log() {} },
  getMpesaAccessToken: async (options = {}) => {
    tokenRequests.push({
      cacheKey: options.cacheKey || 'default',
      usesB2CConsumerKey: options.consumerKey === env.MPESA_B2C_CONSUMER_KEY,
      usesB2CConsumerSecret: options.consumerSecret === env.MPESA_B2C_CONSUMER_SECRET,
    });
    return 'MOCK-TOKEN';
  },
  axios: { post: async (url, body) => {
    captured.push({ url, body });
    return { data: { ResponseCode: '0', CheckoutRequestID: 'MOCK-CHECKOUT' } };
  } },
};
vm.runInNewContext(source.slice(start, end), context);

(async () => {
  await context.initiateStkPush({ phoneNo: '254700000000', amount: 10,
    accountReference: '1467/2026', transactionDesc: 'Loan 1467/2026' });
  await context.initiateB2CPayment({ originatorConversationId: 'MOCK-ORIGIN', phoneNo: '254700000000',
    amount: 10, remarks: 'Mock inspection', occasion: 'TEST' });
  const [stk, b2c] = captured;
  assert.equal(stk.body.BusinessShortCode, env.MPESA_SHORTCODE);
  assert.equal(stk.body.PartyB, env.MPESA_SHORTCODE);
  assert.equal(stk.body.CallBackURL, env.MPESA_CALLBACK_URL);
  assert.equal(stk.body.Password, Buffer.from(`${env.MPESA_SHORTCODE}${env.MPESA_PASSKEY}${stk.body.Timestamp}`).toString('base64'));
  assert.equal(b2c.body.PartyA, env.MPESA_B2C_SHORTCODE);
  assert.equal(b2c.body.InitiatorName, env.MPESA_B2C_INITIATOR_NAME);
  assert.equal(b2c.body.SecurityCredential, env.MPESA_B2C_SECURITY_CREDENTIAL);
  assert.equal(b2c.body.ResultURL, env.MPESA_B2C_RESULT_URL);
  assert.equal(b2c.body.QueueTimeOutURL, env.MPESA_B2C_TIMEOUT_URL);
  assert.deepEqual(tokenRequests, [
    { cacheKey: 'default', usesB2CConsumerKey: false, usesB2CConsumerSecret: false },
    { cacheKey: 'b2c', usesB2CConsumerKey: true, usesB2CConsumerSecret: true },
  ]);
  console.log(JSON.stringify({ mockOnly: true, environment: runtime.environment,
    stk: { url: stk.url, shortcode: stk.body.BusinessShortCode, partyB: stk.body.PartyB,
      transactionType: stk.body.TransactionType, callbackHost: new URL(stk.body.CallBackURL).host },
    b2c: { url: b2c.url, partyA: b2c.body.PartyA, command: b2c.body.CommandID,
      callbackHost: new URL(b2c.body.ResultURL).host },
    tokenSeparation: 'STK uses default credentials; B2C uses B2C credentials',
    credentialAndCallbackFieldsMatchEnv: true,
  }, null, 2));
})().catch(() => { console.error('Mock request verification failed. No network calls were made.'); process.exitCode = 1; });
