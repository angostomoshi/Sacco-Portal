const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'proxy-server.js'), 'utf8');
const start = source.indexOf('function buildStkCallbackRaw');
const end = source.indexOf('// ============================================\n// LOCAL ENDPOINT: M-PESA PAYMENT STATUS', start);
const helperSource = source.slice(start, end);

async function invoke({ callbackResultCode = '0', purpose = 'loan_repayment' } = {}) {
  const queries = [];
  let released = false;
  let receiptQueued = false;

  const client = {
    query: async (sql, values) => {
      queries.push({ sql, values });
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [], rowCount: 0 };
      if (sql.includes('FROM pb_mpesa_transactions') && sql.includes('FOR UPDATE')) {
        return {
          rows: [{
            id: 44,
            member_no: 'MS041',
            purpose,
            account_reference: '1467/2026',
            amount: '10.00',
            status: 'pending',
            ledger_posted: false,
          }],
        };
      }
      if (sql.includes('FROM mpesa_stk_call_back')) {
        return {
          rows: [{
            id: '9',
            foreign_id: 'foreign-id',
            transaction_date: callbackResultCode === '0' ? '20260914122651' : null,
            result_code: callbackResultCode,
            result_desc: callbackResultCode === '0'
              ? 'The service request is processed successfully.'
              : 'The balance is insufficient for the transaction.',
            mpesa_receipt_no: callbackResultCode === '0' ? 'UIE3W73JJ9' : null,
            customer_phone_number: callbackResultCode === '0' ? '254702890446' : null,
            amount: callbackResultCode === '0' ? '10.00' : null,
            merchant_request_id: 'merchant-id',
            checkout_request_id: 'ws_CO_TEST',
          }],
        };
      }
      return { rows: [], rowCount: 1 };
    },
    release: () => { released = true; },
  };

  const context = {
    dbPool: { connect: async () => client },
    console: { error() {}, warn() {} },
    setImmediate(fn) { receiptQueued = true; fn(); },
    sendPaymentReceipt: async () => {},
  };

  vm.runInNewContext(`${helperSource}; globalThis.run = reconcileMpesaTransactionFromStkLog;`, context);
  const result = await context.run('ws_CO_TEST', 'MS041');
  return { result, queries, released, receiptQueued };
}

test('STK status reconciliation lets the Sacco receipt trigger post accounting', async () => {
  const { result, queries, released, receiptQueued } = await invoke();
  assert.equal(result, true);
  assert.ok(!queries.some(q => q.sql.includes('INSERT INTO ac_debtors')));
  const firstUpdate = queries.find(q => q.sql.includes("SET status = 'success'"));
  assert.ok(firstUpdate.sql.includes('mpesa_receipt_no = $4'));
  assert.ok(!/\breceipt_no\s*=\s*\$4/.test(firstUpdate.sql));
  assert.ok(queries.some(q => q.sql.includes('receipted = true') && q.sql.includes('ledger_posted = true')));
  assert.equal(queries.at(-1).sql, 'COMMIT');
  assert.ok(released);
  assert.ok(receiptQueued);
});

test('STK status reconciliation lets member deposit Sacco receipt trigger post accounting', async () => {
  const { result, queries, released, receiptQueued } = await invoke({ purpose: 'member_deposit' });
  assert.equal(result, true);
  assert.ok(!queries.some(q => q.sql.includes('INSERT INTO ac_wdeposit_payable')));
  const firstUpdate = queries.find(q => q.sql.includes("SET status = 'success'"));
  assert.ok(firstUpdate.sql.includes("purpose IN ('loan_repayment', 'member_deposit')"));
  assert.ok(firstUpdate.sql.includes('mpesa_receipt_no = $4'));
  assert.ok(!/\breceipt_no\s*=\s*\$4/.test(firstUpdate.sql));
  assert.ok(queries.some(q => q.sql.includes('receipted = true') && q.sql.includes('ledger_posted = true')));
  assert.equal(queries.at(-1).sql, 'COMMIT');
  assert.ok(released);
  assert.ok(receiptQueued);
});

test('STK status reconciliation records failed callback-log rows without ledger posting', async () => {
  const { result, queries, receiptQueued } = await invoke({ callbackResultCode: '1' });
  assert.equal(result, true);
  assert.ok(queries.some(q => q.sql.includes('SET status = $2')));
  assert.ok(!queries.some(q => q.sql.includes('INSERT INTO ac_debtors')));
  assert.equal(queries.at(-1).sql, 'COMMIT');
  assert.equal(receiptQueued, false);
});
