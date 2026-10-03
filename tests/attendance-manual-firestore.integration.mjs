import assert from 'node:assert/strict';
import admin from '../functions/node_modules/firebase-admin/lib/index.js';
import attendanceModule from '../functions/attendanceManual.js';

if (!/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST || '')) throw new Error('Local emulator required');
const app = admin.initializeApp({ projectId: 'demo-company-wifi' }, 'manual-attendance-test');
const db = app.firestore();
const path = (_, name) => `artifacts/manual-test/public/data/${name}`;
try {
  await db.collection(path('', 'employees')).doc('e').set({ companyId: 'co', position: 'Kinh doanh' });
  await db.collection(path('', 'companies')).doc('co').set({ attendanceWifiSsid: 'Office', attendanceWifiBssid: 'aa:bb:cc:dd:ee:01' });
  await db.doc('identity_accounts/manual-test/devices/d').set({ trusted: true });
  const args = { db, collectionPath: path, appId: 'test', identity: { id: 'manual-test', companyId: 'co', appUserId: 'e', accountType: 'employee' }, device: { deviceId: 'd' }, deviceSecret: 'test-only', verifyDevice: (device, secret) => device.trusted && secret === 'test-only', action: 'in', method: { type: 'wifi', ssid: 'Office', bssid: 'aa:bb:cc:dd:ee:01' }, now: new Date('2026-10-04T01:00:00Z') };
  const results = await Promise.all(Array.from({ length: 3 }, () => attendanceModule.recordManualAttendance(args)));
  assert.equal(results.filter(row => !row.duplicate).length, 1);
  assert.equal(results.filter(row => row.duplicate).length, 2);
  assert.equal((await db.collection(path('', 'attendance')).get()).size, 1);
  assert.equal((await db.collection('identity_audit_logs').where('accountId', '==', 'manual-test').get()).size, 1);
  assert.equal(results[0].record.checkIn, args.now.toISOString());
  console.log('PASS real Firestore emulator: three concurrent submissions, one record and one audit log');
} finally { await app.delete(); }
