import { HdApiError } from './client.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const UUID4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const TEXT = { name: 200, plateNumber: 32, vehicleType: 100, vehicleOwner: 200, vehicleBrand: 100, vehicleModel: 100, vehicleColor: 80, chassisNumber: 100, engineNumber: 100, registrationNumber: 100, inspectionCertificateNo: 100, inspectionCenter: 200 };
const DATES = ['registrationDate', 'inspectionExpiry', 'lastMaintenanceDate', 'nextMaintenanceDate'];
const NUMBERS = ['fuelNorm', 'tankCapacity', 'maintenanceIntervalKm', 'lastMaintenanceKm', 'nextMaintenanceKm', 'currentKm'];
const URLS = ['registrationImageUrl', 'inspectionImageUrl'];
const URL_LISTS = ['registrationImageUrls', 'inspectionImageUrls'];
const FIELDS = [...Object.keys(TEXT), 'type', 'driverIds', 'status', ...DATES, ...NUMBERS, ...URLS, ...URL_LISTS];
const HANDOVER_FORM = ['recordHandover', 'handoverDriverIds', 'handoverDate', 'handoverKm', 'handoverCondition', 'handoverNote', 'handoverImageUrl'];
const pending = new Map();
const owns = (o, key) => Object.prototype.hasOwnProperty.call(o, key);
const fail = (code) => { throw new HdApiError(code, { code }); };
const reconcile = () => fail('reconciliation_required');
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const same = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
const keys = (o, allowed) => {
  if (!o || typeof o !== 'object' || Array.isArray(o) || ![Object.prototype, null].includes(Object.getPrototypeOf(o))
    || Object.keys(o).some(key => !allowed.includes(key) || ['__proto__', 'constructor', 'prototype'].includes(key))) fail('MANAGER_ASSET_INVALID_PAYLOAD');
};
export const vpsAssetId = value => {
  if (typeof value !== 'string' || !UUID.test(value)) fail('MANAGER_ASSET_ID_INVALID');
  return value;
};
const uuid4 = value => { if (typeof value !== 'string' || !UUID4.test(value)) fail('MANAGER_ASSET_INVALID_PAYLOAD'); return value; };
const iso = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const text = (value, max, required = false, controls = false) => {
  if (typeof value !== 'string' || value.length > max || (!controls && /[\x00-\x1f\x7f]/.test(value))
    || (required && (!value || value.trim() !== value))) fail('MANAGER_ASSET_INVALID_PAYLOAD');
  return value;
};
const date = value => {
  if (typeof value !== 'string' || !/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value)
    || !iso(`${value}T00:00:00.000Z`)) fail('MANAGER_ASSET_INVALID_PAYLOAD');
  return value;
};
const number = value => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1_000_000_000) fail('MANAGER_ASSET_INVALID_PAYLOAD');
  const [coefficient, exponent = '0'] = String(value).split('e');
  if ((coefficient.split('.')[1]?.length ?? 0) - Number(exponent) > 3) fail('MANAGER_ASSET_INVALID_PAYLOAD');
  return value;
};
const url = value => {
  if (typeof value !== 'string' || value.length > 2048 || /\s/.test(value)) fail('MANAGER_ASSET_REFERENCE_INVALID');
  let parsed;
  try { parsed = new URL(value); } catch { fail('MANAGER_ASSET_REFERENCE_INVALID'); }
  if (parsed.protocol !== 'https:' || !parsed.hostname || parsed.username || parsed.password) fail('MANAGER_ASSET_REFERENCE_INVALID');
  return value;
};
const list = (value, max, validate) => {
  if (!Array.isArray(value) || value.length > max || new Set(value).size !== value.length) fail('MANAGER_ASSET_INVALID_PAYLOAD');
  return value.map(validate);
};
const field = (key, value) => {
  if (TEXT[key]) return text(value, TEXT[key], ['name', 'plateNumber', 'vehicleType'].includes(key));
  if (key === 'type') { if (value !== 'VEHICLE') fail('MANAGER_ASSET_VEHICLE_ONLY'); return value; }
  if (key === 'status') { if (!['active', 'maintenance', 'inactive'].includes(value)) fail('MANAGER_ASSET_INVALID_PAYLOAD'); return value; }
  if (key === 'driverIds') return list(value, 32, vpsAssetId);
  if (DATES.includes(key)) return value === null ? null : date(value);
  if (NUMBERS.includes(key)) return value === null ? null : number(value);
  if (URLS.includes(key)) return value === null ? null : url(value);
  return list(value, 8, url);
};
const profile = (data, required = false) => {
  keys(data, FIELDS);
  if (required && ['name', 'type', 'plateNumber', 'vehicleType'].some(key => !owns(data, key))) fail('MANAGER_ASSET_NATIVE_IDENTITY_REQUIRED');
  if (!Object.keys(data).length) fail('MANAGER_ASSET_INVALID_PAYLOAD');
  return Object.fromEntries(FIELDS.filter(key => owns(data, key)).map(key => [key, field(key, data[key])]));
};
const handover = data => {
  keys(data, ['eventId', 'driverIds', 'date', 'km', 'condition', 'note', 'imageUrl']);
  return {
    eventId: uuid4(data.eventId), driverIds: list(data.driverIds, 32, vpsAssetId), date: date(data.date), km: number(data.km),
    ...(owns(data, 'condition') ? { condition: text(data.condition, 1000) } : {}),
    ...(owns(data, 'note') ? { note: text(data.note, 4000, false, true) } : {}),
    ...(owns(data, 'imageUrl') ? { imageUrl: data.imageUrl === null ? null : url(data.imageUrl) } : {}),
  };
};

