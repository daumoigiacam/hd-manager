export const PAYROLL_SNAPSHOT_INTEGRITY = Object.freeze({
  FULL: 'FULL',
  LEGACY_NEEDS_REVIEW: 'LEGACY_NEEDS_REVIEW',
  INVALID_NEEDS_REVIEW: 'INVALID_NEEDS_REVIEW'
});

const FULL_SNAPSHOT_SCHEMA_VERSION = 2;

const isRecord = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const hasText = value => `${value || ''}`.trim().length > 0;
const hasNumber = value => Number.isFinite(Number(value));
const sameMoney = (left, right) => Math.round(Number(left) || 0) === Math.round(Number(right) || 0);

const getSnapshotMissingFields = (snapshot = {}) => {
  const missing = [];
  ['companyId', 'periodId', 'monthKey', 'employeeId'].forEach(field => {
    if (!hasText(snapshot?.[field])) missing.push(field);
  });
  ['formulaVersion', 'policyVersion', 'lockedAt'].forEach(field => {
    if (!hasText(snapshot?.[field])) missing.push(field);
  });
  if (!isRecord(snapshot?.employee)) missing.push('employee');
  if (!isRecord(snapshot?.salaryDetails)) missing.push('salaryDetails');
  if (!isRecord(snapshot?.policySnapshot)) missing.push('policySnapshot');
  if (!isRecord(snapshot?.policySnapshot?.values)) missing.push('policySnapshot.values');
  if (!isRecord(snapshot?.calculationSnapshot)) missing.push('calculationSnapshot');
  ['inputs', 'additions', 'deductions', 'results'].forEach(field => {
    if (!isRecord(snapshot?.calculationSnapshot?.[field])) {
      missing.push(`calculationSnapshot.${field}`);
    }
  });
  if (!hasNumber(snapshot?.salaryDetails?.netSalary)) missing.push('salaryDetails.netSalary');
  if (!hasNumber(snapshot?.salaryDetails?.endingDebt)) missing.push('salaryDetails.endingDebt');
  if (Number(snapshot?.schemaVersion || 0) < FULL_SNAPSHOT_SCHEMA_VERSION) missing.push('schemaVersion');
  return [...new Set(missing)];
};

export const inspectPayrollSnapshot = (snapshot = {}) => {
  const missingFields = getSnapshotMissingFields(snapshot);
  const invalidFields = [];
  const policySnapshot = snapshot?.policySnapshot;
  const calculationSnapshot = snapshot?.calculationSnapshot;
  if (isRecord(policySnapshot)) {
    if (!hasText(policySnapshot.version)) invalidFields.push('policySnapshot.version');
    if (!hasText(policySnapshot.formulaVersion)) invalidFields.push('policySnapshot.formulaVersion');
    if (hasText(snapshot?.policyVersion) && policySnapshot.version !== snapshot.policyVersion) {
      invalidFields.push('policyVersion.mismatch');
    }
    if (hasText(snapshot?.formulaVersion) && policySnapshot.formulaVersion !== snapshot.formulaVersion) {
      invalidFields.push('formulaVersion.mismatch');
    }
    if (isRecord(policySnapshot.values) && Object.keys(policySnapshot.values).length === 0) {
      invalidFields.push('policySnapshot.values.empty');
    }
  }
  if (isRecord(calculationSnapshot?.inputs)) {
    const inputMonthKey = `${calculationSnapshot.inputs.monthKey || ''}`;
    if (inputMonthKey && inputMonthKey !== `${snapshot?.monthKey || ''}`) {
      invalidFields.push('calculationSnapshot.inputs.monthKey');
    }
  }
  if (isRecord(calculationSnapshot?.results)) {
    ['grossSalary', 'netSalary', 'endingDebt'].forEach(field => {
      if (!hasNumber(calculationSnapshot.results[field])) {
        invalidFields.push(`calculationSnapshot.results.${field}`);
      }
    });
    if (
      hasNumber(calculationSnapshot.results.netSalary)
      && hasNumber(snapshot?.salaryDetails?.netSalary)
      && !sameMoney(calculationSnapshot.results.netSalary, snapshot.salaryDetails.netSalary)
    ) invalidFields.push('calculationSnapshot.results.netSalary.mismatch');
    if (
      hasNumber(calculationSnapshot.results.endingDebt)
      && hasNumber(snapshot?.salaryDetails?.endingDebt)
      && !sameMoney(calculationSnapshot.results.endingDebt, snapshot.salaryDetails.endingDebt)
    ) invalidFields.push('calculationSnapshot.results.endingDebt.mismatch');
    if (
      hasNumber(calculationSnapshot.results.grossSalary)
      && hasNumber(snapshot?.salaryDetails?.grossSalary)
      && !sameMoney(calculationSnapshot.results.grossSalary, snapshot.salaryDetails.grossSalary)
    ) invalidFields.push('calculationSnapshot.results.grossSalary.mismatch');
  }
  const hasFrozenDisplayResult = Boolean(
    hasText(snapshot?.companyId)
    && hasText(snapshot?.periodId)
    && hasText(snapshot?.monthKey)
    && hasText(snapshot?.employeeId)
    && isRecord(snapshot?.employee)
    && isRecord(snapshot?.salaryDetails)
    && hasNumber(snapshot?.salaryDetails?.netSalary)
  );
  const isComplete = missingFields.length === 0 && invalidFields.length === 0;
  const canMigrateMetadataOnly = Boolean(
    !isComplete
    && invalidFields.length === 0
    && missingFields.length === 1
    && missingFields[0] === 'schemaVersion'
  );

  return {
    status: isComplete
      ? PAYROLL_SNAPSHOT_INTEGRITY.FULL
      : (hasFrozenDisplayResult
          ? PAYROLL_SNAPSHOT_INTEGRITY.LEGACY_NEEDS_REVIEW
          : PAYROLL_SNAPSHOT_INTEGRITY.INVALID_NEEDS_REVIEW),
    isComplete,
    hasFrozenDisplayResult,
    needsReview: !isComplete,
    canMigrateMetadataOnly,
    missingFields,
    invalidFields,
    issues: [...missingFields, ...invalidFields]
  };
};

