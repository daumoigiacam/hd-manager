import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { createAutoWifiAttendanceController } from '../src/utils/autoWifiAttendance.js';

const require = createRequire(import.meta.url);
const { recordAutoWifiAttendance } = require('../functions/attendanceAutoWifi.js');
const company = { id: 'company-a', attendanceWifiEnabled: true, attendanceWifiSsid: 'HD', attendanceWifiBssid: 'aa:bb:cc:dd:ee:01' };
const employee = { id: 'emp-1', companyId: company.id, position: 'Sản xuất', attendanceAutoWifiEnabled: true, shiftStart: '08:00', shiftEnd: '17:00' };
const claims = { accountType: 'employee', appUserId: employee.id, companyId: company.id };
const network = { ssid: 'HD', bssid: company.attendanceWifiBssid, supported: true };
const serverNow = new Date('2026-10-01T01:00:00Z');
const confirmed = { success: true, created: true, workDate: '2026-10-01', checkIn: serverNow.toISOString(), status: 'present', retryAfterMs: 3600000,
  checkInMethod: 'WiFi: HD', checkInMethodMeta: { type: 'wifi', automatic: true } };
const deferred = () => { let resolve; const promise = new Promise(value => { resolve = value; }); return { promise, resolve }; };

function client(changes = {}) {
  const stats = { permissions: 0, networks: 0, requests: 0, records: [], statuses: [] };
  let clock = serverNow.getTime();
  const context = { native: true, employee: { ...employee }, company: { ...company } };
  const worker = createAutoWifiAttendanceController({
    getContext: () => context, now: () => clock,
    getPermission: async () => { stats.permissions++; return { granted: true }; },
    getNetwork: async () => { stats.networks++; return network; },
    requestCheckIn: async () => { stats.requests++; return confirmed; },
    onRecorded: value => stats.records.push(value), onStatus: value => stats.statuses.push(value), ...changes
  });
  return { worker, stats, context, advance: ms => { clock += ms; } };
}

test('event storm is single-flight, acknowledged shift avoids all repeated bridge/API calls', async () => {
  const state = client();
  await Promise.all(Array.from({ length: 100 }, () => state.worker.attempt()));
  for (let minute = 0; minute < 59; minute++) { state.advance(60000); await state.worker.attempt(); }
  assert.equal(state.stats.permissions, 1);
  assert.equal(state.stats.networks, 1);
  assert.equal(state.stats.requests, 1);
  assert.equal(state.stats.records.length, 1);
  assert.equal(state.stats.records[0].checkIn, serverNow.toISOString());
  state.advance(120000);
  await state.worker.attempt();
  assert.equal(state.stats.requests, 2, 'expired server window must be checked again');
  state.worker.stop();
});

test('wrong network, browser, permission refusal and opt-out never send check-in', async () => {
  for (const change of ['network', 'browser', 'permission', 'opt-out', 'tenant', 'archived']) {
    let requests = 0;
    const state = client({ requestCheckIn: async () => { requests++; return confirmed; },
      ...(change === 'network' ? { getNetwork: async () => ({ ...network, bssid: 'aa:bb:cc:dd:ee:02' }) } : {}),
      ...(change === 'permission' ? { getPermission: async () => ({ granted: false }) } : {}) });
    if (change === 'browser') state.context.native = false;
    if (change === 'opt-out') state.context.employee.attendanceAutoWifiEnabled = false;
    if (change === 'tenant') state.context.employee.companyId = 'other';
    if (change === 'archived') state.context.employee.isArchived = true;
    await state.worker.attempt();
    assert.equal(requests, 0, change);
    state.worker.stop();
  }
});

test('network settles during a running attempt: coalesced follow-up does not lose the connection event', async () => {
  const gate = deferred();
  let reads = 0;
  let requests = 0;
  const state = client({ getNetwork: async () => ++reads === 1 ? gate.promise : network,
    requestCheckIn: async () => { requests++; return confirmed; } });
  const first = state.worker.attempt();
  await Promise.resolve();
  const event = state.worker.attempt();
  gate.resolve({ supported: false, message: 'Not connected' });
  await Promise.all([first, event]);
  await state.worker.attempt();
  assert.equal(requests, 1);
  assert.equal(state.stats.records.length, 1);
  state.worker.stop();
});

test('offline error is not success; next connected attempt can recover, no unlimited spinner', async () => {
  let requests = 0;
  const state = client({ requestCheckIn: async () => { if (++requests === 1) throw new Error('offline'); return confirmed; } });
  await state.worker.attempt();
  assert.equal(state.stats.records.length, 0);
  assert.match(state.stats.statuses[0], /chưa được xác nhận/);
  state.advance(60000);
  await state.worker.attempt();
  assert.equal(state.stats.records.length, 1);
  state.worker.stop();
  const hanging = client({ getPermission: () => new Promise(() => {}), timeoutMs: 15 });
  await hanging.worker.attempt();
  assert.equal(hanging.stats.requests, 0);
  assert.match(hanging.stats.statuses[0], /chưa được xác nhận/);
  hanging.worker.stop();
});

