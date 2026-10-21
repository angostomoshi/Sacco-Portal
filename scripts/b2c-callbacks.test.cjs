const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'proxy-server.js'), 'utf8');

function loadHandler(route, dbPool) {
  const start = source.indexOf(`app.post('${route}',`);
  assert.ok(start >= 0);
  const end = source.indexOf('\n});', start) + 4;
  let handler;
  vm.runInNewContext(source.slice(start, end), {
    app: { post: (_, fn) => { handler = fn; } },
    dbPool,
    process: { env: { MPESA_B2C_SHORTCODE: '3011803' } },
    getEmergencyAdvanceMemberGroup: () => 'TEST GROUP',
    getNextVoucherNo: async () => 'VCE-TEST',
    getNextInterestReferenceNo: async () => 'INT-TEST',
    EMERGENCY_ADVANCE_DEBTOR_CODE: '20-23-131',
    EMERGENCY_ADVANCE_PURPOSE: 'METRO SACCO EMERGENCY ADVANCE',
    EMERGENCY_ADVANCE_ACCOUNTING_USER: 'b2c_user',
    EMERGENCY_ADVANCE_INTEREST_CODE: '80-00-006',
    MPESA_B2C_GL_CODE: '20-25-011',
    setImmediate() {},
    extractB2CResultParameters: () => ({}),
    console: { error() {} },
  });
  return handler;
}

async function invoke(route, dbPool) {
  const response = {
    status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; },
  };
  await loadHandler(route, dbPool)({ body: { Result: {
    OriginatorConversationID: 'test-origin', ConversationID: 'test-conversation', ResultCode: 0,
    TransactionID: 'TEST-RECEIPT',
  } } }, response);
  return response;
}

for (const route of ['/api/v1/mpesa/b2c/result', '/api/v1/mpesa/b2c/timeout']) {
  test(`${route}: unavailable database returns 503`, async () => {
    const response = await invoke(route, { connect: async () => { throw Error('offline'); } });
    if (route === '/api/v1/mpesa/b2c/timeout') {
      assert.equal(response.code, 200);
      assert.equal(response.body.ResultCode, 0);
    } else {
      assert.equal(response.code, 503);
      assert.equal(response.body.ResultCode, 1);
    }
  });

  test(`${route}: write failure rolls back and releases connection`, async () => {
    const queries = [];
    let released = false;
    const response = await invoke(route, { connect: async () => ({
      query: async (sql) => {
        queries.push(sql);
        if (sql.includes('UPDATE')) throw Error('write failure');
        return { rows: [] };
      },
      release: () => { released = true; },
    }) });
    if (route === '/api/v1/mpesa/b2c/timeout') {
      assert.equal(response.code, 200);
      assert.equal(response.body.ResultCode, 0);
    } else {
      assert.equal(response.code, 503);
      assert.ok(queries.includes('ROLLBACK'));
      assert.ok(!queries.includes('COMMIT'));
      assert.ok(released);
    }
  });
}

test('timeout only updates unposted pending payouts and preserves the loan', async () => {
  const queries = [];
  const response = await invoke('/api/v1/mpesa/b2c/timeout', { connect: async () => ({
    query: async (sql) => { queries.push(sql); return { rows: [{ loan_no: 'test' }] }; },
    release() {},
  }) });
  const update = queries.find(sql => sql.includes('UPDATE'));
  assert.match(update, /WHERE \(originator_conversation_id = \$1 OR conversation_id = \$2\)/);
  assert.match(update, /AND ledger_posted = false/);
  assert.match(update, /AND status = 'pending'/);
  assert.ok(!queries.some(sql => sql.includes('DELETE')));
  assert.ok(queries.includes('COMMIT'));
  assert.equal(response.code, 200);
});

test('timeout acknowledges even when the database is unavailable', async () => {
  const response = await invoke('/api/v1/mpesa/b2c/timeout', { connect: async () => { throw Error('offline'); } });
  assert.equal(response.code, 200);
  assert.equal(response.body.ResultCode, 0);
  assert.equal(response.body.ResultDesc, 'Accepted');
});

test('already posted result is acknowledged without another posting', async () => {
  const queries = [];
  const response = await invoke('/api/v1/mpesa/b2c/result', { connect: async () => ({
    query: async (sql) => { queries.push(sql); return { rows: [] }; },
    release() {},
  }) });
  assert.equal(queries.length, 3);
  assert.match(queries[1], /AND ledger_posted = false/);
  assert.equal(queries[2], 'COMMIT');
  assert.equal(response.code, 200);
});

test('top-level B2C TransactionID is saved as the receipt', async () => {
  let updateValues;
  await invoke('/api/v1/mpesa/b2c/result', { connect: async () => ({
    query: async (sql, values) => {
      if (sql.includes('UPDATE')) updateValues = values;
      return { rows: [] };
    },
    release() {},
  }) });
  assert.equal(updateValues[5], 'TEST-RECEIPT');
});

test('B2C success posts principal, interest and cashbook with correct loan references', async () => {
  const queries = [];
  const response = await invoke('/api/v1/mpesa/b2c/result', { connect: async () => ({
    query: async (sql, values) => {
      queries.push({ sql, values });
      if (sql.includes('RETURNING id')) return { rows: [{
        id: 1, loan_no: 'TEST/2026', member_no: 'TEST', amount: '5000', charge: '117', total_repayable: '5117',
      }] };
      if (sql.includes('SELECT holders_name')) return { rows: [{ holders_name: 'Test Member' }] };
      return { rows: [] };
    },
    release() {},
  }) });
  assert.equal(response.code, 200);
  const principal = queries.find(q => q.sql.includes('INSERT INTO ac_debtors') && q.sql.includes("'Payments'"));
  const interest = queries.find(q => q.sql.includes('INSERT INTO ac_debtors') && q.sql.includes('Instant Advance Interest'));
  const ledger = queries.find(q => q.sql.includes('INSERT INTO ac_ledger'));
  const cashbook = queries.find(q => q.sql.includes('INSERT INTO ac_cash_book'));
  assert.equal(principal.values[8], '5000');
  assert.equal(principal.values[9], 'TEST/2026');
  assert.equal(principal.values[6], 'VCE-TEST');
  assert.equal(principal.values[7], 'TEST-RECEIPT');
  assert.match(interest.sql, /'Interest', \$8, 0/);
  assert.match(interest.sql, /now\(\), \$9, 'Debtors'/);
  assert.equal(interest.values[7], '117');
  assert.equal(interest.values[8], 'TEST/2026');
  assert.equal(ledger.values[9], '117');
  assert.equal(cashbook.values[9], '5000');
  assert.equal(queries.at(-1).sql, 'COMMIT');
});
