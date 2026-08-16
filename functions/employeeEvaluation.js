'use strict';

// Server-side monthly evaluation aggregation. This module deliberately keeps
// the calculation pure until the final batch write so retries are idempotent.

const VN_TIME_ZONE = 'Asia/Ho_Chi_Minh';
const SCHEMA_VERSION = 1;
const DEFAULT_QUERY_LIMIT = 5000;
const CALCULATION_VERSION = 'employee-evaluation-13-v1';

const MANUAL_CRITERIA = Object.freeze([
  { id: 'commitment', label: 'Cam kết', source: 'manual' },
  { id: 'initiative', label: 'Chủ động', source: 'manual' },
  { id: 'ownership', label: 'Trách nhiệm', source: 'manual' },
  { id: 'support', label: 'Hỗ trợ công việc', source: 'manual' },
  { id: 'knowledge_sharing', label: 'Chia sẻ kiến thức', source: 'manual' },
  { id: 'respect', label: 'Tôn trọng', source: 'manual' },
  { id: 'alignment', label: 'Phối hợp', source: 'manual' },
  { id: 'communication', label: 'Giao tiếp', source: 'manual' },
  { id: 'positive_spirit', label: 'Tinh thần tích cực', source: 'manual' },
  { id: 'connection', label: 'Kết nối', source: 'manual' }
]);

const AUTOMATIC_CRITERIA = Object.freeze([
  { id: 'lateMinutes', label: 'Tổng phút đi muộn', unit: 'phút', source: 'attendance' },
  { id: 'leaveDays', label: 'Ngày nghỉ trong tháng', unit: 'ngày', source: 'attendance' },
  { id: 'customerComplaints', label: 'Phản ánh khách hàng đã xác nhận', unit: 'lần', source: 'customer_complaints' }
]);

const REWARD_BY_STAR = Object.freeze({ 0: 0, 1: 0, 2: 40000, 3: 60000, 4: 80000, 5: 100000 });
const VALID_COMPLAINT_STATUSES = new Set([
  'accepted', 'confirmed', 'processed', 'resolved', 'valid', 'validated',
  'đã xác nhận', 'đã xử lý'
]);
const REJECTED_COMPLAINT_STATUSES = new Set([
  'cancelled', 'canceled', 'dismissed', 'invalid', 'rejected',
  'rejected_by_company', 'từ chối', 'đã từ chối'
]);

const text = value => `${value ?? ''}`.trim();

function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'object') {
    const millis = Number(value.toMillis?.());
    if (Number.isFinite(millis)) return new Date(millis);
    const seconds = Number(value.seconds ?? value._seconds);
    if (Number.isFinite(seconds)) return new Date(seconds * 1000);
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function vietnamParts(value) {
  const date = toDate(value);
  if (!date) return null;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: VN_TIME_ZONE,
    calendar: 'gregory',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    hourCycle: 'h23'
  }).formatToParts(date);
  return Object.fromEntries(parts.filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
}

function vietnamMonthKey(value) {
  const parts = vietnamParts(value);
  return parts ? `${parts.year}-${parts.month}` : '';
}

function normalizeMonthKey(value) {
  const raw = text(value);
  if (/^\d{4}-\d{2}$/.test(raw)) return raw;
  const match = raw.match(/^(\d{4})[-/]?(\d{1,2})/);
  return match ? `${match[1]}-${String(Number(match[2])).padStart(2, '0')}` : '';
}