test('logout and background abort pending requests and cannot publish late success', async () => {
  for (const stop of ['logout', 'background']) {
    const gate = deferred();
    const started = deferred();
    let signal;
    const state = client({ requestCheckIn: async (_, value) => { signal = value; started.resolve(); return gate.promise; } });
    const attempt = state.worker.attempt();
    await started.promise;
    if (stop === 'logout') state.worker.stop();
    else await state.worker.setActive(false);
    assert.equal(signal.aborted, true);
    gate.resolve(confirmed);
    await attempt;
    assert.equal(state.stats.records.length, 0);
    assert.deepEqual(state.stats.statuses, []);
    state.worker.stop();
  }
});

test('outside-shift response suppresses polling; company configuration changes invalidate the wait', async () => {
  let requests = 0;
  const state = client({ requestCheckIn: async () => { requests++; return { success: true, created: false, reason: 'outside_shift', retryAfterMs: 3600000 }; } });
  await state.worker.attempt();
  state.advance(60000);
  await state.worker.attempt();
  assert.equal(requests, 1);
  state.context.employee.shiftStart = '09:00';
  await state.worker.attempt();
  assert.equal(requests, 2);
  state.worker.stop();
});

const path = (_, collection) => collection;
function database({ record, period, employeePatch = {}, companyPatch = {} } = {}) {
  const documents = new Map([[`companies/${company.id}`, { ...company, ...companyPatch }], [`employees/${employee.id}`, { ...employee, ...employeePatch }]]);
  const recordKey = `attendance/2026-10-01_${employee.id}`;
  if (record) documents.set(recordKey, structuredClone(record));
  if (period) documents.set('payrollPeriods/payroll_company-a_2026-10', period);
  const writes = [];
  let locked = Promise.resolve();
  const db = {
    collection: collection => ({ doc: id => ({ id, path: `${collection}/${id}` }) }),
    runTransaction: operation => {
      const result = locked.then(async () => {
        const pending = [];
        const value = await operation({
          get: async ref => ({ id: ref.id, exists: documents.has(ref.path), data: () => documents.get(ref.path) }),
          set: (ref, data, options) => pending.push({ ref, data, options })
        });
        for (const write of pending) {
          writes.push(write);
          documents.set(write.ref.path, { ...(documents.get(write.ref.path) || {}), ...write.data });
        }
        return value;
      });
      locked = result.catch(() => {});
      return result;
    }
  };
  return { db, documents, writes, recordKey };
}
const recordAttendance = (state, changes = {}) => recordAutoWifiAttendance({ db: state.db, collectionPath: path, appId: 'test', claims, network, now: serverNow, ...changes });

test('transaction records server time once, returns original time on duplicate, preserves secondary role and one notification', async () => {
  const roles = { 'Tài xế': { checkIn: '2026-10-01T00:00:00Z', status: 'present' } };
  const state = database({ record: { companyId: company.id, workRoles: roles } });
  const results = await Promise.all(Array.from({ length: 20 }, () => recordAttendance(state)));
  assert.equal(results.filter(value => value.created).length, 1);
  assert.ok(results.every(value => value.checkIn === serverNow.toISOString()));
  assert.deepEqual(state.documents.get(state.recordKey).workRoles, roles);
  assert.equal(state.writes.filter(write => write.ref.path.startsWith('notifications/')).length, 1);
  const repeat = await recordAttendance(state, { now: new Date('2026-10-01T02:00:00Z') });
  assert.equal(repeat.checkIn, serverNow.toISOString());
  assert.equal(repeat.checkInMethodMeta.automatic, true);
});

test('transaction gates cannot write locked payroll, GPS-only, wrong WiFi, leave, foreign record, archived employee', async () => {
  const scenarios = [
    [{ period: { status: 'LOCKED' } }, {}, 'payroll_locked'],
    [{ employeePatch: { attendanceGpsRequired: true } }, {}, 'gps_required'],
    [{}, { network: { ...network, bssid: 'aa:bb:cc:dd:ee:02' } }, 'wifi_mismatch'],
    [{ record: { status: 'leave', companyId: company.id } }, {}, 'already_recorded'],
    [{ record: { companyId: 'other' } }, {}, 'tenant_or_identity'],
    [{ employeePatch: { isArchived: true } }, {}, 'disabled']
  ];
  for (const [fixture, changes, reason] of scenarios) {
    const state = database(fixture);
    const result = await recordAttendance(state, changes);
    assert.equal(result.reason, reason);
    assert.equal(result.created, false);
    assert.equal(state.writes.length, 0);
  }
});

test('already-clocked GPS record keeps its method and time instead of relabeling as automatic WiFi', async () => {
  const record = { companyId: company.id, checkIn: '2026-10-01T00:59:00Z', status: 'present', checkInMethod: 'GPS', checkInMethodMeta: { type: 'gps' } };
  const state = database({ record });
  const result = await recordAttendance(state);
  assert.equal(result.checkInMethod, 'GPS');
  assert.deepEqual(result.checkInMethodMeta, { type: 'gps' });
  assert.deepEqual(state.documents.get(state.recordKey), record);
});
