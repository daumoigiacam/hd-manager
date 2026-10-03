import assert from 'node:assert/strict';
import test from 'node:test';
import { appFunction } from './helpers/app-source-function.mjs';
import { canManageCompanyWifi, isUsableAttendanceBssid } from '../src/utils/attendanceWifi.js';

test('company WiFi reads only on click, locks repeat clicks and waits for ACK', async () => {
  let reads = 0, writes = 0, saving = false, message = '', acknowledge;
  const ack = new Promise(resolve => { acknowledge = resolve; });
  const bindings = {
    currentEmployee: { role: 'admin' }, canManageCompanyWifi, isUsableAttendanceBssid,
    companyWifiSaveRef: { current: false },
    onUpdateCompanySettings: async patch => { writes++; assert.equal(patch.attendanceWifiSsid, 'Current'); return ack; },
    isAndroidNativeRuntime: () => true,
    WifiInfo: { requestWifiPermissions: async () => ({ granted: true }) },
    setWifiPermission() {},
    getCurrentConnectedWifiForAttendance: async () => { reads++; return { supported: true, ssid: 'Current', bssid: 'aa:bb:cc:dd:ee:01' }; },
    withTimeout: promise => promise, normalizeWifiName: value => String(value || '').trim(),
    setSelfWifiLabel() {}, setSelfWifiLookup() {},
    setCompanyWifiSaving: value => { saving = value; },
    setSelfStatusMsg: value => { message = value; },
    getFriendlyFirebaseErrorMessage: error => error.message,
  };
  const save = appFunction('handleSaveDefaultAttendanceWifi', bindings);
  assert.equal(reads, 0);
  const pending = save();
  await save();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(reads, 1); assert.equal(writes, 1); assert.equal(saving, true); assert.equal(message, '');
  acknowledge({ success: true }); await pending;
  assert.equal(saving, false); assert.match(message, /Đã đặt WiFi/);
  bindings.currentEmployee.role = 'employee';
  await save(); assert.equal(reads, 1); assert.equal(writes, 1);
});

for (const scenario of ['success', 'denied', 'network-error', 'save-error', 'double-click']) {
  test(`company WiFi save: ${scenario}`, async () => {
    const messages = [], writes = [], busy = [];
    const ref = { current: scenario === 'double-click' };
    const dependencies = {
      canManageCompanyWifi: () => true, currentEmployee: { role: 'owner' },
      onUpdateCompanySettings: async patch => { writes.push(patch); return { success: scenario !== 'save-error', message: 'server rejected' }; },
      companyWifiSaveRef: ref, setCompanyWifiSaving: value => busy.push(value),
      setSelfStatusMsg: value => messages.push(value), isAndroidNativeRuntime: () => true,
      withTimeout: promise => promise,
      WifiInfo: { requestWifiPermissions: async () => ({ granted: scenario !== 'denied' }) },
      setWifiPermission: () => {},
      getCurrentConnectedWifiForAttendance: async () => ({ supported: scenario !== 'network-error', ssid: 'Office', bssid: 'aa:bb:cc:dd:ee:01', message: 'location services disabled' }),
      normalizeWifiName: value => value, isUsableAttendanceBssid: () => true,
      setSelfWifiLabel: () => {}, setSelfWifiLookup: () => {},
      getFriendlyFirebaseErrorMessage: error => error.message,
    };
    await appFunction('handleSaveDefaultAttendanceWifi', dependencies)();
    assert.equal(writes.length, ['success', 'save-error'].includes(scenario) ? 1 : 0);
    if (scenario === 'success') assert.match(messages.at(-1), /Đã đặt WiFi/);
    if (scenario === 'denied') assert.match(messages.at(-1), /Chưa cấp quyền/);
    if (scenario === 'network-error') assert.equal(messages.at(-1), 'location services disabled');
    if (scenario === 'save-error') assert.equal(messages.at(-1), 'server rejected');
    if (scenario !== 'double-click') assert.equal(busy.at(-1), false);
  });
}
