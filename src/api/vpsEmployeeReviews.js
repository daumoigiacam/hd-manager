const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_SOURCE_REFERENCE_LENGTH = 160;

const text = (value) => `${value ?? ''}`.trim();
const isUuid = (value) => UUID.test(text(value));
const plainObject = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {};

const fail = (code, message = code) => {
  const error = new Error(message);
  error.code = code;
  throw error;
};

const requireUuid = (value, code) => {
  if (!isUuid(value)) fail(code);
  return text(value).toLowerCase();
};

const monthWindow = (value) => {
  const monthKey = text(value).slice(0, 7);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(monthKey)) fail('HR_PERFORMANCE_REVIEW_MONTH_INVALID');
  const [year, month] = monthKey.split('-').map(Number);
  const end = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    monthKey,
    periodStart: `${monthKey}-01`,
    periodEnd: `${monthKey}-${String(end).padStart(2, '0')}`,
  };
};

const rating = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 5) fail('HR_PERFORMANCE_REVIEW_RATING_INVALID');
  return Number(parsed.toFixed(2));
};

const reviewMetadata = (record) => plainObject(record?.metadata).hdManagerReview;

export function normalizeVpsEmployeeReview(record = {}) {
  const legacy = plainObject(reviewMetadata(record));
  const companyId = requireUuid(record.companyId, 'HR_PERFORMANCE_REVIEW_RESPONSE_INVALID');
  const employeeId = requireUuid(record.employeeId, 'HR_PERFORMANCE_REVIEW_RESPONSE_INVALID');
  const nativeScore = Number(record.score);
  const legacyRating = Number(legacy.rating ?? legacy.score);
  const resolvedRating = Number.isFinite(legacyRating)
    ? rating(legacyRating)
    : Number.isFinite(nativeScore) ? rating(nativeScore / 20) : 0;
  const periodStart = text(record.periodStart).slice(0, 10);
  const resolvedMonth = /^\d{4}-\d{2}-\d{2}$/.test(periodStart)
    ? periodStart.slice(0, 7)
    : text(legacy.monthKey).slice(0, 7);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(resolvedMonth))
    fail('HR_PERFORMANCE_REVIEW_RESPONSE_INVALID');
  return {
    ...record,
    ...legacy,
    id: requireUuid(record.id, 'HR_PERFORMANCE_REVIEW_RESPONSE_INVALID'),
    companyId,
    targetEmployeeId: employeeId,
    targetEmployeeName: text(legacy.targetEmployeeName),
    reviewerEmployeeId: text(legacy.reviewerEmployeeId),
    reviewerName: text(legacy.reviewerName),
    rating: resolvedRating,
    score: Number(legacy.score ?? resolvedRating),
    criteriaScores: plainObject(legacy.criteriaScores),
    criteriaAverage: Number(legacy.criteriaAverage ?? resolvedRating),
    reason: text(legacy.reason ?? record.comments),
    monthKey: resolvedMonth,
    date: text(legacy.date) || periodStart,
    source: 'hd-connect-vps',
    createdAt: record.createdAt || legacy.createdAt || '',
    updatedAt: record.updatedAt || legacy.updatedAt || record.createdAt || '',
    vpsEmployeeReview: true,
  };
}