export const isCompletePayrollSnapshot = snapshot => inspectPayrollSnapshot(snapshot).isComplete;

const isLockedStatus = status => (
  ['LOCKED', 'ADJUSTED', 'AUTO_LOCKED', 'CLOSED'].includes(`${status || ''}`.trim().toUpperCase())
);

export const auditPayrollHistoricalData = ({ periods = [], snapshots = [] } = {}) => {
  const safePeriods = Array.isArray(periods) ? periods : [];
  const safeSnapshots = Array.isArray(snapshots) ? snapshots : [];
  const snapshotInspections = safeSnapshots.map(snapshot => ({
    id: `${snapshot?.id || ''}`,
    periodId: `${snapshot?.periodId || ''}`,
    ...inspectPayrollSnapshot(snapshot)
  }));
  const snapshotsById = new Map(safeSnapshots.map(snapshot => [`${snapshot?.id || ''}`, snapshot]));
  const periodIds = new Set(safePeriods.map(period => `${period?.id || ''}`).filter(Boolean));
  const lockedPeriods = safePeriods.filter(period => isLockedStatus(period?.status) && !period?.isArchived);
  const periodReviews = lockedPeriods.map(period => {
    const snapshotIds = (Array.isArray(period?.snapshotIds) ? period.snapshotIds : [])
      .map(id => `${id || ''}`.trim())
      .filter(Boolean);
    const missingSnapshotIds = snapshotIds.filter(id => !snapshotsById.has(id));
    const linkedInspections = snapshotInspections.filter(item => item.periodId === `${period?.id || ''}`);
    const needsReview = snapshotIds.length === 0
      || missingSnapshotIds.length > 0
      || linkedInspections.length !== snapshotIds.length
      || linkedInspections.some(item => item.needsReview);
    return {
      id: `${period?.id || ''}`,
      monthKey: `${period?.monthKey || ''}`,
      status: needsReview ? PAYROLL_SNAPSHOT_INTEGRITY.LEGACY_NEEDS_REVIEW : PAYROLL_SNAPSHOT_INTEGRITY.FULL,
      needsReview,
      snapshotCount: linkedInspections.length,
      expectedSnapshotCount: snapshotIds.length,
      missingSnapshotIds
    };
  });
  const completeSnapshots = snapshotInspections.filter(item => item.isComplete);
  const needsReviewSnapshots = snapshotInspections.filter(item => item.needsReview);
  const metadataOnlyCandidates = needsReviewSnapshots.filter(item => item.canMigrateMetadataOnly);
  const orphanSnapshots = snapshotInspections.filter(item => item.periodId && !periodIds.has(item.periodId));

  return {
    totalPayrollRecords: safeSnapshots.length,
    fullSnapshotCount: completeSnapshots.length,
    needsReviewSnapshotCount: needsReviewSnapshots.length,
    safelyMigratableMetadataOnlyCount: metadataOnlyCandidates.length,
    unsafeAutomaticMigrationCount: needsReviewSnapshots.length - metadataOnlyCandidates.length,
    lockedPeriodCount: lockedPeriods.length,
    lockedPeriodsNeedingReviewCount: periodReviews.filter(item => item.needsReview).length,
    orphanSnapshotCount: orphanSnapshots.length,
    snapshotInspections,
    periodReviews
  };
};
