const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { getMpesaRuntime, describeMpesaRequest } = require('../lib/mpesa-runtime');

test('production selects live API, including whitespace and case variants', () => {
  for (const value of ['production', ' Production ']) {
    assert.equal(getMpesaRuntime({ MPESA_ENV: value }).baseUrl, 'https://api.safaricom.co.ke');
  }
  assert.equal(getMpesaRuntime({ MPESA_ENV: 'sandbox' }).baseUrl, 'https://sandbox.safaricom.co.ke');
});

test('missing or misspelled environment cannot silently select sandbox', () => {
  for (const value of [undefined, '', 'live', 'prodution']) {
    assert.throws(() => getMpesaRuntime({ MPESA_ENV: value }), /MPESA_ENV/);
  }
});

test('request diagnostics exclude callback paths, query secrets and credentials', () => {
  const runtime = getMpesaRuntime({ MPESA_ENV: 'production' });
  const detail = describeMpesaRequest(runtime, 'STK', '777215', 'https://example.com/private-id?key=private-secret');
  assert.equal(detail.apiHost, 'api.safaricom.co.ke');
  assert.equal(detail.shortcode, '777215');
  assert.equal(detail.callbackHost, 'example.com');
  assert.ok(!JSON.stringify(detail).includes('private'));
  assert.throws(() => describeMpesaRequest(runtime, 'STK', '777215', 'http://example.com'), /HTTPS/);
  assert.throws(() => describeMpesaRequest(runtime, 'STK', 'N/A', 'https://example.com'), /shortcode/);
});

test('pending B2C results never claim a successful disbursement', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'proxy-server.js'), 'utf8');
  const start = source.indexOf('function getFriendlyB2CResultMessage(');
  const end = source.indexOf('\napp.get(', start);
  const message = vm.runInNewContext(source.slice(start, end) + ';getFriendlyB2CResultMessage');
  assert.match(message(null, null), /pending/);
  assert.match(message(undefined, null), /pending/);
  assert.match(message(0, ''), /successfully/);
});

test('external STK callbacks cannot generate incorrect B2C callback paths', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'proxy-server.js'), 'utf8');
  const start = source.indexOf('function getB2CConfig()');
  const end = source.indexOf('\nasync function initiateB2CPayment', start);
  const env = { MPESA_CALLBACK_URL: 'https://example.com/stk/integration/callback' };
  const config = vm.runInNewContext(source.slice(start, end) + ';getB2CConfig()', { process: { env } });
  assert.equal(config.resultUrl, '');
  assert.equal(config.timeoutUrl, '');
  assert.equal(config.enabled, false);
});
