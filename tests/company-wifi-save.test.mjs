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
