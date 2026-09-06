import { HdApiError } from './client.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FIELDS = ['name', 'date', 'type', 'value'];
const MAX_VERSION = 2_147_483_647;
const pendingRequests = new Map();
const owns = (record, key) => Object.prototype.hasOwnProperty.call(record, key);
const fail = (code, message = code) => { throw new HdApiError(message, { code }); };
const reconcile = () => fail('reconciliation_required', 'Ngay le can doi soat du lieu VPS truoc khi thay doi.');
const nativeVersion = row => Number.isInteger(row?.version) && row.version >= 1 && row.version <= MAX_VERSION;

export function vpsHolidayId(value) {
  if (typeof value !== 'string' || !UUID.test(value)) fail('HR_HOLIDAY_ID_INVALID');
  return value.toLowerCase();
}

const requireKeys = (record, allowed) => {
  if (!record || typeof record !== 'object' || Array.isArray(record)
    || Object.keys(record).some(key => !allowed.includes(key))) fail('HR_HOLIDAY_INVALID');
};

const calendarDate = value => {
  if (typeof value !== 'string' || !/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value)) fail('HR_HOLIDAY_INVALID');
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) fail('HR_HOLIDAY_INVALID');
  return value;
};

const rewardValue = value => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value > Number.MAX_SAFE_INTEGER) {
    fail('HR_HOLIDAY_INVALID');
  }
  // Match Decimal(number).decimalPlaces() using the number's decimal representation.
  const [coefficient, exponent = '0'] = String(value).split('e');
  const places = Math.max(0, (coefficient.split('.')[1]?.length ?? 0) - Number(exponent));
  if (places > 30) fail('HR_HOLIDAY_INVALID');
  return value;
};

const fieldsPayload = (record, partial = false) => {
  requireKeys(record, FIELDS);
  const result = {};
  for (const key of FIELDS) {
    if (partial && !owns(record, key)) continue;
    const value = record[key];
    if (key === 'name') {
      if (typeof value !== 'string' || !value.trim() || value.length > 200 || /[\x00-\x1f\x7f]/.test(value)) {
        fail('HR_HOLIDAY_INVALID');
      }
      result.name = value.trim();
    } else if (key === 'date') result.date = calendarDate(value);
    else if (key === 'type') {
      if (!['fixed', 'percentage'].includes(value)) fail('HR_HOLIDAY_INVALID');
      result.type = value;
    } else result.value = rewardValue(value);
  }
  if (!Object.keys(result).length) fail('HR_HOLIDAY_INVALID');
  if (result.type === 'fixed' && owns(result, 'value') && !Number.isSafeInteger(result.value)) {
    fail('HR_HOLIDAY_FIXED_VALUE_MUST_BE_INTEGER');
  }
  return result;
};

export function vpsHolidayMutationPayload(operation, record) {
  if (!['create', 'update', 'archive'].includes(operation)) fail('HR_HOLIDAY_INVALID');
  requireKeys(record, ['requestId', ...(operation === 'create' ? [] : ['version']), ...(operation === 'archive' ? [] : FIELDS)]);
  const { requestId, version, ...fields } = record;
  if (typeof requestId !== 'string' || !UUID_V4.test(requestId)) fail('HR_HOLIDAY_INVALID');
  if (operation !== 'create' && (!nativeVersion({ version }) || version === MAX_VERSION)) reconcile();
  return {
    requestId: requestId.toLowerCase(),
    ...(operation === 'create' ? {} : { version }),
    ...(operation === 'archive' ? {} : fieldsPayload(fields, operation === 'update')),
  };
}

export function vpsHolidayQuery(query = {}) {
  requireKeys(query, ['from', 'to', 'includeArchived', 'limit', 'offset']);
  const result = { includeArchived: false, limit: 100, offset: 0, ...query };
  for (const key of ['limit', 'offset']) {
    if (typeof result[key] === 'string' && /^\d+$/.test(result[key])) result[key] = Number(result[key]);
  }
  if (result.includeArchived === 'true') result.includeArchived = true;
  if (result.includeArchived === 'false') result.includeArchived = false;
  if (typeof result.includeArchived !== 'boolean' || !Number.isInteger(result.limit) || result.limit < 1 || result.limit > 200
    || !Number.isInteger(result.offset) || result.offset < 0 || result.offset > MAX_VERSION) fail('HR_HOLIDAY_INVALID');
  if (owns(result, 'from')) calendarDate(result.from);
  if (owns(result, 'to')) calendarDate(result.to);
  if (result.from && result.to && result.from > result.to) fail('HR_HOLIDAY_DATE_RANGE_INVALID');
  return result;
}

const businessFields = record => Object.fromEntries(FIELDS.map(key => [key, record[key]]));
const timestamp = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value));

export function normalizeVpsHoliday(record) {
  // Historical records stay raw: never coerce an imported version into native authority.
  if (!nativeVersion(record)) return record;
  const fields = fieldsPayload(businessFields(record));
  if (typeof record.isArchived !== 'boolean' || !timestamp(record.createdAt) || !timestamp(record.updatedAt)
    || (record.archivedAt !== null && !timestamp(record.archivedAt))
    || (record.archivedByUserId !== null && (typeof record.archivedByUserId !== 'string' || !UUID.test(record.archivedByUserId)))) {
    fail('HR_HOLIDAY_RESPONSE_INVALID');
  }
  return { ...record, ...fields, id: vpsHolidayId(record.id), companyId: vpsHolidayId(record.companyId) };
}

const authorize = (session, permission) => {
  if (!session?.permissions?.includes(permission)) fail('HR_HOLIDAY_PERMISSION_REQUIRED');
  return { companyId: vpsHolidayId(session.companyId), id: vpsHolidayId(session.id) };
};

