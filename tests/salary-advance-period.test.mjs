import assert from 'node:assert/strict';
import {
  getSalaryAdvanceMonth,
  isSalaryAdvanceInMonth,
  normalizeSalaryAdvanceMonth
} from '../src/utils/salaryAdvancePeriod.js';

assert.equal(normalizeSalaryAdvanceMonth('2026-08'), '2026-08');
assert.equal(normalizeSalaryAdvanceMonth('2026-08-31'), '2026-08');
assert.equal(normalizeSalaryAdvanceMonth('2026-13'), '');

assert.equal(getSalaryAdvanceMonth({ salaryMonth: '2026-09', date: '2026-08-10' }), '2026-09');
assert.equal(getSalaryAdvanceMonth({ deductionMonth: '2026-10', date: '2026-08-10' }), '2026-10');
assert.equal(getSalaryAdvanceMonth({ date: '2026-07-15' }), '2026-07');
assert.equal(getSalaryAdvanceMonth({ createdAt: '2026-06-30T23:59:59+07:00' }), '2026-06');

assert.equal(isSalaryAdvanceInMonth({ salaryMonth: '2026-09', date: '2026-08-10' }, '2026-09'), true);
assert.equal(isSalaryAdvanceInMonth({ salaryMonth: '2026-09', date: '2026-08-10' }, '2026-08'), false);
assert.equal(isSalaryAdvanceInMonth({ date: '2026-08-10' }, '2026-08'), true);
assert.equal(isSalaryAdvanceInMonth({}, '2026-08'), false);

console.log('Salary advance period tests passed.');