export function vpsAssetMutationPayload(operation, data) {
  const create = operation === 'create';
  if (!['create', 'update', 'archive'].includes(operation)) fail('MANAGER_ASSET_INVALID_PAYLOAD');
  keys(data, ['requestId', ...(create ? ['code', 'codeOrigin'] : ['version']), ...(operation === 'archive' ? [] : ['asset', 'handover'])]);
  const result = { requestId: uuid4(data.requestId) };
  if (create) {
    if (typeof data.code !== 'string' || data.code.length > 100 || !/^[A-Z0-9][A-Z0-9._-]*$/.test(data.code)) fail('MANAGER_ASSET_CODE_REQUIRED');
    result.code = data.code;
    result.codeOrigin = data.codeOrigin ?? 'PROVIDED';
    if (!['PROVIDED', 'REQUEST_ID_DERIVED'].includes(result.codeOrigin)
      || (result.codeOrigin === 'REQUEST_ID_DERIVED' && data.code !== `HDM-V-${data.requestId.toUpperCase()}`)) fail('MANAGER_ASSET_INVALID_PAYLOAD');
  } else {
    if (!iso(data.version)) reconcile();
    result.version = data.version;
  }
  if (create || owns(data, 'asset')) result.asset = profile(data.asset, create);
  if (owns(data, 'handover')) result.handover = handover(data.handover);
  if (operation === 'update' && !result.asset && !result.handover) fail('MANAGER_ASSET_NO_CHANGES');
  return result;
}

export function vpsAssetQuery(query = {}, history = false) {
  keys(query, ['limit', 'offset', ...(!history ? ['includeArchived'] : [])]);
  const result = { limit: '50', offset: '0', ...(!history ? { includeArchived: 'false' } : {}), ...query };
  if (typeof result.limit !== 'string' || !/^(?:[1-9]|[1-9]\d|100)$/.test(result.limit)
    || typeof result.offset !== 'string' || !/^(?:0|[1-9]\d{0,5})$/.test(result.offset)
    || (!history && !['true', 'false'].includes(result.includeArchived))) fail('MANAGER_ASSET_INVALID_PAYLOAD');
  return result;
}

