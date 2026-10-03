import { readFile } from 'node:fs/promises';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';

const deadline = setTimeout(() => { console.error('WiFi rules timeout 60s'); process.exit(1); }, 60000);
const env = await initializeTestEnvironment({ projectId: 'demo-company-wifi', firestore: { rules: await readFile('firestore.rules', 'utf8') } });
const path = 'artifacts/test/public/data/companies/co';
const patch = { attendanceWifiSsid: 'Office', attendanceWifiBssid: 'aa:bb:cc:dd:ee:01', attendanceWifiEnabled: true };
try {
  await env.withSecurityRulesDisabled(async context => setDoc(doc(context.firestore(), path), { name: 'Company', ...patch }));
  for (const role of ['employee', 'accountant', 'manager']) {
    const db = env.authenticatedContext(role, { companyId: 'co', identityId: role, accountType: 'employee', role }).firestore();
    await assertFails(updateDoc(doc(db, path), { attendanceWifiSsid: 'Changed' }));
    await assertFails(updateDoc(doc(db, path), { attendanceWifi: { ssid: 'Changed' } }));
    await assertFails(deleteDoc(doc(db, path)));
    await assertSucceeds(updateDoc(doc(db, path), { name: 'Company' }));
  }
  for (const role of ['super_admin', 'admin', 'owner', 'company_owner', 'business_owner']) {
    const db = env.authenticatedContext(role, { companyId: 'co', identityId: role, accountType: 'employee', role }).firestore();
    await assertSucceeds(updateDoc(doc(db, path), { ...patch, attendanceWifiSsid: role }));
    await assertFails(setDoc(doc(db, path + '-other'), patch));
  }
  console.log('PASS company WiFi owner/admin, employee denial, tenant isolation');
  const employeeDb = env.authenticatedContext('ordinary', { companyId: 'co', identityId: 'ordinary', appUserId: 'e', accountType: 'employee', role: 'employee' }).firestore();
  await env.withSecurityRulesDisabled(async context => setDoc(doc(context.firestore(), 'artifacts/test/public/data/employees/e'), { companyId: 'co', position: 'Kinh doanh' }));
  await assertFails(setDoc(doc(employeeDb, 'artifacts/test/public/data/attendance/2026-10-04_e'), { companyId: 'co', checkIn: 'fake' }));
  await assertFails(updateDoc(doc(employeeDb, 'artifacts/test/public/data/employees/e'), { position: 'Kế toán & nhân sự' }));
  await assertFails(updateDoc(doc(employeeDb, 'artifacts/test/public/data/employees/e'), { attendanceGpsRequired: false }));
  console.log('PASS direct attendance and self-permission escalation denied');
} finally { await env.cleanup(); clearTimeout(deadline); }
