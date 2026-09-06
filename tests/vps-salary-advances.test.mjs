import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  approveVpsSalaryAdvance,
  cancelVpsSalaryAdvance,
  createVpsSalaryAdvance,
  loadVpsSalaryAdvances,
  mergeVpsSalaryAdvanceFinancials,
  mergeVpsSalaryAdvances,
  normalizeVpsSalaryAdvance,
  vpsSalaryAdvanceFinancial,
  vpsSalaryAdvanceMutationPayload,
} from '../src/api/vpsSalaryAdvances.js';

const COMPANY = '11111111-1111-4111-8111-111111111111';
const EMPLOYEE = '22222222-2222-4222-8222-222222222222';
const USER = '33333333-3333-4333-8333-333333333333';
const ADVANCE = '44444444-4444-4444-8444-444444444444';
const REQUEST = '55555555-5555-4555-8555-555555555555';
const NOW = '2026-09-06T01:02:03.004Z';
const session = {
  id: USER,
  companyId: COMPANY,
  permissions: ['hr.payroll.read', 'hr.payroll.manage'],
};

const response = (patch = {}) => ({
  id: ADVANCE,
  companyId: COMPANY,
  employeeId: EMPLOYEE,
  salaryMonth: '2026-09',
  amount: 2500000,
  reason: 'Salary advance',
  status: 'PENDING',
  requestReference: REQUEST,
  version: 1,
  requestedAt: NOW,
  requestedByUserId: USER,
  approvedAt: null,
  approvedByUserId: null,
  rejectedAt: null,
  rejectedByUserId: null,
  cancelledAt: null,
  cancelledByUserId: null,
  isArchived: false,
  archivedAt: null,
  createdAt: NOW,
  updatedAt: NOW,
  ...patch,
});

test('validates immutable client intent and rejects server-owned fields', () => {
  const payload = vpsSalaryAdvanceMutationPayload('create', {
    requestId: REQUEST,
    employeeId: EMPLOYEE,
    salaryMonth: '2026-09',
    amount: 2500000,
    reason: '  Salary advance  ',
  });
  assert.deepEqual(payload, {
    requestId: REQUEST,
    employeeId: EMPLOYEE,
    salaryMonth: '2026-09',
    amount: 2500000,
    reason: 'Salary advance',
  });
  for (const value of [
    { requestId: REQUEST, employeeId: EMPLOYEE, salaryMonth: '2026-09', amount: 2500000, reason: 'OK', companyId: COMPANY },
    { requestId: REQUEST, employeeId: EMPLOYEE, salaryMonth: '2026-09', amount: 1.001, reason: 'OK' },
    { requestId: REQUEST, employeeId: 'employee_legacy', salaryMonth: '2026-09', amount: 1, reason: 'OK' },
  ]) assert.throws(() => vpsSalaryAdvanceMutationPayload('create', value));
});

test('loads complete tenant-scoped pages and fails closed on foreign or duplicate records', async () => {
  const all = Array.from({ length: 101 }, (_, index) => response({
    id: `66666666-6666-4666-8666-${String(index).padStart(12, '0')}`,
  }));
  const loaded = await loadVpsSalaryAdvances({
    listManagerSalaryAdvances: async query => ({
      items: all.slice(Number(query.offset), Number(query.offset) + 100),
      nextOffset: Number(query.offset) === 0 ? 100 : null,
    }),
  }, session);
  assert.equal(loaded.items.length, 101);
  assert.equal(loaded.items[0].status, 'pending');
  await assert.rejects(loadVpsSalaryAdvances({
    listManagerSalaryAdvances: async () => ({ items: [response({ companyId: '77777777-7777-4777-8777-777777777777' })], nextOffset: null }),
  }, session));
});

