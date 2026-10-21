const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('src/components/savingsStatementPdf.js', 'utf8')
  .replace("import jsPDF from 'jspdf';", "const { jsPDF } = require('jspdf');")
  .replace('export function', 'function');
const context = { require };
vm.runInNewContext(source + '\nglobalThis.createPdf = createSavingsStatementPdf;', context);
const row = i => ({ inputDate: '2026-10-05', narration: `Deposit-${i}`, ref: `REF${i}`, savings: 100, runningAmt: (i + 1) * 100 });
const create = transactions => context.createPdf({ member: { accNo: 'TEST001', holdersName: 'Test Member' }, transactions, totalSavings: transactions.length * 100 });
test('short statement contains member, transaction and total as PDF text', () => {
  const pdf = create([row(0)]);
  const output = pdf.output();
  for (const value of ['TEST001', 'Test Member', 'Deposit-0', 'REF0', 'TOTAL SAVINGS: KES 100.00', 'Page 1 of 1']) assert.ok(output.includes(value), value);
  assert.equal(pdf.internal.getNumberOfPages(), 1);
});
test('long statement preserves every transaction across multiple pages', () => {
  const pdf = create(Array.from({ length: 300 }, (_, i) => row(i)));
  const output = pdf.output();
  assert.ok(pdf.internal.getNumberOfPages() > 1);
  for (let i = 0; i < 300; i++) assert.ok(output.includes(`(REF${i})`), `Missing row ${i}`);
  assert.ok(output.includes('TOTAL SAVINGS: KES 30,000.00'));
  assert.equal((output.match(/\(Input Date\)/g) || []).length, pdf.internal.getNumberOfPages());
});
test('oversized narration spans pages and retains its ending and totals', () => {
  const pdf = create([{ ...row(0), narration: 'Long narration '.repeat(2000) + 'ENDMARKER' }]);
  assert.ok(pdf.internal.getNumberOfPages() > 1);
  assert.ok(pdf.output().includes('ENDMARKER'));
  assert.ok(pdf.output().includes('TOTAL SAVINGS'));
});
test('empty statement is rejected instead of saving a blank PDF', () => {
  assert.throws(() => create([]), /No savings transactions/);
});