export function normalizeVpsAsset(record, companyId) {
  if (!record || record.companyId !== companyId) fail('MANAGER_ASSET_SCOPE_MISMATCH');
  vpsAssetId(record.id);
  if (!iso(record.version) || !iso(record.createdAt) || typeof record.isArchived !== 'boolean') reconcile();
  text(record.code, 100, true);
  text(record.licensePlate, 32, true);
  text(record.vehicleType, 100, true);
  const visible = { ...record.asset };
  if (visible.name === null) delete visible.name;
  profile(visible);
  const status = { AVAILABLE: 'active', IN_TRANSIT: 'active', MAINTENANCE: 'maintenance', REPAIR: 'maintenance', INACTIVE: 'inactive' }[record.nativeStatus];
  if (!status || record.asset?.type !== 'VEHICLE' || record.asset.plateNumber !== record.licensePlate
    || record.asset.vehicleType !== record.vehicleType || record.asset.status !== status || !Array.isArray(record.asset.driverIds)) reconcile();
  return {
    ...record.asset, id: record.id, companyId, code: record.code, nativeStatus: record.nativeStatus,
    version: record.version, isArchived: record.isArchived, archivedAt: record.archivedAt,
    archivedByUserId: record.archivedByUserId, createdAt: record.createdAt, updatedAt: record.version,
    provenance: record.provenance, vpsAsset: true, vpsAssetProfile: { ...record.asset },
    ...(owns(record, 'handoverEventId') ? { handoverEventId: record.handoverEventId } : {}),
  };
}

export const isVpsAssetHrEmployee = (employee, companyId) => employee?.vpsEmployee === true
  && employee.companyId === companyId && employee.status === 'ACTIVE' && !employee.isArchived
  && typeof employee.id === 'string' && UUID.test(employee.id);
const authorize = (session, permission) => {
  if (!session?.permissions?.includes(permission)) fail('MANAGER_ASSET_PERMISSION_REQUIRED');
  vpsAssetId(session.id); vpsAssetId(session.companyId);
};
const mutable = (record, companyId) => {
  if (!record || record.companyId !== companyId) fail('MANAGER_ASSET_SCOPE_MISMATCH');
  if (record.type !== 'VEHICLE') fail('MANAGER_ASSET_VEHICLE_ONLY');
  if (!record.vpsAsset || !iso(record.version) || record.reconciliationRequired) reconcile();
  vpsAssetId(record.id);
  if (record.isArchived) fail('MANAGER_ASSET_ARCHIVED');
};
const checkDrivers = (ids, employees, companyId) => {
  list(ids, 32, vpsAssetId);
  if (ids.some(id => !employees.some(emp => emp.id === id && isVpsAssetHrEmployee(emp, companyId)))) fail('MANAGER_ASSET_HR_RECONCILIATION_REQUIRED');
};

