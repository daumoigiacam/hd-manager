export const AUTOMATIC_EVALUATION_SCHEMA_VERSION = 1;

export const AUTOMATIC_EVALUATION_CRITERIA = [
  {
    id: 'lateMinutes',
    label: 'Tổng phút đi muộn',
    unit: 'phút',
    source: 'attendance'
  },
  {
    id: 'leaveDays',
    label: 'Ngày nghỉ trong tháng',
    unit: 'ngày',
    source: 'attendance'
  },
  {
    id: 'customerComplaints',
    label: 'Phản ánh khách hàng đã xác nhận',
    unit: 'lần',
    source: 'customer_complaints'
  }
];

export const EVALUATION_REWARD_PER_STAR = 200000;

export const normalizeEvaluationStars = stars => {
  const value = Number(stars);
  if (!Number.isFinite(value)) return 0;
  return Math.round(Math.max(0, Math.min(5, value)) * 2) / 2;
};

const VALID_COMPLAINT_STATUSES = new Set([
  'accepted',
  'confirmed',
  'processed',
  'resolved',
  'valid',
  'validated',
  'đã xác nhận',
  'đã xử lý'
]);

const REJECTED_COMPLAINT_STATUSES = new Set([
  'cancelled',
  'canceled',
  'dismissed',
  'invalid',
  'rejected',
  'rejected_by_company',
  'từ chối',
  'đã từ chối'
]);

const text = value => `${value ?? ''}`.trim();

const normalizeMonthKey = value => {
  const raw = text(value);
  if (/^\d{4}-\d{2}$/.test(raw)) return raw;
  const match = raw.match(/^(\d{4})[-/]?(\d{1,2})[-/]?(\d{1,2})/);
  if (match) return `${match[1]}-${String(Number(match[2])).padStart(2, '0')}`;
  return '';
};

const toDate = value => {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'object') {
    const seconds = Number(value.seconds ?? value._seconds);
    if (Number.isFinite(seconds) && seconds > 0) return new Date(seconds * 1000);
    const millis = Number(value.toMillis?.());
    if (Number.isFinite(millis) && millis > 0) return new Date(millis);
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const getDateTimeParts = value => {
  const raw = text(value);
  const localMatch = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})[T ](\d{1,2}):(\d{2})/);
  const hasExplicitZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw);
  if (localMatch && !hasExplicitZone) {
    return {
      year: Number(localMatch[1]),
      month: Number(localMatch[2]),
      day: Number(localMatch[3]),
      hour: Number(localMatch[4]),
      minute: Number(localMatch[5])
    };
  }
  const parsed = toDate(value);
  if (!parsed) return null;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    calendar: 'gregory',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    hourCycle: 'h23'
  }).formatToParts(parsed);
  const values = Object.fromEntries(parts.filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute)
  };
};

const dateKey = value => {
  const raw = text(value);
  const direct = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (direct) return `${direct[1]}-${String(Number(direct[2])).padStart(2, '0')}-${String(Number(direct[3])).padStart(2, '0')}`;
  const parsed = toDate(value);
  if (!parsed) return '';
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
};

const inMonth = (value, monthKey) => dateKey(value).startsWith(`${monthKey}-`);

const clampNonNegativeNumber = value => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : null;
};

const getAttendanceDocumentIdentity = item => {
  const match = text(item?.id ?? item?.recordId ?? '').match(/^(\d{4}-\d{2}-\d{2})_(.+)$/);
  return {
    date: match?.[1] || '',
    employeeId: match?.[2] || ''
  };
};

const getEmployeeId = item => {
  const attendanceIdentity = getAttendanceDocumentIdentity(item);
  return text(
    item?.employeeId ?? item?.empId ?? item?.targetEmployeeId ?? item?.driverId ?? item?.assignedEmployeeId
      ?? attendanceIdentity.employeeId
  );
};

const getCompanyId = item => text(item?.companyId ?? item?.appId ?? item?.tenantId);

const getEventDate = item => {
  const attendanceIdentity = getAttendanceDocumentIdentity(item);
  return attendanceIdentity.date
    || (
      item?.date
      ?? item?.dateKey
      ?? item?.monthKey
      ?? item?.createdAt
      ?? item?.updatedAt
      ?? item?.timestamp
      ?? ''
    );
};

const stableFingerprint = (item, index = 0) => text(
  item?.id ?? item?.recordId ?? item?.attendanceId ?? item?.complaintId
  ?? `${dateKey(getEventDate(item))}|${getEmployeeId(item)}|${item?.type ?? item?.status ?? ''}|${index}`
);