export async function loadVpsEmployeeReviews(api, session, { cancelled = () => false } = {}) {
  const companyId = requireUuid(session?.companyId, 'HR_PERFORMANCE_REVIEW_TENANT_REQUIRED');
  if (!session?.permissions?.includes('hr.performance.read'))
    fail('HR_PERFORMANCE_REVIEW_PERMISSION_REQUIRED');
  const items = [];
  const ids = new Set();
  let page = 1;
  while (page <= 2_500) {
    if (cancelled()) fail('HR_PERFORMANCE_REVIEW_LOAD_CANCELLED');
    const result = await api.listHrPerformanceReviews({ page, limit: 100, sortBy: 'createdAt', sortOrder: 'asc' });
    if (cancelled()) fail('HR_PERFORMANCE_REVIEW_LOAD_CANCELLED');
    const rows = Array.isArray(result?.items) ? result.items : null;
    const pagination = plainObject(result?.pagination);
    if (!rows || rows.length > 100 || typeof pagination.hasNextPage !== 'boolean')
      fail('HR_PERFORMANCE_REVIEW_PAGINATION_INVALID');
    for (const row of rows) {
      const normalized = normalizeVpsEmployeeReview(row);
      if (normalized.companyId !== companyId || ids.has(normalized.id))
        fail('HR_PERFORMANCE_REVIEW_SCOPE_MISMATCH');
      ids.add(normalized.id);
      items.push(normalized);
    }
    if (!pagination.hasNextPage) return { items, complete: true };
    if (rows.length !== 100) fail('HR_PERFORMANCE_REVIEW_PAGINATION_INVALID');
    page += 1;
  }
  fail('HR_PERFORMANCE_REVIEW_LOAD_LIMIT');
}

export function mergeVpsEmployeeReviews(previous = [], incoming = [], companyId) {
  const tenant = requireUuid(companyId, 'HR_PERFORMANCE_REVIEW_TENANT_REQUIRED');
  const rows = new Map(previous.map((record) => [`${record.companyId}:${record.id}`, record]));
  const seen = new Set();
  for (const record of incoming) {
    const normalized = normalizeVpsEmployeeReview(record);
    if (normalized.companyId !== tenant || seen.has(normalized.id))
      fail('HR_PERFORMANCE_REVIEW_SCOPE_MISMATCH');
    seen.add(normalized.id);
    rows.set(`${tenant}:${normalized.id}`, normalized);
  }
  return [...rows.values()];
}

export async function saveVpsEmployeeReview(api, session, record = {}) {
  const companyId = requireUuid(session?.companyId, 'HR_PERFORMANCE_REVIEW_TENANT_REQUIRED');
  if (!session?.permissions?.includes('hr.performance.manage'))
    fail('HR_PERFORMANCE_REVIEW_PERMISSION_REQUIRED');
  if (text(record.companyId) && text(record.companyId) !== companyId)
    fail('HR_PERFORMANCE_REVIEW_TENANT_MISMATCH');
  const sourceId = text(record.id);
  const sourceReference = `hdm-review:${sourceId}`;
  if (!sourceId || sourceReference.length > MAX_SOURCE_REFERENCE_LENGTH)
    fail('HR_PERFORMANCE_REVIEW_SOURCE_INVALID');
  const employeeId = requireUuid(record.targetEmployeeId, 'HR_PERFORMANCE_REVIEW_EMPLOYEE_INVALID');
  const normalizedRating = rating(record.rating ?? record.score);
  const period = monthWindow(record.monthKey || record.date);
  const managerRecord = {
    ...record,
    id: sourceId,
    companyId,
    targetEmployeeId: employeeId,
    rating: normalizedRating,
    score: normalizedRating,
    monthKey: period.monthKey,
    criteriaScores: plainObject(record.criteriaScores),
    criteriaAverage: Number.isFinite(Number(record.criteriaAverage))
      ? Number(Number(record.criteriaAverage).toFixed(2))
      : normalizedRating,
  };
  const saved = await api.createHrPerformanceReview({
    clientMutationId: sourceReference,
    employeeId,
    periodType: 'MONTH',
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
    score: Number((normalizedRating * 20).toFixed(2)),
    comments: text(record.reason),
    sourceReference,
    metadata: { hdManagerReview: managerRecord },
  });
  const normalized = normalizeVpsEmployeeReview(saved);
  if (normalized.companyId !== companyId || normalized.targetEmployeeId !== employeeId)
    fail('HR_PERFORMANCE_REVIEW_TENANT_MISMATCH');
  return normalized;
}
