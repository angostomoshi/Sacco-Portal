const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'proxy-server.js'), 'utf8');
const start = source.indexOf('const EMERGENCY_ADVANCE_PURPOSE');
const end = source.indexOf('function getEmergencyAdvanceMemberGroup', start);
const context = {};

vm.runInNewContext(`${source.slice(start, end)}; globalThis.calculate = calculateEmergencyAdvance;`, context);

test('Emergency Advance charge has a KES 100 minimum', () => {
  assert.deepEqual({ ...context.calculate(1000, 7) }, {
    principal: 1000,
    charge: 100,
    proratedCharge: 23,
    minimumCharge: 100,
    total: 1100,
    periodDays: 7,
  });
});

test('Emergency Advance charge still scales above the minimum', () => {
  assert.deepEqual({ ...context.calculate(5000, 21) }, {
    principal: 5000,
    charge: 350,
    proratedCharge: 350,
    minimumCharge: 100,
    total: 5350,
    periodDays: 21,
  });
});

test('30-day Emergency Advance uses the full monthly charge', () => {
  assert.deepEqual({ ...context.calculate(5000, 30) }, {
    principal: 5000,
    charge: 500,
    proratedCharge: 500,
    minimumCharge: 100,
    total: 5500,
    periodDays: 30,
  });
});
