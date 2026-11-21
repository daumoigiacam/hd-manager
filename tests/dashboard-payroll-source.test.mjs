import assert from 'node:assert/strict';
import { getLockedPayrollPeriod } from '../src/utils/payrollPeriodLock.js';
import { buildEmployeeReviewSourceIndexes } from '../src/utils/employeeReviewSourceIndex.js';
import { appFunction } from './helpers/app-source-function.mjs';
const toDateInputString = value => {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
};
const dateKey = appFunction('getDateKeyFromAnyValue', {toDateInputString, parseEntityTimestampValue: () => null, parseVietnameseDateTimeString: () => null});
assert.equal(dateKey(new Date(2026, 9, 1)), '2026-10-01');
assert.equal(dateKey(new Date(NaN)), '');
assert.equal(dateKey({ toDate: () => new Date(2026, 9, 1) }), '2026-10-01');
let liveCalls = 0;
const bindings = {
  buildEmployeeReviewSourceIndexes,
  getDateKeyFromAnyValue: dateKey,
  applyEmployeePayrollPolicyForMonth: e => e,
  getLockedPayrollPeriod,
  normalizeEmployeeReviewMonthKey: v => String(v || '').slice(0,7),
  getEmployeeReviewCriteriaList: () => [],
  isOwnerPosition: () => false,
  buildSalaryDetails: (...args) => { if (args[9] !== '2026-01') return null; liveCalls++; return { grossSalary: 100, totalPenalty: 10, attendanceEntries: [] }; },
  buildEmployeeReviewSummary: () => ({}),
  projectEvaluationSummaryToPayroll: () => ({}),
  applyEvaluationBonusToSalaryDetails: d => d && ({ ...d, grossSalary: d.grossSalary + 20 }),
  roundMoneyValue: Math.round,
};
const steps = appFunction('buildDashboardPayrollCostSteps', bindings);
const build = options => { const iterator = steps(options); for (;;) {const row = iterator.next(); if (row.done) return row.value;} };
const base = { company: { id: 'a' }, employees: [{ id: 'e', name: 'A' }], now: new Date(2026,0,31) };
assert.equal(build(base).reduce((s,r)=>s+r.amount,0), 110);
const periods = [{companyId:'a', monthKey:'2026-01', status:'locked'}];
liveCalls = 0;
const rows = build({...base, payrollPeriods: periods, lockedPayroll: {'2026-01': {snapshots:[{employeeId:'e',employee:{name:'A'},salaryDetails:{grossSalary:500,totalPenalty:25,attendanceEntries:[]}}]}}});
assert.equal(rows.reduce((s,r)=>s+r.amount,0), 475);
assert.equal(liveCalls, 0);
assert.equal(build({...base, payrollPeriods:periods}).length,0);
console.log('PASS: report uses locked payroll snapshot, live evaluation bonus, and never recalculates locked payroll.');
