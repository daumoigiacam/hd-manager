import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc, deleteDoc, getDoc } from 'firebase/firestore';

if (!/^(localhost|127\.0\.0\.1):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST || '')) throw new Error('Local emulator required');
const protectedCollections = ['orderReturns', 'orderReturnStates', 'inventoryReturnStates', 'inventoryDamagedReturns',
  'paymentCorrections', 'paymentCorrectionStates', 'refundReceipts'];
const env = await initializeTestEnvironment({ projectId: 'demo-financial-evidence-rules', firestore: {
  rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8'),
} });
const ref = (db, name, id = 'server-evidence') => doc(db, `artifacts/test-evidence/public/data/${name}/${id}`);
const evidence = { environment: 'FIRESTORE_EMULATOR', checks: [], startedAt: new Date().toISOString() };
try {
  await env.withSecurityRulesDisabled(async context => {
    for (const name of protectedCollections) await setDoc(ref(context.firestore(), name), { companyId: 'company-a', customerId: 'customer-a', amount: 50 });
    await setDoc(ref(context.firestore(), 'activityLogs', 'audit_ort_test'), { companyId: 'company-a', action: 'ORDER_RETURN_COMMITTED' });
  });
  for (const role of ['owner', 'warehouse']) {
    const db = env.authenticatedContext(`employee-${role}`, { identityId: `identity-${role}`, appUserId: `employee-${role}`, companyId: 'company-a', accountType: 'employee', role }).firestore();
    for (const name of protectedCollections) {
      await assertSucceeds(getDoc(ref(db, name)));
      await assertFails(setDoc(ref(db, name, `forged-${role}`), { companyId: 'company-a', amount: 999 }));
      await assertFails(updateDoc(ref(db, name), { amount: 999 }));
      await assertFails(deleteDoc(ref(db, name)));
      evidence.checks.push({ role, collection: name, pass: true });
    }
    await assertFails(setDoc(ref(db, 'activityLogs', `forged-audit-${role}`), { companyId: 'company-a', action: 'INVENTORY_COMMITTED' }));
    await assertFails(setDoc(ref(db, 'activityLogs', `audit_iop_reserved-${role}`), { companyId: 'company-a', action: 'OTHER' }));
    await assertFails(updateDoc(ref(db, 'activityLogs', 'audit_ort_test'), { action: 'OTHER' }));
    await assertFails(deleteDoc(ref(db, 'activityLogs', 'audit_ort_test')));
    evidence.checks.push({ role, collection: 'activityLogs', pass: true });
  }
  const foreign = env.authenticatedContext('foreign', { identityId: 'foreign', appUserId: 'foreign', companyId: 'company-b', accountType: 'employee', role: 'owner' }).firestore();
  for (const name of protectedCollections) await assertFails(getDoc(ref(foreign, name)));
  assert.equal(evidence.checks.length, 16);
  evidence.status = 'PASS';
  console.log('PASS: 16 evidence collection/role checks + cross-tenant denial');
} catch (error) {
  evidence.status = 'FAIL';
  evidence.error = error.message;
  throw error;
} finally {
  mkdirSync('test-results/core-gaps', { recursive: true });
  writeFileSync('test-results/core-gaps/financial-evidence-rules.json', JSON.stringify(evidence, null, 2));
  await env.cleanup();
}
