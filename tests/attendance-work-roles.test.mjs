import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as roles from '../src/utils/attendanceWorkRoles.js';
import { appFunction } from './helpers/app-source-function.mjs';
import { doc, getDoc, setDoc, runTransaction } from '../src/mocks/firebase-firestore.js';
import { getLockedPayrollPeriod } from '../src/utils/payrollPeriodLock.js';

const employee = { id: 'role-test', companyId: 'role-company', position: 'Sản xuất', secondaryPositions: ['Tài xế', 'Xuất kho'],
  basicSalary: 2600000, salaryMonthDays: 26, probationRate: 100,
  roleSalaryComponents: [{ position: 'Tài xế', amount: 1300000 }, { position: 'Xuất kho', amount: 260000 }],
};
const present = { status: 'present', checkIn: '2026-10-01T07:30:00+07:00', checkOut: '2026-10-01T16:30:00+07:00' };
const timing = () => ({ noSalaryDay: false, latePenaltyAmount: 0, earlyOvertimeMinutes: 0, afterShiftOvertimeMinutes: 0 });
const attendance = {
  [`2026-10-01_${employee.id}`]: { ...present, workRoles: { 'Tài xế': present } },
  [`2026-10-02_${employee.id}`]: present,
  [`2026-09-30_${employee.id}`]: { ...present, workRoles: { 'Tài xế': present } },
};

test('legacy daily record belongs only to the primary job; role views and shifts stay separate', () => {
  assert.equal(roles.getWorkRoleRecord(present, 'Sản xuất', 'Tài xế'), null);
  assert.equal(roles.getWorkRoleRecord(present, 'Sản xuất'), present);
  assert.equal(roles.getWorkRoleRecord({ workRoles: { 'Tài xế': present } }, 'Sản xuất'), null);
  const view = roles.attendanceForWorkRole(attendance, employee, 'Tài xế');
  assert.equal(view[`2026-10-02_${employee.id}`], null);
  const tenantView = roles.attendanceForWorkRole({ [`2026-10-01_${employee.id}`]: {
    companyId: employee.companyId, workRoles: { 'Tài xế': present },
  } }, employee, 'Tài xế');
  assert.equal(tenantView[`2026-10-01_${employee.id}`].companyId, employee.companyId);
  const driver = roles.employeeForWorkRole({ ...employee, shiftStart: '23:00' }, 'Tài xế');
  assert.equal(driver.position, 'Tài xế');
  assert.equal(driver.shiftStart, '');
});

test('payroll uses two primary days and one driver day without paying other unclocked roles', () => {
  const calculate = appFunction('buildSalaryDetails', {
    ...roles, getTodayString: () => '2026-10-02', isSalesCollaboratorPosition: () => false,
    resolveSalaryMonthDays: e => e.salaryMonthDays, parseLooseMoneyValue: value => Number(value) || 0,
    roundMoneyValue: Math.round, resolveProbationEndDate: () => null, calculateAttendanceTiming: timing,
    parseDateInputValue: value => new Date(`${value}T00:00:00`), normalizeEmployeeRoleSalaryComponents: rows => rows,
    calculateExperienceSalaryAtDate: () => ({ total: 0 }), getMonthEndDateInputValue: month => `${month}-31`,
    isEmployeeSalesPosition: () => false, calculateDirectSalesCommission: () => 0,
  });
  const details = calculate(employee.id, [employee], attendance, [], {}, [], [], [], [], '2026-10');
  assert.equal(details.workDays, 2);
  assert.equal(details.baseSalaryCalc, 200000);
  assert.equal(details.roleSalary, 50000);
  assert.equal(details.roleSalaryRows[0].workDays, 1);
  assert.equal(details.roleSalaryRows[1].workDays, 0);
  assert.equal(details.grossSalary, 250000);
  assert.equal(details.netSalary, 250000);
});

test('role wages respect probation, leave, unpaid days and the employee standard days', () => {
  const entries = [
    { date: '2026-10-01', status: 'present' }, { date: '2026-10-02', status: 'late' },
    { date: '2026-10-03', status: 'leave' }, { date: '2026-10-04', status: 'present', noSalaryDay: true },
  ];
  assert.deepEqual(roles.calculateWorkRoleSalary(1300000, entries, 26, new Date('2026-10-01T00:00:00'), 0.8), {
    workDays: 2, workDaysProbation: 1, workDaysOfficial: 1, calculatedAmount: 90000,
  });
});

test('transactions preserve primary and other role records, duplicate check-in/out does not overwrite times', async () => {
  const payrollPeriods = [];
  const save = appFunction('saveWorkRoleAttendance', {
    ...roles, myCompanyId: employee.companyId, payrollPeriods, getLockedPayrollPeriod,
    getEmployeePositionValues: emp => [emp.position, ...emp.secondaryPositions],
    doc, db: {}, appId: 'role-test', runTransaction, withTimeout: promise => promise,
  });
  const ref = doc({}, 'artifacts', 'role-test', 'public', 'data', 'attendance', `2026-10-01_${employee.id}`);
  await setDoc(ref, { companyId: employee.companyId, ...present, workRoles: { 'Xuất kho': { ...present, workRole: 'Xuất kho' } } });
  await save(employee, '2026-10-01', 'Tài xế', { status: 'present', checkIn: present.checkIn }, 'in');
  await save(employee, '2026-10-01', 'Tài xế', { status: 'late', checkIn: 'changed' }, 'in');
  await save(employee, '2026-10-01', 'Tài xế', { checkOut: present.checkOut }, 'out');
  await save(employee, '2026-10-01', 'Tài xế', { checkOut: 'changed' }, 'out');
  const saved = (await getDoc(ref)).data();
  assert.equal(saved.checkIn, present.checkIn);
  assert.equal(saved.workRoles['Tài xế'].checkIn, present.checkIn);
  assert.equal(saved.workRoles['Tài xế'].checkOut, present.checkOut);
  assert.equal(saved.workRoles['Xuất kho'].checkIn, present.checkIn);
  await assert.rejects(save(employee, '2026-10-02', 'Tài xế', { checkOut: present.checkOut }, 'out'), /chưa được chấm vào/);
  await assert.rejects(save(employee, '2026-10-01', 'Kinh doanh', present), /chưa được phân công/);
  await assert.rejects(save({ ...employee, companyId: 'other-company' }, '2026-10-01', 'Tài xế', present), /không thuộc công ty/);
  const foreignRef = doc({}, 'artifacts', 'role-test', 'public', 'data', 'attendance', `2026-10-03_${employee.id}`);
  await setDoc(foreignRef, { companyId: 'other-company', ...present });
  await assert.rejects(save(employee, '2026-10-03', 'Tài xế', present), /không thuộc công ty/);
  payrollPeriods.push({ companyId: employee.companyId, monthKey: '2026-10', status: 'LOCKED' });
  await assert.rejects(save(employee, '2026-10-01', 'Tài xế', present), /Kỳ lương đã khóa/);
  assert.deepEqual((await getDoc(ref)).data(), saved);
});