export function getVpsAssetFormDefaults(asset = {}) {
  const defaults = { ...Object.fromEntries(Object.keys(TEXT).map(key => [key, asset[key] ?? ''])), type: 'VEHICLE', status: asset.status ?? 'active', driverIds: asset.driverIds ?? [] };
  for (const key of [...DATES, ...NUMBERS, ...URLS]) defaults[key] = asset[key] ?? '';
  for (const key of URL_LISTS) defaults[key] = asset[key] ?? [];
  return { ...defaults, code: asset.code ?? '', vpsAssetVersion: asset.version ?? null,
    recordHandover: false, handoverDriverIds: [], handoverDate: '', handoverKm: '', handoverCondition: '', handoverNote: '', handoverImageUrl: '' };
}
const uiField = (key, value) => {
  if ([...DATES, ...NUMBERS, ...URLS].includes(key) && value === '') return null;
  if (NUMBERS.includes(key) && typeof value === 'string') {
    if (!/^\d+(?:[.,]\d{1,3})?$/.test(value)) fail('MANAGER_ASSET_INVALID_PAYLOAD');
    return Number(value.replace(',', '.'));
  }
  return value;
};
const commandFromForm = (data, current, employees, companyId) => {
  keys(data, [...FIELDS, 'code', 'vpsAssetVersion', ...HANDOVER_FORM]);
  if (data.type !== 'VEHICLE') fail('MANAGER_ASSET_VEHICLE_ONLY');
  if (current && (data.vpsAssetVersion !== current.version || data.code !== current.code)) fail('MANAGER_ASSET_CHANGED_RELOAD');
  const baseline = getVpsAssetFormDefaults(current ?? {});
  const changed = Object.fromEntries(FIELDS.filter(key => owns(data, key)
    && (!current || !same(uiField(key, data[key]), uiField(key, baseline[key])))).map(key => [key, uiField(key, data[key])]));
  const result = {};
  if (!current || Object.keys(changed).length) result.asset = profile(changed, !current);
  if (result.asset?.driverIds) checkDrivers(result.asset.driverIds, employees, companyId);
  if (data.recordHandover === true) {
    checkDrivers(data.handoverDriverIds, employees, companyId);
    const km = uiField('currentKm', data.handoverKm);
    result.handover = { driverIds: data.handoverDriverIds, date: date(data.handoverDate), km: number(km),
      condition: text(data.handoverCondition ?? '', 1000), note: text(data.handoverNote ?? '', 4000, false, true),
      imageUrl: data.handoverImageUrl ? url(data.handoverImageUrl) : null };
  } else if (data.recordHandover || ['handoverDate', 'handoverKm', 'handoverCondition', 'handoverNote', 'handoverImageUrl'].some(key => data[key] !== undefined && data[key] !== '')) {
    fail('MANAGER_ASSET_HANDOVER_INTENT_REQUIRED');
  }
  return result;
};
const requestFor = (operation, session, id, command) => {
  const key = JSON.stringify(canonical([operation, session.companyId, session.id, id, command]));
  if (!pending.has(key)) {
    if (!globalThis.crypto?.randomUUID) fail('MANAGER_ASSET_SECURE_UUID_REQUIRED');
    pending.set(key, { requestId: globalThis.crypto.randomUUID(), ...(command.handover ? { eventId: globalThis.crypto.randomUUID() } : {}) });
  }
  return { key, ...pending.get(key) };
};
const saved = (response, session, current, command, archive = false) => {
  const next = normalizeVpsAsset(response, session.companyId);
  if ((current && (next.id !== current.id || next.code !== current.code || Date.parse(next.version) <= Date.parse(current.version)))
    || (!current && next.code !== command.code) || next.isArchived !== archive
    || response.handoverEventId !== (command.handover?.eventId ?? null)) fail('MANAGER_ASSET_RESPONSE_INVALID');
  for (const [key, value] of Object.entries(command.asset ?? {})) {
    if (!same(next[key], key === 'plateNumber' ? value.toUpperCase() : value)) fail('MANAGER_ASSET_RESPONSE_INVALID');
  }
  return next;
};

export async function saveVpsAsset(api, session, current, data, employees = []) {
  authorize(session, 'logistics.manage');
  if (current) mutable(current, session.companyId);
  const parts = commandFromForm(data, current, employees, session.companyId);
  const command = current ? { version: current.version, ...parts } : { code: data.code, codeOrigin: 'PROVIDED', ...parts };
  const operation = current ? 'update' : 'create';
  const identity = requestFor(operation, session, current?.id ?? null, command);
  const payload = vpsAssetMutationPayload(operation, { requestId: identity.requestId, ...command,
    ...(parts.handover ? { handover: { ...parts.handover, eventId: identity.eventId } } : {}) });
  const response = current ? await api.updateManagerAsset(current.id, payload) : await api.createManagerAsset(payload);
  const next = saved(response, session, current, payload);
  if (!current) pending.delete(identity.key);
  return next;
}
export async function archiveVpsAsset(api, session, current) {
  authorize(session, 'logistics.manage');
  mutable(current, session.companyId);
  const { requestId } = requestFor('archive', session, current.id, { version: current.version });
  const payload = { requestId, version: current.version };
  return saved(await api.archiveManagerAsset(current.id, payload), session, current, payload, true);
}

