const { test } = require('node:test');
const assert = require('node:assert/strict');
const { recordManualAttendance } = require('../functions/attendanceManual');
const { isBiometricDeviceCredentialValid } = require('../functions/identityCenter');
const crypto = require('node:crypto');

function fixture() {
  const rows = new Map([
    ['employees/e', { companyId: 'co', position: 'Kinh doanh' }],
    ['companies/co', { attendanceWifiSsid: 'Office', attendanceWifiBssid: 'aa:bb:cc:dd:ee:01' }],
    ['identity_accounts/id/devices/d', { trusted: true, biometricEnabled: true }],
  ]);
  const ref = path => ({ path, collection: key => ({ doc: id => ref(`${path}/${key}/${id || 'log'}`) }) });
  let tail = Promise.resolve();
  const db = { collection: key => ({ doc: id => ref(`${key}/${id || 'log'}`) }), runTransaction: run => {
    const result = tail.then(() => run({ get: async r => ({ exists: rows.has(r.path), data: () => rows.get(r.path) }), set: (r, data) => rows.set(r.path, { ...rows.get(r.path), ...data }) }));
    tail = result.catch(() => {}); return result;
  } };
  const args = { db, collectionPath: (_, col) => col, appId: 'test', identity: { id: 'id', appUserId: 'e', companyId: 'co', accountType: 'employee' }, device: { deviceId: 'd' }, deviceSecret: 'secret', verifyDevice: (device, secret) => device.trusted && secret === 'secret', action: 'in', method: { type: 'wifi', ssid: 'Office', bssid: 'aa:bb:cc:dd:ee:01' }, now: new Date('2026-10-04T01:00:00Z') };
  return { rows, args };
}
test('server date/time, duplicate and checkout are authoritative', async () => {
  const { args, rows } = fixture();
  const results = await Promise.all([recordManualAttendance(args), recordManualAttendance(args)]);
  assert.deepEqual(results.map(r => r.duplicate), [false, true]);
  assert.equal(rows.get('attendance/2026-10-04_e').checkIn, '2026-10-04T01:00:00.000Z');
  const out = await recordManualAttendance({ ...args, action: 'out', now: new Date('2026-10-04T10:00:00Z') });
  assert.equal(out.record.checkOut, '2026-10-04T10:00:00.000Z');
});
for (const [name, change] of [
  ['wrong wifi', f => { f.args.method.ssid = 'Other'; }],
  ['untrusted device', f => { f.rows.get('identity_accounts/id/devices/d').trusted = false; }],
  ['wrong tenant', f => { f.rows.get('employees/e').companyId = 'other'; }],
  ['wrong secret', f => { f.args.deviceSecret = 'wrong'; }],
  ['unassigned role', f => { f.args.workRole = 'Tài xế'; }],
  ['locked payroll', f => { f.rows.set('payrollPeriods/payroll_co_2026-10', { status: 'LOCKED' }); }],
  ['no checkin', f => { f.args.action = 'out'; }],
  ['outside shift', f => { f.args.now = new Date('2026-10-04T19:00:00Z'); }],
  ['gps required', f => { f.rows.get('employees/e').attendanceGpsRequired = true; }],
  ['biometric required', f => { f.rows.get('companies/co').attendanceBiometricRequired = true; f.rows.get('identity_accounts/id/devices/d').biometricEnabled = false; }],
]) test(name, async () => { const f = fixture(); change(f); await assert.rejects(recordManualAttendance(f.args)); assert.equal([...f.rows.keys()].some(k => k.startsWith('attendance/')), false); });

test('device credentials expire and password changes invalidate them independently of other devices', () => {
  const args = { identity: { status: 'active', credentialVersion: 2, setup: { biometricEnabled: false } }, deviceRecord: { trusted: true, biometricEnabled: true, credentialVersion: 2, deviceSecretHash: crypto.createHash('sha256').update('secret').digest('hex') }, deviceSecret: 'secret', biometricProof: true };
  assert.equal(isBiometricDeviceCredentialValid(args), true);
  assert.equal(isBiometricDeviceCredentialValid({ ...args, identity: { ...args.identity, credentialVersion: 3 } }), false);
  assert.equal(isBiometricDeviceCredentialValid({ ...args, deviceRecord: { ...args.deviceRecord, expiresAtIso: '2020-01-01T00:00:00Z' } }), false);
});

test('self leave remains available, but never overwrites a clock-in', async () => {
  const f = fixture();
  const leave = await recordManualAttendance({ ...f.args, action: 'leave', method: {} });
  assert.equal(leave.record.status, 'leave');
  assert.equal(leave.record.checkIn, null);
  assert.equal((await recordManualAttendance({ ...f.args, action: 'leave', method: {} })).duplicate, true);
  const other = fixture();
  await recordManualAttendance(other.args);
  await assert.rejects(recordManualAttendance({ ...other.args, action: 'leave', method: {} }));
});
