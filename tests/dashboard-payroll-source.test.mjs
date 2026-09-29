import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getLockedPayrollPeriod } from '../src/utils/payrollPeriodLock.js';
const source = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const body = source.slice(source.indexOf('const buildDashboardPayrollCostRows ='), source.indexOf('const compareLedgerItems ='));
const dateKey = value => {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
};
let liveCalls = 0;
const bindings = {
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
const build = new Function(...Object.keys(bindings), `${body}; return buildDashboardPayrollCostRows;`)(...Object.values(bindings));
const base = { company: { id: 'a' }, employees: [{ id: 'e', name: 'A' }], now: new Date(2026,0,31) };
assert.equal(build(base).reduce((s,r)=>s+r.amount,0), 110);
const periods = [{companyId:'a', monthKey:'2026-01', status:'locked'}];
liveCalls = 0;
const rows = build({...base, payrollPeriods: periods, lockedPayroll: {'2026-01': {snapshots:[{employeeId:'e',employee:{name:'A'},salaryDetails:{grossSalary:500,totalPenalty:25,attendanceEntries:[]}}]}}});
assert.equal(rows.reduce((s,r)=>s+r.amount,0), 475);
assert.equal(liveCalls, 0);
assert.equal(build({...base, payrollPeriods:periods}).length,0);
console.log('PASS: report uses locked payroll snapshot, live evaluation bonus, and never recalculates locked payroll.');