const uniqueByStableId = (items = []) => {
  const seen = new Set();
  return (Array.isArray(items) ? items : []).filter((item, index) => {
    const key = stableFingerprint(item, index);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const normalizeTimeMinutes = value => {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value >= 0 && value <= 24 * 60) return value;
    const parsedTimestamp = toDate(value);
    return parsedTimestamp ? (parsedTimestamp.getHours() * 60) + parsedTimestamp.getMinutes() : null;
  }
  const raw = text(value);
  if (/^\d{1,2}:\d{2}$/.test(raw)) {
    const match = raw.match(/^(\d{1,2}):(\d{2})$/);
    return (Number(match[1]) * 60) + Number(match[2]);
  }
  const parsed = getDateTimeParts(value);
  if (parsed) return (parsed.hour * 60) + parsed.minute;
  const match = raw.match(/(\d{1,2}):(\d{2})/);
  return match ? (Number(match[1]) * 60) + Number(match[2]) : null;
};

const calendarDayNumber = value => {
  const raw = dateKey(value);
  if (!raw) return null;
  const [year, month, day] = raw.split('-').map(Number);
  if (![year, month, day].every(Number.isFinite)) return null;
  return Math.floor(Date.UTC(year, month - 1, day) / (24 * 60 * 60 * 1000));
};

const calendarDayNumberFromParts = parts => calendarDayNumber(
  `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`
);

const resolveLateMinutes = (entry, shiftPolicy = {}) => {
  const payrollLateMinutes = clampNonNegativeNumber(entry?.payrollLateMinutes);
  if (payrollLateMinutes !== null) return payrollLateMinutes;

  const checkInValue = entry?.checkIn ?? entry?.checkInAt ?? entry?.timeIn;
  const checkIn = normalizeTimeMinutes(checkInValue);
  const start = normalizeTimeMinutes(shiftPolicy?.shiftStart ?? shiftPolicy?.start ?? '07:00');
  const end = normalizeTimeMinutes(shiftPolicy?.shiftEnd ?? shiftPolicy?.end ?? '17:00');

  if (checkIn !== null && start !== null) {
    const isOvernight = end !== null && end <= start;
    const checkInParts = getDateTimeParts(checkInValue);
    const attendanceDay = calendarDayNumber(getEventDate(entry));
    if (checkInParts && attendanceDay !== null) {
      const checkInDay = calendarDayNumberFromParts(checkInParts);
      const shiftStartDay = attendanceDay - (isOvernight ? 1 : 0);
      const elapsedMinutes = (
        (checkInDay - shiftStartDay) * (24 * 60)
        + (checkInParts.hour * 60)
        + checkInParts.minute
        - start
      );
      return Math.max(0, elapsedMinutes);
    }

    // Time-only legacy records cannot prove their calendar date, so keep the
    // conservative clock-only fallback and never turn an early value into late.
    return checkIn >= start ? checkIn - start : 0;
  }

  // Older records may not contain checkIn, so keep their explicit derived value
  // as a fallback. When checkIn exists, the actual timestamp is authoritative.
  return clampNonNegativeNumber(entry?.lateMinutes ?? entry?.minutesLate ?? entry?.late);
};

export const scoreLateMinutes = value => {
  const minutes = clampNonNegativeNumber(value);
  if (minutes === null) return { score: null, value: null, status: 'missing_data' };
  if (minutes < 100) return { score: 5, value: minutes, status: 'complete' };
  if (minutes <= 150) return { score: 4.5, value: minutes, status: 'complete' };
  if (minutes <= 200) return { score: 4, value: minutes, status: 'complete' };
  if (minutes <= 250) return { score: 3.5, value: minutes, status: 'complete' };
  if (minutes <= 300) return { score: 3, value: minutes, status: 'complete' };
  if (minutes <= 350) return { score: 2.5, value: minutes, status: 'complete' };
  if (minutes <= 400) return { score: 2, value: minutes, status: 'complete' };
  if (minutes <= 450) return { score: 1.5, value: minutes, status: 'complete' };
  if (minutes <= 500) return { score: 1, value: minutes, status: 'complete' };
  return { score: 0, value: minutes, status: 'complete' };
};

export const scoreLeaveDays = value => {
  const days = clampNonNegativeNumber(value);
  if (days === null) return { score: null, value: null, status: 'missing_data' };
  if (days < 1) return { score: 5, value: days, status: 'complete' };
  if (days < 2) return { score: 4, value: days, status: 'complete' };
  if (days < 3) return { score: 3, value: days, status: 'complete' };
  if (days < 4) return { score: 2, value: days, status: 'complete' };
  if (days < 5) return { score: 1, value: days, status: 'complete' };
  return { score: 0, value: days, status: 'complete' };
};

export const scoreValidatedComplaints = value => {
  const count = clampNonNegativeNumber(value);
  if (count === null) return { score: null, value: null, status: 'missing_data' };
  if (count < 1) return { score: 5, value: count, status: 'complete' };
  if (count < 2) return { score: 4, value: count, status: 'complete' };
  if (count < 3) return { score: 3, value: count, status: 'complete' };
  if (count < 4) return { score: 2, value: count, status: 'complete' };
  if (count < 5) return { score: 1, value: count, status: 'complete' };
  return { score: 0, value: count, status: 'complete' };
};

export const collectLateMinutes = ({ entries, employeeId, companyId, monthKey, shiftPolicy } = {}) => {
  if (entries == null) return { status: 'missing_data', value: null, records: [], details: [] };
  const filtered = uniqueByStableId(entries || []).filter(entry => (
    (!employeeId || getEmployeeId(entry) === text(employeeId))
    && (!companyId || getCompanyId(entry) === text(companyId))
    && (!monthKey || inMonth(getEventDate(entry), monthKey))
    && !Boolean(entry?.leave || entry?.isLeave || ['leave', 'approved_leave', 'unapproved_leave', 'absent'].includes(text(entry?.status).toLowerCase()) || entry?.leaveType)
  ));
  const details = filtered.map(entry => ({
    id: stableFingerprint(entry),
    date: dateKey(getEventDate(entry)),
    minutes: resolveLateMinutes(entry, shiftPolicy)
  }));
  if (details.some(item => item.minutes === null)) return { status: 'missing_data', value: null, records: filtered, details };
  return { status: 'complete', value: details.reduce((sum, item) => sum + item.minutes, 0), records: filtered, details };
};

export const collectLeaveDays = ({ entries, attendanceEntries, employeeId, companyId, monthKey } = {}) => {
  const source = entries === undefined ? attendanceEntries : entries;
  if (source == null) return { status: 'missing_data', value: null, records: [], details: [] };
  const filtered = uniqueByStableId(source || []).filter(entry => (
    (!employeeId || getEmployeeId(entry) === text(employeeId))
    && (!companyId || getCompanyId(entry) === text(companyId))
    && (!monthKey || inMonth(getEventDate(entry), monthKey))
    && Boolean(entry?.leave || entry?.isLeave || ['leave', 'approved_leave', 'unapproved_leave', 'absent'].includes(text(entry?.status).toLowerCase()) || entry?.leaveType)
  ));
  const days = [...new Set(filtered.map(item => dateKey(getEventDate(item))).filter(Boolean))];
  return {
    status: 'complete',
    value: days.length,
    records: filtered,
    details: days.map(date => ({ date }))
  };
};

export const collectValidatedComplaints = ({ complaints, employeeId, companyId, monthKey } = {}) => {
  if (complaints == null) return { status: 'missing_data', value: null, records: [], details: [] };
  const filtered = uniqueByStableId(complaints || []).filter(item => {
    const status = text(item?.status ?? item?.resolutionStatus ?? item?.validationStatus).toLowerCase();
    const linkedEmployee = getEmployeeId(item);
    const linkedCompany = getCompanyId(item);
    return (!employeeId || linkedEmployee === text(employeeId))
      && (!companyId || linkedCompany === text(companyId))
      && (!monthKey || inMonth(getEventDate(item), monthKey))
      && VALID_COMPLAINT_STATUSES.has(status)
      && !REJECTED_COMPLAINT_STATUSES.has(status)
      && item?.isValid !== false
      && item?.isRejected !== true;
  });
  return {
    status: 'complete',
    value: filtered.length,
    records: filtered,
    details: filtered.map(item => ({
      id: stableFingerprint(item),
      date: dateKey(getEventDate(item)),
      status: text(item?.status ?? item?.resolutionStatus ?? item?.validationStatus)
    }))
  };
};

const buildCriterion = (definition, result, details = []) => ({
  id: definition.id,
  label: definition.label,
  unit: definition.unit,
  source: definition.source,
  status: result.status,
  value: result.value,
  score: result.score,
  details
});

export const calculateEmployeeAutomaticEvaluation = ({
  employeeId = '',
  companyId = '',
  monthKey = '',
  attendanceEntries,
  leaveEntries,
  complaints,
  shiftPolicy = {}
} = {}) => {
  const normalizedMonthKey = normalizeMonthKey(monthKey);
  const late = collectLateMinutes({ entries: attendanceEntries, employeeId, companyId, monthKey: normalizedMonthKey, shiftPolicy });
  const leave = collectLeaveDays({ entries: leaveEntries === undefined ? attendanceEntries : leaveEntries, employeeId, companyId, monthKey: normalizedMonthKey });
  const complaint = collectValidatedComplaints({ complaints, employeeId, companyId, monthKey: normalizedMonthKey });
  const lateScore = scoreLateMinutes(late.value);
  const leaveScore = scoreLeaveDays(leave.value);
  const complaintScore = scoreValidatedComplaints(complaint.value);
  const criteria = {
    lateMinutes: buildCriterion(AUTOMATIC_EVALUATION_CRITERIA[0], lateScore, late.details),
    leaveDays: buildCriterion(AUTOMATIC_EVALUATION_CRITERIA[1], leaveScore, leave.details),
    customerComplaints: buildCriterion(AUTOMATIC_EVALUATION_CRITERIA[2], complaintScore, complaint.details)
  };
  const missingData = Object.values(criteria).filter(item => item.status !== 'complete').map(item => item.id);
  const scores = Object.fromEntries(Object.entries(criteria).map(([id, item]) => [id, item.score]));
  const totalScore = missingData.length ? null : Object.values(scores).reduce((sum, score) => sum + score, 0);
  const exactAverage = totalScore === null ? null : totalScore / Object.keys(criteria).length;
  return {
    schemaVersion: AUTOMATIC_EVALUATION_SCHEMA_VERSION,
    source: 'automatic',
    employeeId: text(employeeId),
    companyId: text(companyId),
    monthKey: normalizedMonthKey,
    status: missingData.length ? 'needs_review' : 'complete',
    criteria,
    scores,
    criterionCount: Object.keys(criteria).length,
    totalScore,
    exactAverage,
    displayAverage: exactAverage === null ? null : Number(exactAverage.toFixed(2)),
    missingData
  };
};

export const getEvaluationStarsFromAverage = average => {
  const value = Number(average);
  if (!Number.isFinite(value)) return null;
  return normalizeEvaluationStars(value);
};

export const getEvaluationReward = stars =>
  Math.round(normalizeEvaluationStars(stars) * EVALUATION_REWARD_PER_STAR);

export const buildEvaluationSummary13 = ({
  employeeId = '',
  companyId = '',
  monthKey = '',
  manualCriteria = [],
  manualCriteriaScores = {},
  automaticEvaluation = null,
  status = 'complete'
} = {}) => {
  const manualItems = (manualCriteria || []).map(criteria => ({
    id: criteria.id,
    label: criteria.label,
    source: 'manual',
    status: Number.isFinite(Number(manualCriteriaScores?.[criteria.id])) ? 'complete' : 'missing_data',
    score: Number.isFinite(Number(manualCriteriaScores?.[criteria.id])) ? Number(manualCriteriaScores[criteria.id]) : null,
    value: null,
    details: []
  }));
  const automaticItems = AUTOMATIC_EVALUATION_CRITERIA.map(criteria => automaticEvaluation?.criteria?.[criteria.id] || ({
    ...criteria,
    source: 'automatic',
    status: 'missing_data',
    score: null,
    value: null,
    details: []
  }));
  const criteria = [...manualItems, ...automaticItems];
  const missingData = criteria.filter(item => item.status !== 'complete').map(item => item.id);
  const scores = Object.fromEntries(criteria.map(item => [item.id, item.score]));
  const totalScore = missingData.length ? null : criteria.reduce((sum, item) => sum + item.score, 0);
  const exactAverage = totalScore === null ? null : totalScore / criteria.length;
  return {
    schemaVersion: AUTOMATIC_EVALUATION_SCHEMA_VERSION,
    employeeId: text(employeeId),
    companyId: text(companyId),
    monthKey: normalizeMonthKey(monthKey),
    status: missingData.length ? 'needs_review' : status,
    criteria,
    scores,
    criterionCount: criteria.length,
    totalScore,
    exactAverage,
    displayAverage: exactAverage === null ? null : Number(exactAverage.toFixed(2)),
    stars: getEvaluationStarsFromAverage(exactAverage),
    reward: exactAverage === null ? null : getEvaluationReward(getEvaluationStarsFromAverage(exactAverage)),
    missingData,
    source: 'manual_and_automatic'
  };
};

export const buildEvaluationPeriodId = (companyId, monthKey) => `${text(companyId)}_${normalizeMonthKey(monthKey)}`.replace(/[^a-zA-Z0-9_-]/g, '_');

export const buildEmployeeEvaluationSummaryId = (companyId, employeeId, monthKey) => `${buildEvaluationPeriodId(companyId, monthKey)}_${text(employeeId)}`.replace(/[^a-zA-Z0-9_-]/g, '_');

export const createIdempotentEvaluationWritePlan = ({ companyId, monthKey, employeeIds = [], now = '' } = {}) => ({
  periodId: buildEvaluationPeriodId(companyId, monthKey),
  summaryIds: [...new Set((employeeIds || []).map(employeeId => buildEmployeeEvaluationSummaryId(companyId, employeeId, monthKey)))],
  generatedAt: now || new Date().toISOString(),
  idempotencyKey: buildEvaluationPeriodId(companyId, monthKey),
  isIdempotent: true
});

export const normalizeEvaluationMonthKey = normalizeMonthKey;