export async function loadVpsHolidays(api, session, { cancelled = () => false, query = {} } = {}) {
  const actor = authorize(session, 'hr.payroll.read');
  const filter = vpsHolidayQuery({ ...query, includeArchived: query.includeArchived ?? true, limit: 100, offset: 0 });
  const items = [];
  const ids = new Set();
  let offset = 0;
  while (items.length < 250_000) {
    if (cancelled()) fail('HR_HOLIDAY_LOAD_CANCELLED');
    const result = await api.listManagerHolidays({ ...filter, offset });
    if (cancelled()) fail('HR_HOLIDAY_LOAD_CANCELLED');
    if (!Array.isArray(result?.items) || result.items.length > filter.limit || !owns(result, 'nextOffset')
      || (result.nextOffset !== null && (result.nextOffset !== offset + filter.limit || result.items.length !== filter.limit))
      || (offset > 0 && result.items.length === 0)) fail('HR_HOLIDAY_PAGINATION_INVALID');
    for (const record of result.items) {
      if (!record?.id || record.companyId !== actor.companyId || ids.has(record.id)) fail('HR_HOLIDAY_SCOPE_MISMATCH');
      if ((!filter.includeArchived && record.isArchived) || (filter.from && record.date < filter.from) || (filter.to && record.date > filter.to)) {
        fail('HR_HOLIDAY_FILTER_MISMATCH');
      }
      ids.add(record.id);
      items.push(normalizeVpsHoliday(record));
    }
    if (result.nextOffset === null) return { items, complete: true };
    offset = result.nextOffset;
  }
  fail('HR_HOLIDAY_LOAD_LIMIT');
}

export function mergeVpsHolidays(previous, incoming, companyId) {
  const tenant = vpsHolidayId(companyId);
  const rows = new Map(previous.map(row => [`${row.companyId}:${row.id}`, row]));
  const seen = new Set();
  for (const record of incoming) {
    if (!record?.id || record.companyId !== tenant || seen.has(record.id)) fail('HR_HOLIDAY_SCOPE_MISMATCH');
    seen.add(record.id);
    const next = normalizeVpsHoliday(record);
    const key = `${tenant}:${record.id}`;
    const old = rows.get(key);
    if (old && (!nativeVersion(old) || !nativeVersion(next) || old.version >= next.version)) continue;
    rows.set(key, next);
  }
  // No name/date deduplication: multiple holidays on the same date are valid.
  return [...rows.values()];
}

const mutableHoliday = (actor, current) => {
  if (!current || current.companyId !== actor.companyId) fail('HR_HOLIDAY_SCOPE_MISMATCH');
  if (!nativeVersion(current) || current.version === MAX_VERSION || current.reconciliationRequired) reconcile();
  const row = normalizeVpsHoliday(current);
  if (row.isArchived) fail('HR_HOLIDAY_NOT_FOUND');
  return row;
};

const savedHoliday = (record, actor, expected, current = null, archived = false) => {
  if (!record || record.companyId !== actor.companyId || (current && record.id !== current.id)) fail('HR_HOLIDAY_SCOPE_MISMATCH');
  if (!nativeVersion(record)) reconcile();
  const saved = normalizeVpsHoliday(record);
  if (saved.version !== (current ? current.version + 1 : 1) || saved.isArchived !== archived
    || FIELDS.some(key => saved[key] !== expected[key])
    || (archived && (!saved.archivedAt || saved.archivedByUserId !== actor.id))) fail('HR_HOLIDAY_RESPONSE_INVALID');
  return saved;
};

const requestFor = (operation, actor, id, payload) => {
  // Actor UUID is part of the durable backend receipt; no tokens or UI timestamps.
  const key = JSON.stringify([operation, actor.companyId, actor.id, id, payload]);
  if (!pendingRequests.has(key)) {
    if (!globalThis.crypto?.randomUUID) fail('HR_HOLIDAY_SECURE_UUID_UNAVAILABLE');
    pendingRequests.set(key, globalThis.crypto.randomUUID());
  }
  return { key, requestId: pendingRequests.get(key) };
};

export async function createVpsHoliday(api, session, data) {
  const actor = authorize(session, 'hr.payroll.manage');
  requireKeys(data, [...FIELDS, 'createdAt', 'updatedAt']);
  const payload = fieldsPayload(businessFields(data));
  const { key, requestId } = requestFor('create', actor, null, payload);
  const saved = savedHoliday(await api.createManagerHoliday({ requestId, ...payload }), actor, payload);
  // Successful submission ends this intent; a later identical holiday is allowed.
  pendingRequests.delete(key);
  return saved;
}

export async function updateVpsHoliday(api, session, current, patch) {
  const actor = authorize(session, 'hr.payroll.manage');
  const row = mutableHoliday(actor, current);
  const fields = fieldsPayload(patch, true);
  const expected = fieldsPayload({ ...businessFields(row), ...fields });
  const payload = { version: row.version, ...fields };
  const { requestId } = requestFor('update', actor, row.id, payload);
  return savedHoliday(await api.updateManagerHoliday(row.id, { requestId, ...payload }), actor, expected, row);
}

export async function archiveVpsHoliday(api, session, current) {
  const actor = authorize(session, 'hr.payroll.manage');
  const row = mutableHoliday(actor, current);
  const payload = { version: row.version };
  const { requestId } = requestFor('archive', actor, row.id, payload);
  return savedHoliday(await api.archiveManagerHoliday(row.id, { requestId, ...payload }), actor, businessFields(row), row, true);
}