test('approval produces the payroll adjustment only after a native approval', () => {
  const pending = normalizeVpsSalaryAdvance(response());
  assert.equal(vpsSalaryAdvanceFinancial(pending), null);
  const approved = normalizeVpsSalaryAdvance(response({
    status: 'APPROVED',
    version: 2,
    approvedAt: NOW,
    approvedByUserId: USER,
    updatedAt: '2026-09-06T01:03:03.004Z',
  }));
  const financial = vpsSalaryAdvanceFinancial(approved);
  assert.deepEqual(financial, {
    id: `vps-advance:${ADVANCE}`,
    companyId: COMPANY,
    empId: EMPLOYEE,
    employeeId: EMPLOYEE,
    type: 'advance',
    amount: 2500000,
    reason: 'Salary advance',
    date: '2026-09-06',
    salaryMonth: '2026-09',
    isArchived: false,
    sourceType: 'salary_advance_request',
    linkedAdvanceRequestId: ADVANCE,
    reviewedByEmpId: USER,
    createdAt: NOW,
    updatedAt: '2026-09-06T01:03:03.004Z',
    vpsSalaryAdvance: true,
  });
  assert.deepEqual(
    mergeVpsSalaryAdvanceFinancials([], [approved], COMPANY),
    [financial],
  );
});

test('create retries retain the request UUID and never allow a cross-tenant target', async () => {
  const calls = [];
  const api = {
    createManagerSalaryAdvance: async body => {
      calls.push(body);
      if (calls.length === 1) throw new Error('offline');
      return response({ requestReference: body.requestId });
    },
  };
  const data = { empId: EMPLOYEE, salaryMonth: '2026-09', amount: 2500000, reason: 'Salary advance' };
  await assert.rejects(createVpsSalaryAdvance(api, session, data));
  await createVpsSalaryAdvance(api, session, data);
  assert.equal(calls[0].requestId, calls[1].requestId);
  await assert.rejects(createVpsSalaryAdvance(api, { ...session, companyId: '77777777-7777-4777-8777-777777777777' }, { ...data, empId: 'foreign_employee' }));
});

test('approve and cancel use explicit server transitions, merge one native row and do not touch Firebase', async () => {
  const pending = normalizeVpsSalaryAdvance(response());
  const calls = [];
  const api = {
    approveManagerSalaryAdvance: async (id, body) => {
      calls.push(['approve', id, body]);
      return response({ status: 'APPROVED', version: 2, approvedAt: NOW, approvedByUserId: USER, updatedAt: '2026-09-06T01:03:03.004Z' });
    },
    cancelManagerSalaryAdvance: async (id, body) => {
      calls.push(['cancel', id, body]);
      return response({ status: 'CANCELLED', version: 2, cancelledAt: NOW, cancelledByUserId: USER, updatedAt: '2026-09-06T01:03:03.004Z' });
    },
  };
  const approved = await approveVpsSalaryAdvance(api, session, pending);
  assert.equal(approved.status, 'approved');
  const cancelled = await cancelVpsSalaryAdvance(api, session, pending);
  assert.equal(cancelled.status, 'cancelled');
  assert.deepEqual(mergeVpsSalaryAdvances([pending], [approved], COMPANY), [approved]);
  assert.equal(calls[0][0], 'approve');
  assert.equal(calls[1][0], 'cancel');
  assert.ok(calls.every(([, id, body]) => id === ADVANCE && Object.keys(body).length === 1 && typeof body.requestId === 'string'));
});

test('root handlers select the VPS adapter before any Firebase path', () => {
  const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  for (const handler of ['handleAddAdvanceRequest', 'handleApproveAdvance', 'handleRejectAdvance', 'handleDeleteAdvance']) {
    const start = app.indexOf(`  const ${handler} =`);
    const source = app.slice(start, app.indexOf('\n  const ', start + 1));
    assert.match(source, /if \(isVpsApiMode\)/);
    assert.ok(source.indexOf('if (isVpsApiMode)') < source.indexOf('if (!firebaseUser)'));
  }
  assert.match(app, /loadVpsSalaryAdvances\(api, currentUser/);
  assert.match(app, /mergeVpsSalaryAdvanceFinancials/);
});