function previousMonthKey(monthKey) {
  const normalized = normalizeMonthKey(monthKey);
  if (!normalized) return '';
  const [year, month] = normalized.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 2, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function isEvaluationPeriodDue(monthKey, now = new Date()) {
  const target = normalizeMonthKey(monthKey);
  const current = vietnamMonthKey(now);
  return Boolean(target && current && target < current);
}

function eventDate(item) {
  return item?.date ?? item?.dateKey ?? item?.createdAt ?? item?.updatedAt ?? item?.timestamp ?? item?.time;
}

function inMonth(item, monthKey) {
  const explicit = normalizeMonthKey(item?.monthKey);
  return explicit ? explicit === monthKey : vietnamMonthKey(eventDate(item)) === monthKey;
}

function employeeIdOf(item) {
  return text(item?.employeeId ?? item?.empId ?? item?.targetEmployeeId ?? item?.driverId ?? item?.assignedEmployeeId);
}

function companyIdOf(item) {
  return text(item?.companyId ?? item?.tenantId);
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : null;
}

function timeMinutes(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const raw = text(value);
  const match = raw.match(/(\d{1,2}):(\d{2})/);
  if (match) return Number(match[1]) * 60 + Number(match[2]);
  const parts = vietnamParts(value);
  return parts ? Number(parts.hour) * 60 + Number(parts.minute) : null;
}

function stableRecordId(item, index) {
  return text(item?.id ?? item?.recordId ?? item?.attendanceId ?? item?.complaintId)
    || `${vietnamMonthKey(eventDate(item))}|${employeeIdOf(item)}|${item?.status ?? item?.type ?? ''}|${index}`;
}

function uniqueRecords(items) {
  const seen = new Set();
  return (Array.isArray(items) ? items : []).filter((item, index) => {
    const id = stableRecordId(item, index);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function scoreLateMinutes(value) {
  const minutes = numberOrNull(value);
  if (minutes === null) return null;
  if (minutes < 100) return 5;
  if (minutes <= 150) return 4.5;
  if (minutes <= 200) return 4;
  if (minutes <= 250) return 3.5;
  if (minutes <= 300) return 3;
  if (minutes <= 350) return 2.5;
  if (minutes <= 400) return 2;
  if (minutes <= 450) return 1.5;
  if (minutes <= 500) return 1;
  return 0;
}

function scoreCount(value) {
  const count = numberOrNull(value);
  if (count === null) return null;
  if (count < 1) return 5;
  if (count < 2) return 4;
  if (count < 3) return 3;
  if (count < 4) return 2;
  if (count < 5) return 1;
  return 0;
}

function rewardForAverage(average) {
  if (!Number.isFinite(average)) return null;
  const star = Math.max(0, Math.min(5, Math.round(average)));
  return REWARD_BY_STAR[star];
}

function isLeaveRecord(item) {
  const status = text(item?.status ?? item?.type).toLowerCase();
  return Boolean(item?.leave || item?.isLeave || item?.leaveType
    || ['leave', 'approved_leave', 'unapproved_leave', 'absent'].includes(status));
}

function isComplaintValid(item) {
  const status = text(item?.status ?? item?.resolutionStatus ?? item?.validationStatus).toLowerCase();
  return VALID_COMPLAINT_STATUSES.has(status)
    && !REJECTED_COMPLAINT_STATUSES.has(status)
    && item?.isValid !== false
    && item?.isRejected !== true;
}

function lateMinutesForEntry(entry, shiftPolicy = {}) {
  const explicit = numberOrNull(entry?.lateMinutes ?? entry?.minutesLate ?? entry?.late);
  if (explicit !== null) return explicit;
  const checkIn = timeMinutes(entry?.checkIn ?? entry?.checkInAt ?? entry?.timeIn);
  if (checkIn === null) return null;
  const start = timeMinutes(shiftPolicy?.shiftStart ?? shiftPolicy?.start ?? '07:00');
  if (start === null) return null;
  const grace = numberOrNull(shiftPolicy?.graceMinutes ?? shiftPolicy?.grace ?? 0) ?? 0;
  return Math.max(0, checkIn - start - grace);
}

function buildAutomaticEvaluation({ employeeId, companyId, monthKey, attendance, complaints, shiftPolicy = {} }) {
  const attendanceRows = uniqueRecords(attendance).filter(item => employeeIdOf(item) === text(employeeId)
    && (!companyId || companyIdOf(item) === text(companyId))
    && inMonth(item, monthKey));
  const worked = attendanceRows.filter(item => !isLeaveRecord(item));
  const leaveRows = attendanceRows.filter(isLeaveRecord);
  // An empty array is a successfully loaded source and therefore represents zero activity.
  // A null/undefined source remains unavailable so the period cannot be finalized with fake zeros.
  const attendanceAvailable = Array.isArray(attendance);
  const complaintRows = uniqueRecords(complaints).filter(item => employeeIdOf(item) === text(employeeId)
    && (!companyId || companyIdOf(item) === text(companyId))
    && inMonth(item, monthKey));
  const complaintsAvailable = Array.isArray(complaints);

  const lateValues = worked.map(item => lateMinutesForEntry(item, shiftPolicy));
  const lateComplete = attendanceAvailable && lateValues.every(value => value !== null);
  const leaveDays = new Set(leaveRows.map(eventDate).map(value => vietnamParts(value))
    .filter(Boolean).map(parts => `${parts.year}-${parts.month}-${parts.day}`));
  const complaintCount = complaintRows.filter(isComplaintValid).length;
  const automatic = [
    {
      id: 'lateMinutes', label: AUTOMATIC_CRITERIA[0].label, unit: 'phút', source: 'attendance',
      status: lateComplete ? 'complete' : 'needs_review',
      value: lateComplete ? lateValues.reduce((sum, value) => sum + value, 0) : null,
      score: lateComplete ? scoreLateMinutes(lateValues.reduce((sum, value) => sum + value, 0)) : null,
      details: worked.map((item, index) => ({ id: stableRecordId(item, index), date: eventDate(item), minutes: lateValues[index] }))
    },
    {
      id: 'leaveDays', label: AUTOMATIC_CRITERIA[1].label, unit: 'ngày', source: 'attendance',
      status: attendanceAvailable ? 'complete' : 'needs_review', value: attendanceAvailable ? leaveDays.size : null,
      score: attendanceAvailable ? scoreCount(leaveDays.size) : null,
      details: [...leaveDays].map(date => ({ date }))
    },
    {
      id: 'customerComplaints', label: AUTOMATIC_CRITERIA[2].label, unit: 'lần', source: 'customer_complaints',
      status: complaintsAvailable ? 'complete' : 'needs_review', value: complaintsAvailable ? complaintCount : null,
      score: complaintsAvailable ? scoreCount(complaintCount) : null,
      details: complaintRows.filter(isComplaintValid).map((item, index) => ({ id: stableRecordId(item, index), date: eventDate(item) }))
    }
  ];
  return {
    schemaVersion: SCHEMA_VERSION,
    calculationVersion: CALCULATION_VERSION,
    employeeId: text(employeeId), companyId: text(companyId), monthKey,
    status: automatic.every(item => item.status === 'complete') ? 'complete' : 'needs_review',
    criteria: automatic
  };
}

function readManualScores(reviews, employeeId, monthKey) {
  const rows = uniqueRecords(reviews).filter(item => employeeIdOf(item) === text(employeeId)
    && inMonth(item, monthKey));
  const criteria = MANUAL_CRITERIA.map(definition => {
    const values = rows.map(item => {
      const score = item?.criteriaScores?.[definition.id]
        ?? item?.scores?.[definition.id]
        ?? item?.criteria?.[definition.id];
      return Number.isFinite(Number(score)) ? Number(score) : null;
    }).filter(value => value !== null && value >= 0 && value <= 5);
    const score = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
    return { ...definition, status: score === null ? 'needs_review' : 'complete', score, value: values.length };
  });
  return { status: criteria.every(item => item.status === 'complete') ? 'complete' : 'needs_review', criteria, count: rows.length };
}

function buildEvaluationSummary({ employee, companyId, monthKey, reviews, attendance, complaints, company, shiftPolicy }) {
  const id = text(employee?.id ?? employee?.employeeId);
  const manual = readManualScores(reviews, id, monthKey);
  const automatic = buildAutomaticEvaluation({ employeeId: id, companyId, monthKey, attendance, complaints, company, shiftPolicy });
  const criteria = [...manual.criteria, ...automatic.criteria];
  const complete = criteria.every(item => item.status === 'complete');
  const average = complete ? criteria.reduce((sum, item) => sum + Number(item.score), 0) / criteria.length : null;
  return {
    id: `${companyId}_${monthKey}_${id}`,
    employeeId: id,
    companyId: text(companyId),
    monthKey,
    schemaVersion: SCHEMA_VERSION,
    calculationVersion: CALCULATION_VERSION,
    status: complete ? 'calculated' : 'needs_review',
    employeeName: text(employee?.name ?? employee?.displayName),
    criteria,
    manualCriteria: manual.criteria,
    automaticCriteria: automatic.criteria,
    manualCount: manual.count,
    automaticStatus: automatic.status,
    average,
    stars: average === null ? null : Math.round(average),
    rewardAmount: rewardForAverage(average),
    source: {
      attendance: attendance !== null,
      complaints: complaints !== null,
      manualReviews: reviews !== null
    }
  };
}

function collectionName(pathBuilder, appId, name) {
  return pathBuilder(appId, name);
}

async function readTenantCollection({ db, appId, name, companyId, monthKey, pathBuilder, limit = DEFAULT_QUERY_LIMIT }) {
  try {
    const snapshot = await db.collection(collectionName(pathBuilder, appId, name))
      .where('companyId', '==', companyId)
      .limit(limit + 1)
      .get();
    if (snapshot.size > limit) return { status: 'needs_review', reason: 'query_limit_exceeded', records: [] };
    const records = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    return {
      status: 'complete',
      records: monthKey ? records.filter(item => inMonth(item, monthKey)) : records
    };
  } catch (error) {
    return { status: 'needs_review', reason: `${name}_query_failed`, error, records: [] };
  }
}

async function readCompanyIds({ db, appId, pathBuilder, limit = DEFAULT_QUERY_LIMIT }) {
  const snapshot = await db.collection(collectionName(pathBuilder, appId, 'companies')).limit(limit + 1).get();
  if (snapshot.size > limit) throw new Error('company_query_limit_exceeded');
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

async function claimPeriod({ db, periodRef, now }) {
  if (typeof db.runTransaction !== 'function') return { claimed: true, existing: null };
  return db.runTransaction(async transaction => {
    const snapshot = await transaction.get(periodRef);
    const existing = snapshot.exists ? snapshot.data() : null;
    if (existing?.status === 'finalized') return { claimed: false, existing };
    const started = toDate(existing?.startedAt);
    if (existing?.status === 'calculating' && started && now.getTime() - started.getTime() < 10 * 60 * 1000) {
      return { claimed: false, existing };
    }
    transaction.set(periodRef, {
      status: 'calculating', schemaVersion: SCHEMA_VERSION, calculationVersion: CALCULATION_VERSION,
      startedAt: now, updatedAt: now
    }, { merge: true });
    return { claimed: true, existing };
  });
}

async function commitWrites(db, writes, chunkSize = 400) {
  for (let index = 0; index < writes.length; index += chunkSize) {
    const batch = db.batch();
    writes.slice(index, index + chunkSize).forEach(({ ref, data }) => batch.set(ref, data, { merge: true }));
    await batch.commit();
  }
}

async function aggregateCompanyEvaluation({ db, appId, company, monthKey, now = new Date(), pathBuilder, limit = DEFAULT_QUERY_LIMIT }) {
  const companyId = text(company?.id ?? company?.companyId);
  if (!companyId || !isEvaluationPeriodDue(monthKey, now)) return { companyId, status: 'not_due' };
  const periodId = `${companyId}_${monthKey}`;
  const periodRef = db.collection(collectionName(pathBuilder, appId, 'evaluationPeriods')).doc(periodId);
  const claim = await claimPeriod({ db, periodRef, now });
  if (!claim.claimed) return { companyId, periodId, status: claim.existing?.status ?? 'skipped' };

  const [employeesResult, attendanceResult, complaintsResult, reviewsResult] = await Promise.all([
    readTenantCollection({ db, appId, name: 'employees', companyId, pathBuilder, limit }),
    readTenantCollection({ db, appId, name: 'attendance', companyId, monthKey, pathBuilder, limit }),
    readTenantCollection({ db, appId, name: 'customerComplaints', companyId, monthKey, pathBuilder, limit }),
    readTenantCollection({ db, appId, name: 'employeeReviews', companyId, monthKey, pathBuilder, limit })
  ]);
  const sourceRows = result => (result.status === 'complete' ? result.records : null);
  const employees = (sourceRows(employeesResult) || []).filter(item => item.isArchived !== true && item.isActive !== false);
  const attendance = sourceRows(attendanceResult);
  const complaints = sourceRows(complaintsResult);
  const reviews = sourceRows(reviewsResult);
  const summaries = employees.map(employee => buildEvaluationSummary({
    employee, companyId, monthKey, reviews, attendance, complaints, company,
    shiftPolicy: company?.shiftPolicy ?? company?.evaluationSettings?.shiftPolicy ?? {}
  }));
  const allComplete = employees.length > 0
    && employeesResult.status === 'complete'
    && summaries.every(summary => summary.status === 'calculated');
  const evaluationBase = collectionName(pathBuilder, appId, 'evaluationPeriods');
  const summaryBase = collectionName(pathBuilder, appId, 'employeeEvaluationSummaries');
  const automaticBase = collectionName(pathBuilder, appId, 'automaticEvaluations');
  const detailBase = collectionName(pathBuilder, appId, 'automaticEvaluationDetails');
  const rewardBase = collectionName(pathBuilder, appId, 'evaluationRewards');
  const auditBase = collectionName(pathBuilder, appId, 'evaluationAuditLogs');
  const writes = [];
  summaries.forEach(summary => {
    const summaryRef = db.collection(summaryBase).doc(summary.id);
    writes.push({ ref: summaryRef, data: { ...summary, updatedAt: now } });
    const automaticId = `automatic_${summary.id}`;
    writes.push({ ref: db.collection(automaticBase).doc(automaticId), data: {
      id: automaticId, employeeId: summary.employeeId, companyId, monthKey,
      schemaVersion: SCHEMA_VERSION, calculationVersion: CALCULATION_VERSION,
      status: summary.automaticStatus, criteria: summary.automaticCriteria, updatedAt: now
    } });
    summary.automaticCriteria.forEach(criterion => writes.push({
      ref: db.collection(detailBase).doc(`${automaticId}_${criterion.id}`),
      data: { id: `${automaticId}_${criterion.id}`, automaticEvaluationId: automaticId, ...criterion, updatedAt: now }
    }));
    if (summary.status === 'calculated') {
      const rewardId = `evaluationReward_${summary.id}`;
      writes.push({ ref: db.collection(rewardBase).doc(rewardId), data: {
        id: rewardId, employeeId: summary.employeeId, companyId, monthKey,
        summaryId: summary.id, stars: summary.stars, amount: summary.rewardAmount,
        schemaVersion: SCHEMA_VERSION, status: 'calculated', updatedAt: now
      } });
    }
  });
  writes.push({ ref: db.collection(auditBase).doc(`evaluation_${periodId}`), data: {
    id: `evaluation_${periodId}`, action: allComplete ? 'finalize' : 'needs_review', companyId, monthKey,
    schemaVersion: SCHEMA_VERSION, calculationVersion: CALCULATION_VERSION,
    reason: allComplete ? null : 'one_or_more_sources_or_records_need_review', createdAt: now
  } });
  await commitWrites(db, writes);
  await periodRef.set({
    id: periodId, companyId, monthKey, schemaVersion: SCHEMA_VERSION,
    calculationVersion: CALCULATION_VERSION, status: allComplete ? 'finalized' : 'needs_review',
    employeeCount: employees.length, finalizedAt: allComplete ? now : null, updatedAt: now
  }, { merge: true });
  return { companyId, periodId, status: allComplete ? 'finalized' : 'needs_review', employeeCount: employees.length };
}

async function runEmployeeEvaluationAggregation({ db, appId, now = new Date(), pathBuilder, limit = DEFAULT_QUERY_LIMIT } = {}) {
  if (typeof pathBuilder !== 'function') throw new Error('pathBuilder is required');
  const monthKey = previousMonthKey(vietnamMonthKey(now));
  const companies = await readCompanyIds({ db, appId, pathBuilder, limit });
  const outcomes = [];
  for (const company of companies) {
    outcomes.push(await aggregateCompanyEvaluation({ db, appId, company, monthKey, now, pathBuilder, limit }));
  }
  return { monthKey, outcomes };
}

module.exports = {
  VN_TIME_ZONE,
  SCHEMA_VERSION,
  CALCULATION_VERSION,
  MANUAL_CRITERIA,
  AUTOMATIC_CRITERIA,
  REWARD_BY_STAR,
  vietnamMonthKey,
  previousMonthKey,
  isEvaluationPeriodDue,
  scoreLateMinutes,
  scoreCount,
  rewardForAverage,
  buildAutomaticEvaluation,
  readManualScores,
  buildEvaluationSummary,
  aggregateCompanyEvaluation,
  runEmployeeEvaluationAggregation
};
