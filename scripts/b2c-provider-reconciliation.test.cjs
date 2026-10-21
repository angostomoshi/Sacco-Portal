const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'proxy-server.js'), 'utf8');
const start = source.indexOf('async function postEmergencyAdvanceB2CResult');
const end = source.indexOf("app.get('/api/v1/mpesa/b2c/status/:conversationId'", start);
const helperSource = source.slice(start, end);

test('B2C provider log reconciliation posts successful pending advance once', async () => {
  const queries = [];
  let released = false;
  let receiptQueued = false;
  const client = {
    query: async (sql, values) => {
      queries.push({ sql, values });
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };
      if (sql.includes('FROM pb_mpesa_b2c_transactions') && sql.includes('FOR UPDATE')) {
        return { rows: [{
          id: 21,
          originator_conversation_id: 'ORIGIN',
          conversation_id: 'CONV',
          loan_no: '1714/2026',
          member_no: 'MS041',
          amount: 1000,
          charge: 23,
          total_repayable: 1023,
          status: 'pending',
          ledger_posted: false,
        }] };
      }
      if (sql.includes('FROM mpesa_b2c_transactions')) {
        return { rows: [{
          originator_conversationid: 'ORIGIN',
          conversationid: 'CONV',
          result_code: '0',
          result_desc: 'The service request is processed successfully.',
          transactionid: 'UIEED68C57',
          transaction_receipt: 'UIEED68C57',
          transaction_amount: 1000,
        }] };
      }
      if (sql.includes('FROM pb_share_register')) return { rows: [{ holders_name: 'Test Member' }] };
      if (sql.includes('SELECT nextval')) return { rows: [{ next_no: 'VCE999' }] };
      if (sql.includes('MAX')) return { rows: [{ next_no: 'INT999' }] };
      return { rows: [], rowCount: 1 };
    },
    release: () => { released = true; },
  };

  const context = {
    dbPool: { connect: async () => client },
    process: { env: { MPESA_B2C_SHORTCODE: '3011803' } },
    console: { error() {}, warn() {} },
    setImmediate(fn) { receiptQueued = true; fn(); },
    sendEmergencyAdvanceReceipt: async () => {},
    getEmergencyAdvanceMemberGroup: () => 'Members',
    getNextVoucherNo: async () => 'VCE999',
    getNextInterestReferenceNo: async () => 'INT999',
    EMERGENCY_ADVANCE_DEBTOR_CODE: '20-23-131',
    EMERGENCY_ADVANCE_PURPOSE: 'METRO SACCO EMERGENCY ADVANCE',
    EMERGENCY_ADVANCE_ACCOUNTING_USER: 'b2c_user',
    EMERGENCY_ADVANCE_INTEREST_CODE: '80-00-006',
    MPESA_B2C_GL_CODE: '20-25-011',
  };

  vm.runInNewContext(`${helperSource}; globalThis.run = reconcileB2CTransactionFromProviderLog;`, context);
  const result = await context.run('ORIGIN', 'MS041');

  assert.equal(result, true);
  assert.ok(queries.some(q => q.sql.includes("SET status = 'success'")));
  assert.ok(queries.some(q => q.sql.includes('INSERT INTO ac_debtors')));
  assert.ok(queries.some(q => q.sql.includes('INSERT INTO ac_cash_book')));
  assert.ok(queries.some(q => q.sql.includes('ledger_posted = true')));
  assert.equal(queries.at(-1).sql, 'COMMIT');
  assert.ok(receiptQueued);
  assert.ok(released);
});
