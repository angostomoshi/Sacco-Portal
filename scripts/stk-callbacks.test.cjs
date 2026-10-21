const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'proxy-server.js'), 'utf8');

async function invoke(callback, options = {}) {
  const start = source.indexOf("app.post('/api/v1/mpesa/callback',");
  const end = source.indexOf('\n});', start) + 4;
  let handler;
  const queries = [];
  let released = false;
  const client = {
    query: async (sql, values) => {
      queries.push({ sql, values });
      if (sql.includes('receipted = true') && options.failPosting) throw Error('posting unavailable');
      if (sql.includes('RETURNING id')) return { rows: options.duplicate ? [] : [{
        id: 1,
        member_no: 'TEST',
        purpose: options.purpose || 'loan_repayment',
        account_reference: options.purpose === 'member_deposit' ? 'TEST' : 'TEST-LOAN',
        amount: 10,
      }] };
      return { rows: [], rowCount: 1 };
    },
    release: () => { released = true; },
  };
  vm.runInNewContext(source.slice(start, end), {
    app: { post: (_, fn) => { handler = fn; } },
    process: { env: { MPESA_ENV: 'production', MPESA_CALLBACK_SECRET: options.secret || '' } },
    dbPool: { connect: async () => {
      if (options.offline) throw Error('offline');
      return client;
    }, query: client.query },
    extractMpesaCallbackMetadata: items => Object.fromEntries((items || []).map(i => [i.Name, i.Value])),
    console: { error() {}, warn() {} },
    setImmediate() {},
  });
  const response = { status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  await handler({ query: {}, body: { Body: { stkCallback: callback } } }, response);
  return { response, queries, released };
}

const valid = {
  CheckoutRequestID: 'TEST-CHECKOUT', ResultCode: 0,
  CallbackMetadata: { Item: [{ Name: 'MpesaReceiptNumber', Value: 'TEST-RECEIPT' }, { Name: 'Amount', Value: 10 }] },
};

test('successful loan callback lets the Sacco receipt trigger post accounting', async () => {
  const { response, queries, released } = await invoke(valid);
  assert.equal(response.code, 200);
  assert.ok(!queries.some(q => q.sql.includes('INSERT INTO ac_debtors')));
  const firstUpdate = queries.find(q => q.sql.includes('RETURNING id'));
  assert.ok(firstUpdate.sql.includes('mpesa_receipt_no = $4'));
  assert.ok(!/\breceipt_no\s*=\s*\$4/.test(firstUpdate.sql));
  assert.ok(queries.some(q => q.sql.includes('receipted = true') && q.sql.includes('ledger_posted = true')));
  assert.equal(queries.at(-1).sql, 'COMMIT');
  assert.ok(released);
});

test('successful member deposit callback lets the Sacco receipt trigger post accounting', async () => {
  const { response, queries } = await invoke(valid, { purpose: 'member_deposit' });
  assert.equal(response.code, 200);
  assert.ok(!queries.some(q => q.sql.includes('INSERT INTO ac_wdeposit_payable')));
  const firstUpdate = queries.find(q => q.sql.includes('RETURNING id'));
  assert.ok(firstUpdate.sql.includes("purpose IN ('loan_repayment', 'member_deposit')"));
  assert.ok(firstUpdate.sql.includes('mpesa_receipt_no = $4'));
  assert.ok(!/\breceipt_no\s*=\s*\$4/.test(firstUpdate.sql));
  assert.ok(queries.some(q => q.sql.includes('receipted = true') && q.sql.includes('ledger_posted = true')));
});

test('duplicate success does not insert another accounting entry', async () => {
  const { response, queries } = await invoke(valid, { duplicate: true });
  assert.equal(response.code, 200);
  assert.ok(!queries.some(q => q.sql.includes('INSERT')));
});

test('receipting update failure rolls back and returns 503', async () => {
  const { response, queries, released } = await invoke(valid, { failPosting: true });
  assert.equal(response.code, 503);
  assert.equal(queries.at(-1).sql, 'ROLLBACK');
  assert.ok(!queries.some(q => q.sql === 'COMMIT'));
  assert.ok(released);
});

test('database connection failure returns 503', async () => {
  assert.equal((await invoke(valid, { offline: true })).response.code, 503);
});

test('missing result code or payment metadata cannot credit a loan', async () => {
  for (const callback of [{ ...valid, ResultCode: null }, { ...valid, CallbackMetadata: {} }]) {
    const { response, queries } = await invoke(callback);
    assert.equal(response.code, 400);
    assert.equal(queries.length, 0);
  }
});

test('missing callback key is tolerated when the sender does not include it', async () => {
  const start = source.indexOf("app.post('/api/v1/mpesa/callback',");
  const end = source.indexOf('\n});', start) + 4;
  let handler;
  const queries = [];
  const client = {
    query: async (sql) => {
      queries.push(sql);
      return { rows: [{ id: 1, member_no: 'TEST', purpose: 'loan_repayment', account_reference: 'TEST-LOAN', amount: 10 }] };
    },
    release: () => {},
  };
  vm.runInNewContext(source.slice(start, end), {
    app: { post: (_, fn) => { handler = fn; } },
    process: { env: { MPESA_ENV: 'production', MPESA_CALLBACK_SECRET: 'live-secret' } },
    dbPool: { connect: async () => client, query: client.query },
    extractMpesaCallbackMetadata: items => Object.fromEntries((items || []).map(i => [i.Name, i.Value])),
    console: { error() {}, warn() {} },
    setImmediate() {},
  });
  const response = { status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  await handler({ query: {}, body: { Body: { stkCallback: valid } } }, response);
  assert.equal(response.code, 200);
  assert.ok(queries.some(sql => sql.includes('UPDATE pb_mpesa_transactions')));
});

test('invalid local callback key is rejected before database access', async () => {
  const start = source.indexOf("app.post('/api/v1/mpesa/callback',");
  const end = source.indexOf('\n});', start) + 4;
  let handler;
  const queries = [];
  const client = {
    query: async () => {
      queries.push('db');
      return { rows: [] };
    },
    release: () => {},
  };
  vm.runInNewContext(source.slice(start, end), {
    app: { post: (_, fn) => { handler = fn; } },
    process: { env: { MPESA_ENV: 'production', MPESA_CALLBACK_SECRET: 'live-secret' } },
    dbPool: { connect: async () => client, query: client.query },
    extractMpesaCallbackMetadata: items => Object.fromEntries((items || []).map(i => [i.Name, i.Value])),
    console: { error() {}, warn() {} },
    setImmediate() {},
  });
  const response = { status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  await handler({ query: { key: 'wrong-secret' }, body: { Body: { stkCallback: valid } } }, response);
  assert.equal(response.code, 403);
  assert.equal(queries.length, 0);
});
