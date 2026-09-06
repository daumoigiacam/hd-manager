import { normalizeVpsFinanceExpense } from './hdConnectStaging.js';

const pending = new Map();
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const fail = () => { throw new Error('ASSET_COST_RECONCILIATION_REQUIRED'); };
const authorize = (session, write) => {
  if (!uuid(session?.companyId) || !uuid(session?.id)) fail();
  if (!(write ? ['logistics.manage', 'finance.manage'] : ['logistics.read', 'finance.read']).every(permission => session.permissions?.includes(permission))) {
    throw new Error('ASSET_COST_PERMISSION_REQUIRED');
  }
};
const numeric = (value, decimals) => {
  if (value === '' || value === null || value === undefined) return 0;
  if (typeof value !== 'number' && typeof value !== 'string') fail();
  if (typeof value === 'string' && !/^\d+(?:\.\d+)?$/.test(value)) fail();
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 1e12 || Number(number.toFixed(decimals)) !== number) fail();
  return number;
};
export function vpsAssetCostPayload(form) {
  if (!uuid(form.assetId) || (form.driverId && !uuid(form.driverId))) fail();
  if (!['fuel', 'other'].includes(form.type) || !['maintenance', 'repair', 'tire', 'oil', 'toll', 'other'].includes(form.costType)) fail();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date || '') || !Number.isFinite(Date.parse(`${form.date}T00:00:00.000Z`)) || new Date(`${form.date}T00:00:00.000Z`).toISOString().slice(0, 10) !== form.date) fail();
  // These require separate verified lineage/storage workflows, never silent omission.
  if (form.skipExpenseSync || form.relatedDeliveryReportId || /delivery/i.test(form.sourceType || '') || form.receiptImageUrl || form.odometerImageUrl || form.relatedExpenseId) fail();
  if (typeof form.note !== 'string' || form.note.length > 4000) fail();
  return { assetId: form.assetId, driverId: form.driverId || null, type: form.type, costType: form.costType, date: form.date,
    kmAt: numeric(form.kmAt, 3), liters: numeric(form.liters, 3), unitPrice: numeric(form.unitPrice, 2), amount: numeric(form.amount, 2), note: form.note };
}
export function normalizeVpsAssetCost(record, companyId) {
  if (!uuid(record?.id) || record.companyId !== companyId || record.vpsAssetCost !== true || !Number.isFinite(Date.parse(record.version))) fail();
  const amount = numeric(record.amount, 2);
  if (record.expenseId && (!record.expense || record.expense.id !== record.expenseId || record.expense.companyId !== companyId || numeric(record.expense.amount, 2) !== amount)) fail();
  if (amount > 0 && !record.expenseId) fail();
  return { ...record, amount, kmAt: numeric(record.kmAt, 3), liters: numeric(record.liters, 3), unitPrice: numeric(record.unitPrice, 2) };
}
const mutable = (current, session) => {
  if (!current?.vpsAssetCost || current.companyId !== session.companyId || !uuid(current.id) || current.isArchived || !Number.isFinite(Date.parse(current.version))) fail();
};
export async function saveVpsAssetCost(api, session, current, form, archive = false) {
  authorize(session, true);
  if (current) mutable(current, session);
  if (archive && !current) fail();
  if (!current && form?.expenseId) fail();
  const operation = archive ? 'archive' : current ? 'update' : 'create';
  const cost = archive ? undefined : vpsAssetCostPayload(form);
  const input = { ...(current ? { version: current.version } : {}), ...(cost ? { cost } : {}) };
  const key = JSON.stringify([session.companyId, session.id, operation, current?.id, input]);
  if (!pending.has(key)) pending.set(key, crypto.randomUUID());
  const payload = { requestId: pending.get(key), ...input };
  const response = archive ? await api.archiveManagerAssetCost(current.id, payload)
    : current ? await api.updateManagerAssetCost(current.id, payload) : await api.createManagerAssetCost(payload);
  const saved = normalizeVpsAssetCost(response, session.companyId);
  if ((current && (saved.id !== current.id || Date.parse(saved.version) <= Date.parse(current.version))) || saved.isArchived !== archive) fail();
  if (cost && Object.entries(cost).some(([field, value]) => saved[field] !== value)) fail();
  if (!current) pending.delete(key);
  return saved;
}
export async function loadVpsAssetCosts(api, session, { cancelled = () => false } = {}) {
  authorize(session, false);
  const items = [], ids = new Set();
  for (let offset = 0; offset < 250000; offset += 100) {
    if (cancelled()) throw new Error('ASSET_COST_LOAD_CANCELLED');
    const page = await api.listManagerAssetCosts({ limit: '100', offset: String(offset), includeArchived: 'true' });
    if (cancelled()) throw new Error('ASSET_COST_LOAD_CANCELLED');
    if (!Array.isArray(page?.items) || page.items.length > 100 || !Object.hasOwn(page, 'nextOffset') || (page.nextOffset !== null && (page.nextOffset !== offset + 100 || page.items.length !== 100))) fail();
    for (const row of page.items) {
      const next = normalizeVpsAssetCost(row, session.companyId);
      if (ids.has(next.id)) fail();
      ids.add(next.id); items.push(next);
    }
    if (page.nextOffset === null) return { items, complete: true };
  }
  throw new Error('ASSET_COST_LOAD_LIMIT');
}
export function mergeVpsAssetCosts(previous, incoming, companyId) {
  const result = new Map(previous.map(row => [`${row.companyId}:${row.id}`, row]));
  for (const record of incoming) {
    const next = normalizeVpsAssetCost(record, companyId), key = `${companyId}:${next.id}`, old = result.get(key);
    if (old && (!old.vpsAssetCost || Date.parse(old.version) > Date.parse(next.version))) continue;
    result.set(key, { ...old, ...next });
  }
  return [...result.values()];
}

export function mergeVpsAssetCostExpenses(previous, incoming, companyId) {
  const result = new Map(previous.map(row => [`${row.companyId}:${row.id}`, row]));
  for (const record of incoming) {
    const cost = normalizeVpsAssetCost(record, companyId);
    if (!cost.expense) continue;
    const next = { ...normalizeVpsFinanceExpense(cost.expense), vpsAssetCostVersion: cost.version };
    const key = `${companyId}:${next.id}`, old = result.get(key);
    const oldVersion = Date.parse(old?.vpsAssetCostVersion || old?.updatedAt || '');
    if (Number.isFinite(oldVersion) && oldVersion > Date.parse(cost.version)) continue;
    result.set(key, { ...old, ...next });
  }
  return [...result.values()];
}

export function mergeVpsFinanceExpenseSnapshot(previous, snapshot, companyId) {
  if (snapshot?.complete !== true || !Array.isArray(snapshot.items)) fail();
  const result = new Map();
  for (const row of snapshot.items) {
    if (!uuid(row?.id) || row.companyId !== companyId || result.has(row.id)) fail();
    result.set(row.id, normalizeVpsFinanceExpense(row));
  }
  // A full finance read started before a cost save must not erase its verified receipt.
  for (const old of previous) {
    if (old.companyId !== companyId || !old.vpsAssetCostVersion) continue;
    const next = result.get(old.id);
    if (!next || !(Date.parse(next.updatedAt) > Date.parse(old.vpsAssetCostVersion))) result.set(old.id, old);
  }
  return [...result.values()];
}
