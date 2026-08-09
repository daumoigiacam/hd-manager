import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment
} from '@firebase/rules-unit-testing';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  setDoc,
  updateDoc,
  where,
  writeBatch
} from 'firebase/firestore';

const projectId = 'hd-manager-payroll-rules-test';
const appId = 'test-app';
const companyId = 'company-01';
const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');

const pathFor = (targetAppId, collectionName, id) => (
  `artifacts/${targetAppId}/public/data/${collectionName}/${id}`
);

const buildLockDocuments = ({
  targetAppId = appId,
  targetCompanyId = companyId,
  monthKey = '2026-07',
  employeeId = 'employee-01',
  endingDebt = 2_000_000
} = {}) => {
  const periodId = `payroll_${targetCompanyId}_${monthKey}`;
  const snapshotId = `${periodId}_${employeeId}`;
  const targetMonth = monthKey === '2026-12'
    ? `${Number(monthKey.slice(0, 4)) + 1}-01`
    : `${monthKey.slice(0, 5)}${`${Number(monthKey.slice(5)) + 1}`.padStart(2, '0')}`;
  const carryoverId = `payroll_debt_${targetCompanyId}_${targetMonth}_${employeeId}`;
  const lockedAt = `${monthKey}-31T16:59:59.000Z`;
  const salaryDetails = {
    netSalary: 0,
    endingDebt,
    grossSalary: 10_000_000,
    deductionTotal: 12_000_000
  };
  const snapshot = {
    id: snapshotId,
    companyId: targetCompanyId,
    periodId,
    monthKey,
    employeeId,
    status: 'LOCKED',
    schemaVersion: 2,
    formulaVersion: 'HD_PAYROLL_FORMULA_V1',
    policyVersion: 'v1',
    policySnapshot: {
      version: 'v1',
      formulaVersion: 'HD_PAYROLL_FORMULA_V1',
      values: { basicSalary: 12_000_000 }
    },
    employee: { id: employeeId, name: 'Nguyen Van A' },
    salaryDetails,
    calculationSnapshot: {
      inputs: { monthKey },
      additions: { grossSalary: 10_000_000 },
      deductions: { deductionTotal: 12_000_000 },
      results: { grossSalary: 10_000_000, netSalary: 0, endingDebt }
    },
    lockedAt,
    isArchived: false
  };
  const period = {
    id: periodId,
    companyId: targetCompanyId,
    monthKey,
    status: 'LOCKED',
    lockedAt,
    employeeCount: 1,
    snapshotIds: [snapshotId],
    debtCarryoverIds: endingDebt > 0 ? [carryoverId] : [],
    debtTransferCount: endingDebt > 0 ? 1 : 0,
    totals: { totalSalary: 0, totalEndingDebt: endingDebt },
    totalEndingDebt: endingDebt,
    isArchived: false
  };
  const carryover = endingDebt > 0
    ? {
        id: carryoverId,
        companyId: targetCompanyId,
        employeeId,
        sourcePeriodId: periodId,
        sourceSnapshotId: snapshotId,
        sourceMonthKey: monthKey,
        targetMonthKey: targetMonth,
        amount: endingDebt,
        status: 'carried_over',
        transferredAt: lockedAt,
        isArchived: false
      }
    : null;
  const lockLog = {
    id: `payroll_period_lock_${periodId}`,
    companyId: targetCompanyId,
    type: 'payroll_period_lock',
    action: 'payroll_period_locked',
    periodId,
    monthKey,
    amount: endingDebt,
    createdAt: lockedAt,
    isArchived: false
  };
  const carryLog = carryover
    ? {
        id: `payroll_rollover_${carryoverId}`,
        carryoverId,
        companyId: targetCompanyId,
        type: 'payroll_debt_rollover',
        action: 'payroll_period_locked',
        sourcePeriodId: periodId,
        sourceSnapshotId: snapshotId,
        sourceMonthKey: monthKey,
        targetMonthKey: targetMonth,
        amount: endingDebt,
        createdAt: lockedAt,
        isArchived: false
      }
    : null;
  return {
    targetAppId,
    periodId,
    snapshotId,
    carryoverId,
    period,
    snapshot,
    carryover,
    lockLog,
    carryLog
  };
};

