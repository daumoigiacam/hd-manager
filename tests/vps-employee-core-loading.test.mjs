import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHdConnectStagingApi } from '../src/api/hdConnectStaging.js';
import { readCompleteVpsCollection } from '../src/api/vpsCompleteCollection.js';
import { hydrateVpsEmployeeProfiles, saveVpsEmployeeProfile } from '../src/api/vpsEmployees.js';

const COMPANY = 'd1baaf33-cd5a-4b6a-84a6-d432c231a5c4';
const SALES = '1c0fc8af-1bab-42af-b3e2-de71b11059f8';
const OTHER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const session = { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', companyId: COMPANY, permissions: ['hr.employee.read', 'hr.payroll.read'] };
const directoryRow = (patch = {}) => ({ id: SALES, companyId: COMPANY, fullName: 'Qa Sales Disposable', position: 'Kinh doanh', status: 'ACTIVE', deletedAt: null, hireDate: null, ...patch });
const page = (items, patch = {}) => ({ items, pagination: { page: 1, limit: 100, totalItems: items.length, totalPages: 1, hasNextPage: false, hasPreviousPage: false, ...patch } });
const profile = (id = SALES, patch = {}) => ({ id, companyId: COMPANY, userId: null, identityStatus: 'NO_LOGIN', version: '2026-09-06T01:00:00.000Z', profile: { name: 'Qa Sales Disposable', position: 'Kinh doanh', basicSalary: 10000000 }, ...patch });
const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const core = app.slice(app.indexOf('    const loadCoreVpsData ='), app.indexOf('    void loadCoreVpsData();'));

async function coreLoad({ directory = async () => page([directoryRow()]), readProfile = async id => profile(id), previous = [], actor = session, cancelAfterDirectory = false } = {}) {
  let employees = previous;
  let loaded;
  let status;
  let cancelled = false;
  const calls = [];
  const api = createHdConnectStagingApi({ get: async (path, options) => {
    calls.push({ path, options });
    if (path === '/hr-suite/employees') {
      const result = await directory(options.query);
      if (cancelAfterDirectory) cancelled = true;
      return result;
    }
    if (path.startsWith('/hr-suite/manager-employees/')) return readProfile(path.split('/').at(-1));
    throw new Error(`Unexpected API read: ${path}`);
  } });
  api.getInventoryReconciliationStatus = async () => ({});
  api.getManagerSettings = async () => ({ companyId: COMPANY, settings: {}, version: 'v1' });
  const bindings = {
    currentUser: actor, api, hydrateVpsEmployeeProfiles,
    readComplete: async method => method === 'listEmployees'
      ? readCompleteVpsCollection(query => api.listEmployees(query), { companyId: COMPANY, cancelled: () => cancelled })
      : { items: [] },
    loadVpsHolidays: async () => ({ items: [] }), mergeVpsHolidays: old => old,
    normalizeVpsAttendance: item => item,
    setRawEmployees: update => { employees = typeof update === 'function' ? update(employees) : update; },
    setLoadedCollections: update => { loaded = update({}); },
    setRealtimeStatus: value => { status = value; },
  };
  for (const name of ['setCurrentCompany', 'setRawCompanies', 'setRawCustomers', 'setRawCustomerLoans', 'setRawOrders', 'setRawPayments', 'setRawProducts', 'setVpsMasterData', 'setRawNotifications', 'setRawAttendance', 'setVpsInventoryReconciliation', 'setRawHolidays']) bindings[name] = () => {};
  await new Function(...Object.keys(bindings), `let cancelled = false; let loading = false;\n${core}\nreturn loadCoreVpsData();`)(...Object.values(bindings));
  return { employees, loaded, status, calls };
}

test('actual directory adapter and complete reader preserve native Sales identity after a fresh core load', async () => {
  const result = await coreLoad();
  assert.equal(result.employees.length, 1);
  assert.equal(result.employees[0].id, SALES);
  assert.equal(result.employees[0].name, 'Qa Sales Disposable');
  assert.equal(result.employees[0].position, 'Kinh doanh');
  assert.equal(result.employees[0].vpsEmployee, true);
  assert.equal(result.employees[0].basicSalary, 10000000);
  assert.equal(result.employees[0].vpsProfileLoadFailed, false);
  assert.equal(result.loaded.employees, true);
  assert.equal(result.status.state, 'polling');
  assert.deepEqual(result.calls[0].options.query, { sortBy: 'createdAt', sortOrder: 'asc', page: 1, limit: 100 });
  const visible = result.employees.filter(e => e.companyId === COMPANY && !e.isArchived);
  assert.equal(visible.filter(e => e.position === 'Kinh doanh').length, 1);
});

test('one unrelated private-profile failure cannot discard the verified native employee directory', async () => {
  const result = await coreLoad({
    directory: async () => page([directoryRow(), directoryRow({ id: OTHER, fullName: 'Other Employee', position: 'Driver' })]),
    readProfile: async id => { if (id === OTHER) throw new Error('profile unavailable'); return profile(id); },
  });
  assert.equal(result.employees.length, 2);
  assert.equal(result.employees[0].name, 'Qa Sales Disposable');
  assert.equal(result.employees[0].basicSalary, 10000000);
  assert.equal(result.employees[1].name, 'Other Employee');
  assert.equal(result.employees[1].vpsProfileLoadFailed, true);
  assert.equal(result.employees[1].basicSalary, undefined);
  assert.equal(result.employees[1].vpsProfileVersion, undefined);
  assert.equal(result.loaded.employees, false);
  assert.match(result.status.error, /employee-profiles/);
  assert.equal(result.status.state, 'degraded');
});

test('failed private reads retain authoritative Sales fields and known salary, but block edits until reconciled', async () => {
  for (const previous of [[], [{ ...directoryRow(), name: 'Old', basicSalary: 12000000, vpsProfileVersion: 'old', vpsEmployee: true }]]) {
    const result = await coreLoad({ previous, readProfile: async () => { throw new Error('profile read failed'); } });
    const employee = result.employees[0];
    assert.equal(employee.name, 'Qa Sales Disposable');
    assert.equal(employee.position, 'Kinh doanh');
    assert.equal(employee.basicSalary, previous[0]?.basicSalary);
    assert.equal(employee.vpsProfileVersion, undefined);
    assert.equal(result.loaded.employees, false);
    await assert.rejects(saveVpsEmployeeProfile({ updateManagerEmployee: () => assert.fail('Incomplete profile must not save') }, COMPANY, employee, { name: 'Changed' }));
    const recovered = await coreLoad({ previous: result.employees });
    assert.equal(recovered.employees[0].vpsProfileLoadFailed, false);
    assert.equal(recovered.loaded.employees, true);
    assert.equal(recovered.employees[0].basicSalary, 10000000);
  }
});

test('directory failures, missing pagination and tenant mismatches remain explicit without fallback data', async () => {
  const previous = [{ id: OTHER, companyId: COMPANY, name: 'Retained' }];
  for (const directory of [
    async () => { throw new Error('403 forbidden'); },
    async () => { throw new Error('404 missing API'); },
    async () => ({ items: [directoryRow()] }),
    async () => page([directoryRow({ companyId: OTHER })]),
    async () => page([directoryRow()], { totalItems: 2 }),
  ]) {
    const result = await coreLoad({ directory, previous, readProfile: () => assert.fail('Unverified directory must not hydrate') });
    assert.equal(result.employees, previous);
    assert.equal(result.loaded.employees, false);
    assert.match(result.status.error, /employees/);
    assert.equal(result.status.state, 'degraded');
  }
});

test('profile scope mismatches do not overwrite verified directory fields or fabricate private salary', async () => {
  for (const response of [profile(SALES, { companyId: OTHER }), profile(OTHER), profile(SALES, { version: undefined })]) {
    const result = await coreLoad({ readProfile: async () => response });
    assert.equal(result.employees[0].id, SALES);
    assert.equal(result.employees[0].companyId, COMPANY);
    assert.equal(result.employees[0].position, 'Kinh doanh');
    assert.equal(result.employees[0].basicSalary, undefined);
    assert.equal(result.loaded.employees, false);
  }
});

test('directory-only permission never requests private profiles and a verified empty read clears stale identity placeholders', async () => {
  const result = await coreLoad({ actor: { ...session, permissions: ['hr.employee.read'] }, readProfile: () => assert.fail('Private permission required') });
  assert.equal(result.employees[0].name, 'Qa Sales Disposable');
  assert.equal(result.employees[0].position, 'Kinh doanh');
  assert.equal(result.employees[0].basicSalary, undefined);
  assert.equal(result.employees[0].vpsProfileVersion, undefined);
  assert.equal(result.calls.length, 1);
  const empty = await coreLoad({ directory: async () => page([]), previous: [{ ...session, isArchived: false }] });
  assert.deepEqual(empty.employees, []);
  assert.equal(empty.loaded.employees, true);
});

test('multi-page directory loads fully with bounded profile fan-out and cancelled reads never publish', async () => {
  const rows = Array.from({ length: 101 }, (_, i) => directoryRow({ id: `employee-${i}` }));
  let active = 0;
  let maximum = 0;
  const result = await coreLoad({
    directory: async query => page(rows.slice((query.page - 1) * 100, query.page * 100), { totalItems: 101, page: query.page, totalPages: 2, hasNextPage: query.page === 1 }),
    readProfile: async id => {
      active++;
      maximum = Math.max(maximum, active);
      await new Promise(resolve => setTimeout(resolve, 1));
      active--;
      return profile(id);
    },
  });
  assert.equal(result.employees.length, 101);
  assert.equal(result.loaded.employees, true);
  assert.equal(maximum, 4);
  const previous = [];
  assert.equal((await coreLoad({ previous, cancelAfterDirectory: true })).employees, previous);
});

test('App HR domain reads have no employee setter and core reload follows session identity and permissions', () => {
  const domain = app.slice(app.indexOf('      hr: [', app.indexOf('const definitionsByModule')), app.indexOf('      payroll: [', app.indexOf('const definitionsByModule')));
  assert.match(domain, /api\.listEmployees\(query\)/);
  assert.doesNotMatch(domain, /apply:|setRawEmployees/);
  const effectEnd = app.slice(app.indexOf('    void loadCoreVpsData();'), app.indexOf("const historyMethod = activeTab"));
  assert.match(effectEnd, /\[currentUser\?\.companyId, currentUser\?\.id, currentUser\?\.permissions\]/);
  const clearIndex = app.indexOf('      setRawEmployees([]);');
  const firebaseEffect = app.slice(app.lastIndexOf('  useEffect(() => {', clearIndex), clearIndex);
  assert.match(firebaseEffect, /if \(isVpsApiMode \|\| !firebaseUser/);
  assert.match(app, /rawEmployees\.filter\(e => e\.companyId === myCompanyId && !e\.isArchived\)/);
});