const checkPage = (page, offset) => {
  if (!Array.isArray(page?.items) || page.items.length > 100 || !owns(page, 'nextOffset')
    || (page.nextOffset !== null && (page.nextOffset !== offset + 100 || page.items.length !== 100))
    || (offset > 0 && !page.items.length)) fail('MANAGER_ASSET_PAGINATION_INVALID');
};
export async function loadVpsAssets(api, session, { cancelled = () => false } = {}) {
  authorize(session, 'logistics.read');
  const items = [], ids = new Set();
  for (let offset = 0; offset < 250_000; offset += 100) {
    if (cancelled()) fail('MANAGER_ASSET_LOAD_CANCELLED');
    const page = await api.listManagerAssets({ limit: '100', offset: String(offset), includeArchived: 'true' });
    if (cancelled()) fail('MANAGER_ASSET_LOAD_CANCELLED');
    checkPage(page, offset);
    for (const record of page.items) {
      const next = normalizeVpsAsset(record, session.companyId);
      if (ids.has(next.id)) fail('MANAGER_ASSET_PAGINATION_INVALID');
      ids.add(next.id); items.push(next);
    }
    if (page.nextOffset === null) return { items, complete: true };
  }
  fail('MANAGER_ASSET_LOAD_LIMIT');
}
export async function loadVpsAssetDetails(api, session, id) {
  authorize(session, 'logistics.read'); vpsAssetId(id);
  let asset;
  const events = [], ids = new Set();
  for (let offset = 0; offset < 250_000; offset += 100) {
    const response = await api.getManagerAsset(id, { limit: '100', offset: String(offset) });
    const next = normalizeVpsAsset(response, session.companyId);
    if (next.id !== id || (asset && next.version !== asset.version)) fail('MANAGER_ASSET_CHANGED_RELOAD');
    asset = next;
    checkPage(response.handoverHistory, offset);
    for (const event of response.handoverHistory.items) {
      const { vehicleId, recordedAt, actorUserId, requestId, evidenceStatus, ...fields } = event;
      handover(fields); uuid4(requestId); vpsAssetId(actorUserId);
      if (vehicleId !== id || !iso(recordedAt) || ids.has(event.eventId)
        || evidenceStatus !== (event.imageUrl ? 'UNVERIFIED_REFERENCE' : 'NO_EVIDENCE')) reconcile();
      ids.add(event.eventId); events.push(event);
    }
    if (response.handoverHistory.nextOffset === null) return { ...asset, vpsHandoverHistory: events };
  }
  fail('MANAGER_ASSET_LOAD_LIMIT');
}
export function mergeVpsAssets(previous, incoming, companyId) {
  const rows = new Map(previous.map(row => [`${row.companyId}:${row.id}`, row]));
  for (const next of incoming) {
    if (next.companyId !== companyId || !next.vpsAsset || !iso(next.version)) fail('MANAGER_ASSET_SCOPE_MISMATCH');
    const key = `${companyId}:${next.id}`, old = rows.get(key);
    if (old && (!old.vpsAsset || Date.parse(old.version) > Date.parse(next.version))) continue;
    const history = next.vpsHandoverHistory ?? old?.vpsHandoverHistory;
    if (old?.vpsHandoverHistory && next.vpsHandoverHistory
      && old.vpsHandoverHistory.some(event => !next.vpsHandoverHistory.some(item => item.eventId === event.eventId && same(item, event)))) reconcile();
    rows.set(key, { ...old, ...next, ...(history ? { vpsHandoverHistory: history } : {}) });
  }
  return [...rows.values()];
}
export function vpsAssetErrorMessage(error) {
  const code = error?.code || error?.message || '';
  if (/reconciliation|RECONCILIATION/.test(code)) return 'Cần đối soát tài sản hoặc mã nhân sự VPS trước khi thay đổi.';
  if (/CHANGED_RELOAD|CONFLICT/.test(code) || error?.status === 409) return 'Dữ liệu xe đã thay đổi hoặc đang được sử dụng. Mở lại hồ sơ và kiểm tra trước khi thử lại.';
  if (/VEHICLE_ONLY/.test(code)) return 'VPS chỉ hỗ trợ hồ sơ VEHICLE; tài sản cũ hoặc loại khác cần đối soát.';
  return error?.message || 'Chưa xác nhận lưu tài sản VPS. Vui lòng kiểm tra và thử lại.';
}