const writeAtomicLock = async (database, documents) => {
  const batch = writeBatch(database);
  batch.set(doc(database, pathFor(documents.targetAppId, 'payrollPeriods', documents.periodId)), documents.period);
  batch.set(doc(database, pathFor(documents.targetAppId, 'payrollSnapshots', documents.snapshotId)), documents.snapshot);
  if (documents.carryover) {
    batch.set(doc(database, pathFor(documents.targetAppId, 'payrollDebtCarryovers', documents.carryoverId)), documents.carryover);
    batch.set(doc(database, pathFor(documents.targetAppId, 'activityLogs', documents.carryLog.id)), documents.carryLog);
  }
  batch.set(doc(database, pathFor(documents.targetAppId, 'activityLogs', documents.lockLog.id)), documents.lockLog);
  return batch.commit();
};

const testEnvironment = await initializeTestEnvironment({
  projectId,
  firestore: { rules }
});

let passed = 0;
const test = async (name, callback) => {
  await callback();
  passed += 1;
  console.log(`PASS ${name}`);
};

try {
  await testEnvironment.withSecurityRulesDisabled(async context => {
    const database = context.firestore();
    await setDoc(doc(database, pathFor(appId, 'employees', 'owner-01')), {
      id: 'owner-01', companyId, position: 'Chủ doanh nghiệp', role: 'super_admin'
    });
    await setDoc(doc(database, pathFor(appId, 'employees', 'accountant-01')), {
      id: 'accountant-01', companyId, position: 'Kế toán & nhân sự', role: 'employee'
    });
    await setDoc(doc(database, pathFor(appId, 'employees', 'employee-01')), {
      id: 'employee-01', companyId, position: 'Sản xuất', role: 'employee'
    });
  });

  const ownerDb = testEnvironment.authenticatedContext('firebase-owner', {
    companyId,
    identityId: 'identity-owner-01',
    appUserId: 'owner-01',
    accountType: 'employee',
    role: 'super_admin'
  }).firestore();
  const accountantDb = testEnvironment.authenticatedContext('firebase-accountant', {
    companyId,
    identityId: 'identity-accountant-01',
    appUserId: 'accountant-01',
    accountType: 'employee',
    role: 'employee'
  }).firestore();
  const employeeDb = testEnvironment.authenticatedContext('firebase-employee', {
    companyId,
    identityId: 'identity-employee-01',
    appUserId: 'employee-01',
    accountType: 'employee',
    role: 'employee'
  }).firestore();
  const otherCompanyDb = testEnvironment.authenticatedContext('firebase-other-company', {
    companyId: 'company-02',
    identityId: 'identity-other-owner',
    appUserId: 'other-owner',
    accountType: 'employee',
    role: 'super_admin'
  }).firestore();
  const anonymousDb = testEnvironment.authenticatedContext('firebase-anonymous', {}).firestore();
  const lock = buildLockDocuments();

  await test('normal authenticated application data remains readable and writable', async () => {
    const customerRef = doc(ownerDb, pathFor(appId, 'customers', 'rules-smoke-customer'));
    await assertSucceeds(setDoc(customerRef, {
      id: 'rules-smoke-customer', companyId, name: 'Rules smoke test'
    }));
    const savedCustomer = await assertSucceeds(getDoc(customerRef));
    assert.equal(savedCustomer.data().name, 'Rules smoke test');
    await assertSucceeds(deleteDoc(customerRef));
  });

  await test('debt collection can create a company-scoped payment', async () => {
    const paymentRef = doc(ownerDb, pathFor(appId, 'payments', 'rules-smoke-payment'));
    await assertSucceeds(setDoc(paymentRef, {
      id: 'rules-smoke-payment',
      companyId,
      customerId: 'customer-01',
      amount: 1_678_200,
      sourceType: 'debt_order_payment',
      isArchived: false
    }, { merge: true }));
    await assertSucceeds(deleteDoc(paymentRef));
  });

  await test('debt collection cannot write a payment into another company', async () => {
    await assertFails(setDoc(doc(otherCompanyDb, pathFor(appId, 'payments', 'cross-company-payment')), {
      id: 'cross-company-payment',
      companyId,
      customerId: 'customer-01',
      amount: 1_000,
      sourceType: 'debt_order_payment',
      isArchived: false
    }, { merge: true }));
  });

  await test('anonymous sessions cannot read protected payroll history', async () => {
    await assertFails(getDoc(doc(anonymousDb, pathFor(appId, 'payrollSnapshots', lock.snapshotId))));
  });

  await test('regular employees cannot create a locked payroll period', async () => {
    await assertFails(writeAtomicLock(employeeDb, lock));
  });

  await test('an owner can atomically create period, snapshot, carry and audit logs', async () => {
    await assertSucceeds(writeAtomicLock(ownerDb, lock));
    const savedSnapshot = await assertSucceeds(getDoc(doc(ownerDb, pathFor(appId, 'payrollSnapshots', lock.snapshotId))));
    assert.equal(savedSnapshot.data().salaryDetails.endingDebt, 2_000_000);
  });

  await test('company-scoped payroll history queries are allowed for a payroll manager', async () => {
    const snapshots = await assertSucceeds(getDocs(query(
      collection(ownerDb, `artifacts/${appId}/public/data/payrollSnapshots`),
      where('companyId', '==', companyId),
      where('periodId', '==', lock.periodId)
    )));
    assert.equal(snapshots.size, 1);
  });

  await test('an accountant resolved from the employee profile has payroll manager rights', async () => {
    const accountantLock = buildLockDocuments({ monthKey: '2026-06', employeeId: 'employee-02', endingDebt: 0 });
    await assertSucceeds(writeAtomicLock(accountantDb, accountantLock));
  });

  const autoLockPlanId = `payroll_auto_lock_${companyId}_2026-08`;
  const stagedSnapshotId = `${autoLockPlanId}_employee-01`;
  const stagedSnapshot = {
    ...buildLockDocuments({ monthKey: '2026-08', endingDebt: 0 }).snapshot,
    id: stagedSnapshotId,
    snapshotId: `payroll_${companyId}_2026-08_employee-01`,
    planId: autoLockPlanId,
    preparedAt: '2026-08-08T09:00:00.000Z'
  };
  const autoLockPlan = {
    id: autoLockPlanId,
    companyId,
    monthKey: '2026-08',
    periodId: `payroll_${companyId}_2026-08`,
    status: 'READY',
    rulesVersion: 'PAYROLL_FREEZE_RULES_V2',
    autoLockAt: '2026-08-31T23:59:59+07:00',
    closingSchedule: {
      mode: 'MONTH_END',
      timeZone: 'Asia/Ho_Chi_Minh',
      time: '23:59:59',
      source: 'SYSTEM_MONTH_END'
    },
    stagedSnapshotIds: [stagedSnapshotId],
    expectedEmployeeIds: ['employee-01'],
    snapshotCount: 1,
    isArchived: false
  };

  await test('a payroll manager can still write a complete legacy READY staging plan', async () => {
    const batch = writeBatch(ownerDb);
    batch.set(doc(ownerDb, pathFor(appId, 'payrollAutoLockPlans', autoLockPlanId)), autoLockPlan);
    batch.set(doc(ownerDb, pathFor(appId, 'payrollAutoLockPlanSnapshots', stagedSnapshotId)), stagedSnapshot);
    await assertSucceeds(batch.commit());
  });

  const openPlanId = `payroll_auto_lock_${companyId}_2026-09`;
  const openStagedSnapshotId = `${openPlanId}_employee-01`;
  const openPlan = {
    ...autoLockPlan,
    id: openPlanId,
    monthKey: '2026-09',
    periodId: `payroll_${companyId}_2026-09`,
    status: 'OPEN',
    autoLockAt: '2026-09-30T23:59:59+07:00',
    period: {
      id: `payroll_${companyId}_2026-09`,
      companyId,
      monthKey: '2026-09',
      status: 'OPEN',
      employeeCount: 1,
      snapshotIds: [`payroll_${companyId}_2026-09_employee-01`]
    },
    stagedSnapshotIds: [openStagedSnapshotId]
  };
  const incompleteOpenStaging = {
    id: openStagedSnapshotId,
    snapshotId: `payroll_${companyId}_2026-09_employee-01`,
    planId: openPlanId,
    companyId,
    employeeId: 'employee-01',
    periodId: openPlan.periodId,
    monthKey: openPlan.monthKey,
    status: 'STAGED',
    preparedAt: '2026-09-01T09:00:00.000Z',
    salaryDetails: { netSalary: 0 },
    isArchived: false
  };

  await test('OPEN staging may be incomplete without becoming an official snapshot', async () => {
    const batch = writeBatch(ownerDb);
    batch.set(doc(ownerDb, pathFor(appId, 'payrollAutoLockPlans', openPlanId)), openPlan);
    batch.set(doc(ownerDb, pathFor(appId, 'payrollAutoLockPlanSnapshots', openStagedSnapshotId)), incompleteOpenStaging);
    await assertSucceeds(batch.commit());
    const officialSnapshot = await assertSucceeds(getDoc(doc(ownerDb, pathFor(appId, 'payrollSnapshots', incompleteOpenStaging.snapshotId))));
    assert.equal(officialSnapshot.exists(), false);
  });

  await test('OPEN staging cannot pretend to be an official locked snapshot', async () => {
    const stagedRef = doc(ownerDb, pathFor(appId, 'payrollAutoLockPlanSnapshots', openStagedSnapshotId));
    await assertFails(setDoc(stagedRef, {
      ...incompleteOpenStaging,
      status: 'LOCKED',
      lockedAt: '2026-09-30T16:59:59.000Z'
    }));
  });

  await test('a client cannot promote or delete an auto-lock plan', async () => {
    const planRef = doc(ownerDb, pathFor(appId, 'payrollAutoLockPlans', openPlanId));
    await assertFails(updateDoc(planRef, { status: 'CLOSING' }));
    await assertFails(updateDoc(planRef, { status: 'READY_FOR_LOCK', readyForLockDigest: 'client-forged' }));
    await assertFails(deleteDoc(planRef));
  });

  await test('locked snapshots cannot be updated or deleted by an owner', async () => {
    const snapshotRef = doc(ownerDb, pathFor(appId, 'payrollSnapshots', lock.snapshotId));
    await assertFails(updateDoc(snapshotRef, { 'salaryDetails.netSalary': 99_000_000 }));
    await assertFails(deleteDoc(snapshotRef));
  });

  await test('locked periods cannot be directly unlocked or recalculated', async () => {
    const periodRef = doc(ownerDb, pathFor(appId, 'payrollPeriods', lock.periodId));
    await assertFails(updateDoc(periodRef, { status: 'DRAFT', totals: { totalSalary: 99_000_000 } }));
  });

  await test('final carry-forward cannot be directly edited', async () => {
    const carryRef = doc(ownerDb, pathFor(appId, 'payrollDebtCarryovers', lock.carryoverId));
    await assertFails(updateDoc(carryRef, { amount: 8_000_000 }));
  });

  await test('an adjustment without its linked period update is rejected', async () => {
    const adjustmentId = `payroll_adjustment_${lock.snapshotId}_1`;
    await assertFails(setDoc(doc(ownerDb, pathFor(appId, 'payrollAdjustments', adjustmentId)), {
      id: adjustmentId,
      companyId,
      periodId: lock.periodId,
      monthKey: lock.period.monthKey,
      snapshotId: lock.snapshotId,
      employeeId: lock.snapshot.employeeId,
      sequence: 1,
      status: 'ADJUSTED',
      reason: 'Invalid direct adjustment',
      beforeSalaryDetails: lock.snapshot.salaryDetails,
      afterSalaryDetails: { ...lock.snapshot.salaryDetails, netSalary: 500_000, endingDebt: 1_000_000 },
      differences: { netSalary: 500_000, endingDebt: -1_000_000 },
      previousAdjustmentId: '',
      isArchived: false
    }));
  });

  const adjustmentId = `payroll_adjustment_${lock.snapshotId}_2`;
  const adjustedAt = '2026-08-02T02:00:00.000Z';
  const adjustment = {
    id: adjustmentId,
    companyId,
    periodId: lock.periodId,
    monthKey: lock.period.monthKey,
    snapshotId: lock.snapshotId,
    employeeId: lock.snapshot.employeeId,
    sequence: 1,
    status: 'ADJUSTED',
    reason: 'Approved correction',
    beforeSalaryDetails: lock.snapshot.salaryDetails,
    afterSalaryDetails: { ...lock.snapshot.salaryDetails, netSalary: 500_000, endingDebt: 1_000_000 },
    differences: { netSalary: 500_000, endingDebt: -1_000_000 },
    adjustedAt,
    previousAdjustmentId: '',
    isArchived: false
  };
  const adjustedPeriod = {
    ...lock.period,
    status: 'ADJUSTED',
    totals: { totalSalary: 500_000, totalEndingDebt: 1_000_000 },
    totalEndingDebt: 1_000_000,
    debtCarryoverIds: [lock.carryoverId],
    debtTransferCount: 1,
    adjustmentCount: 1,
    latestAdjustmentBySnapshot: { [lock.snapshotId]: adjustmentId },
    lastAdjustmentId: adjustmentId,
    lastAdjustedAt: adjustedAt,
    lastAdjustedByEmployeeId: 'owner-01',
    updatedAt: adjustedAt
  };
  const adjustedCarry = {
    ...lock.carryover,
    amount: 1_000_000,
    status: 'adjusted_carry_over',
    adjustedByPayrollAdjustmentId: adjustmentId,
    updatedAt: adjustedAt,
    isArchived: false
  };
  const adjustmentAudit = {
    id: `audit_${adjustmentId}`,
    adjustmentId,
    companyId,
    type: 'payroll_adjustment',
    action: 'locked_payroll_adjusted',
    periodId: lock.periodId,
    monthKey: lock.period.monthKey,
    snapshotId: lock.snapshotId,
    employeeId: lock.snapshot.employeeId,
    reason: adjustment.reason,
    before: adjustment.beforeSalaryDetails,
    after: adjustment.afterSalaryDetails,
    differences: adjustment.differences,
    createdAt: adjustedAt,
    isArchived: false
  };

  await test('an official atomic adjustment succeeds without changing the original snapshot', async () => {
    const batch = writeBatch(ownerDb);
    batch.set(doc(ownerDb, pathFor(appId, 'payrollAdjustments', adjustmentId)), adjustment);
    batch.set(doc(ownerDb, pathFor(appId, 'activityLogs', adjustmentAudit.id)), adjustmentAudit);
    batch.set(doc(ownerDb, pathFor(appId, 'payrollDebtCarryovers', lock.carryoverId)), adjustedCarry);
    batch.set(doc(ownerDb, pathFor(appId, 'payrollPeriods', lock.periodId)), adjustedPeriod);
    await assertSucceeds(batch.commit());

    const originalSnapshot = await getDoc(doc(ownerDb, pathFor(appId, 'payrollSnapshots', lock.snapshotId)));
    const currentCarry = await getDoc(doc(ownerDb, pathFor(appId, 'payrollDebtCarryovers', lock.carryoverId)));
    assert.deepEqual(originalSnapshot.data().salaryDetails, lock.snapshot.salaryDetails);
    assert.equal(currentCarry.data().amount, 1_000_000);
  });

  await test('adjustment and payroll audit records remain immutable', async () => {
    const adjustmentRef = doc(ownerDb, pathFor(appId, 'payrollAdjustments', adjustmentId));
    const auditRef = doc(ownerDb, pathFor(appId, 'activityLogs', adjustmentAudit.id));
    await assertFails(updateDoc(adjustmentRef, { reason: 'Tampered' }));
    await assertFails(deleteDoc(adjustmentRef));
    await assertFails(updateDoc(auditRef, { reason: 'Tampered' }));
    await assertFails(deleteDoc(auditRef));
  });

  await test('two concurrent lock attempts create exactly one immutable history set', async () => {
    const concurrencyAppId = 'test-app-concurrency';
    const concurrentLock = buildLockDocuments({
      targetAppId: concurrencyAppId,
      monthKey: '2026-08',
      endingDebt: 1_000_000
    });
    const lockOnce = () => runTransaction(ownerDb, async transaction => {
      const periodRef = doc(ownerDb, pathFor(concurrencyAppId, 'payrollPeriods', concurrentLock.periodId));
      const snapshotRef = doc(ownerDb, pathFor(concurrencyAppId, 'payrollSnapshots', concurrentLock.snapshotId));
      const carryRef = doc(ownerDb, pathFor(concurrencyAppId, 'payrollDebtCarryovers', concurrentLock.carryoverId));
      const [periodSnapshot, salarySnapshot, carrySnapshot] = await Promise.all([
        transaction.get(periodRef),
        transaction.get(snapshotRef),
        transaction.get(carryRef)
      ]);
      if (periodSnapshot.exists() || salarySnapshot.exists() || carrySnapshot.exists()) {
        throw new Error('Payroll period already locked');
      }
      transaction.set(periodRef, concurrentLock.period);
      transaction.set(snapshotRef, concurrentLock.snapshot);
      transaction.set(carryRef, concurrentLock.carryover);
      transaction.set(
        doc(ownerDb, pathFor(concurrencyAppId, 'activityLogs', concurrentLock.carryLog.id)),
        concurrentLock.carryLog
      );
      transaction.set(
        doc(ownerDb, pathFor(concurrencyAppId, 'activityLogs', concurrentLock.lockLog.id)),
        concurrentLock.lockLog
      );
    });

    const outcomes = await Promise.allSettled([lockOnce(), lockOnce()]);
    assert.equal(outcomes.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(outcomes.filter(result => result.status === 'rejected').length, 1);
    await testEnvironment.withSecurityRulesDisabled(async context => {
      const adminDb = context.firestore();
      const periods = await getDocs(collection(adminDb, `artifacts/${concurrencyAppId}/public/data/payrollPeriods`));
      const snapshots = await getDocs(collection(adminDb, `artifacts/${concurrencyAppId}/public/data/payrollSnapshots`));
      const carryovers = await getDocs(collection(adminDb, `artifacts/${concurrencyAppId}/public/data/payrollDebtCarryovers`));
      assert.equal(periods.size, 1);
      assert.equal(snapshots.size, 1);
      assert.equal(carryovers.size, 1);
    });
  });

  assert.equal(passed, 19);
  console.log(`\nFirestore payroll rules: ${passed}/19 integration cases PASS`);
} finally {
  await testEnvironment.cleanup();
}
