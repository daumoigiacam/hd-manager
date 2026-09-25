import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { canAttemptAutoWifiCheckIn, matchesAttendanceWifi } from '../src/utils/attendanceWifi.js';

const require = createRequire(import.meta.url);
const { evaluateAutoWifiCheckIn, getShiftWindow, matchesCompanyWifi } = require('../functions/attendanceWifi.js');

const company = { id: 'company-a', attendanceWifiEnabled: true, attendanceWifiSsid: 'HD-CONNECT', attendanceWifiBssid: 'AA:BB:CC:DD:EE:01' };
const employee = { id: 'emp-1', companyId: 'company-a', attendanceAutoWifiEnabled: true, shiftStart: '08:00', shiftEnd: '17:00', graceMinutes: 5 };
const claims = { accountType: 'employee', companyId: 'company-a', appUserId: 'emp-1' };
const network = { ssid: 'HD-CONNECT', bssid: 'aa:bb:cc:dd:ee:01' };
const atShiftStart = new Date('2026-09-26T01:00:00.000Z');
const input = (changes = {}) => ({ claims, company, employee, network, record: {}, now: atShiftStart, ...changes });

test('client and server both require matching SSID and BSSID', () => {
  assert.equal(matchesAttendanceWifi(network, company), true);
  assert.equal(matchesCompanyWifi(network, company), true);
  for (const bad of [
    { ssid: 'OTHER', bssid: network.bssid },
    { ssid: network.ssid, bssid: 'aa:bb:cc:11:22:33' },
    { ssid: network.ssid, bssid: '' },
    { ssid: network.ssid, bssid: '02:00:00:00:00:00' }
  ]) {
    assert.equal(matchesAttendanceWifi(bad, company), false);
    assert.equal(matchesCompanyWifi(bad, company), false);
  }
  assert.equal(matchesAttendanceWifi(network, { ...company, attendanceWifiBssid: '' }), false);
});

test('permission, native runtime and employee opt-in gate client attempts', () => {
  const base = { native: true, employee, company, permissionGranted: true, network };
  assert.equal(canAttemptAutoWifiCheckIn(base), true);
  assert.equal(canAttemptAutoWifiCheckIn({ ...base, permissionGranted: false }), false);
  assert.equal(canAttemptAutoWifiCheckIn({ ...base, native: false }), false);
  assert.equal(canAttemptAutoWifiCheckIn({ ...base, employee: { ...employee, attendanceAutoWifiEnabled: false } }), false);
});

test('server decision rejects other tenants, identities, wrong WiFi, and repeat check-in', () => {
  assert.deepEqual(evaluateAutoWifiCheckIn(input()), { eligible: true, workDate: '2026-09-26', status: 'present' });
  assert.equal(evaluateAutoWifiCheckIn(input({ claims: { ...claims, companyId: 'company-b' } })).reason, 'tenant_or_identity');
  assert.equal(evaluateAutoWifiCheckIn(input({ claims: { ...claims, appUserId: 'emp-2' } })).reason, 'tenant_or_identity');
  assert.equal(evaluateAutoWifiCheckIn(input({ employee: { ...employee, companyId: 'company-b' } })).reason, 'tenant_or_identity');
  assert.equal(evaluateAutoWifiCheckIn(input({ network: { ...network, bssid: 'aa:bb:cc:11:22:33' } })).reason, 'wifi_mismatch');
  assert.equal(evaluateAutoWifiCheckIn(input({ record: { checkIn: '2026-09-26T01:00:00Z' } })).reason, 'already_recorded');
  assert.equal(evaluateAutoWifiCheckIn(input({ record: { status: 'leave' } })).reason, 'already_recorded');
});

test('server computes the shift window from server time, including an overnight shift', () => {
  assert.equal(evaluateAutoWifiCheckIn(input({ now: new Date('2026-09-26T11:00:00Z') })).reason, 'outside_shift');
  assert.equal(evaluateAutoWifiCheckIn(input({ now: new Date('2026-09-26T01:07:00Z') })).status, 'late');
  const night = { ...employee, shiftStart: '22:00', shiftEnd: '06:00' };
  assert.deepEqual(getShiftWindow(night, new Date('2026-09-26T16:00:00Z')).workDate, '2026-09-27');
  assert.equal(evaluateAutoWifiCheckIn(input({ employee: night, now: new Date('2026-09-26T16:00:00Z') })).eligible, true);
});

test('server uses role defaults when employee shift fields are unset', () => {
  const driver = { ...employee, position: 'Tài xế', shiftStart: null, shiftEnd: null, graceMinutes: null };
  assert.equal(evaluateAutoWifiCheckIn(input({ employee: driver, now: new Date('2026-09-26T00:00:00Z') })).eligible, true);
  assert.equal(evaluateAutoWifiCheckIn(input({ employee: driver, now: new Date('2026-09-25T23:38:00Z') })).status, 'present');
  assert.equal(evaluateAutoWifiCheckIn(input({ employee: driver, now: new Date('2026-09-25T23:41:00Z') })).status, 'late');
});

test('disabled setup and leave prevent auto check-in', () => {
  assert.equal(evaluateAutoWifiCheckIn(input({ employee: { ...employee, attendanceAutoWifiEnabled: false } })).reason, 'disabled');
  assert.equal(evaluateAutoWifiCheckIn(input({ company: { ...company, attendanceWifiEnabled: false } })).reason, 'wifi_mismatch');
  assert.equal(evaluateAutoWifiCheckIn(input({ record: { status: 'leave' } })).reason, 'already_recorded');
});
