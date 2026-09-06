import { HdApiError } from './client.js';
import { readCompleteVpsCollection } from './vpsCompleteCollection.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EDITABLE = ['productName', 'quantity', 'weightKg', 'unit', 'loanDate', 'dueDate', 'note'];
const pendingRequests = new Map();
const owns = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const nativeVersion = (row) => Number.isSafeInteger(row?.version) && row.version > 0;
const fail = (code, message = code) => { throw new HdApiError(message, { code }); };
const reconcile = () => fail('reconciliation_required', 'Phieu vay can doi soat du lieu VPS truoc khi thay doi.');

const requireUuid = (value) => {
  if (typeof value !== 'string' || !UUID.test(value)) fail('CUSTOMER_LOAN_ID_INVALID');
  return value;
};

const amount = (value) => {
  if (typeof value !== 'number' && typeof value !== 'string') fail('CUSTOMER_LOAN_AMOUNT_INVALID');
  if (typeof value === 'string' && value.trim() && !/^\d+(?:\.\d+)?$/.test(value.trim())) {
    fail('CUSTOMER_LOAN_AMOUNT_INVALID');
  }
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) fail('CUSTOMER_LOAN_AMOUNT_INVALID');
  return number;
};

const date = (value, nullable = false) => {
  if (nullable && (value === '' || value == null)) return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) fail('CUSTOMER_LOAN_DATE_INVALID');
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    fail('CUSTOMER_LOAN_DATE_INVALID');
  }
  return value;
};

const textValue = (value, required = false) => {
  if (typeof value !== 'string') fail('CUSTOMER_LOAN_TEXT_INVALID');
  const text = value.trim();
  if (required && !text) fail('CUSTOMER_LOAN_TEXT_REQUIRED');
  return text;
};

const requirePositive = ({ quantity, weightKg }) => {
  if (!(quantity > 0 || weightKg > 0)) fail('CUSTOMER_LOAN_AMOUNT_REQUIRED');
};

export function customerLoanEditablePayload(record) {
  const payload = {};
  for (const key of EDITABLE) {
    if (!owns(record, key)) continue;
    if (key === 'quantity' || key === 'weightKg') payload[key] = amount(record[key]);
    else if (key === 'loanDate' || key === 'dueDate') payload[key] = date(record[key], key === 'dueDate');
    else payload[key] = textValue(record[key], key === 'productName' || key === 'unit');
  }
  return payload;
}

// Compare every persisted field, including event identity/audit data, independent of key order.
const same = (left, right) => {
  if (Object.is(left, right)) return true;
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false;
  if (Array.isArray(left) !== Array.isArray(right)) return false;
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length
    && keys.every(key => owns(right, key) && same(left[key], right[key]));
};
const historyPrefix = (before, after) => Array.isArray(before) && Array.isArray(after)
  && after.length >= before.length && before.every((event, index) => same(event, after[index]));

export function normalizeVpsCustomerLoan(record) {
  // Never fabricate a native version or replace a migrated record's raw history.
  if (!nativeVersion(record)) return record;
  if (!Array.isArray(record.returns)) reconcile();
  return {
    ...record,
    quantity: amount(record.quantity),
    weightKg: amount(record.weightKg),
    returns: record.returns.map(event => ({
      ...event, quantity: amount(event.quantity), weightKg: amount(event.weightKg),
    })),
  };
}

export async function listVpsCustomerLoanPage(client, query = {}) {
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? query.limit ?? 100;
  if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100) {
    fail('CUSTOMER_LOAN_PAGINATION_INVALID');
  }
  const safeQuery = { page, pageSize };
  if (query.customerId != null) safeQuery.customerId = requireUuid(query.customerId);
  const result = await client.get('/master-data/customer-goods-loans', { query: safeQuery });
  if (!Array.isArray(result?.items) || !Number.isSafeInteger(result.total) || result.total < 0
    || result.page !== page || result.pageSize !== pageSize || result.items.length > pageSize) {
    fail('CUSTOMER_LOAN_PAGINATION_INVALID');
  }
  if (safeQuery.customerId && result.items.some(row => row.customerId !== safeQuery.customerId)) {
    fail('CUSTOMER_LOAN_CUSTOMER_MISMATCH');
  }
  return {
    items: result.items.map(normalizeVpsCustomerLoan),
    pagination: { totalItems: result.total, page, pageSize, hasNextPage: page * pageSize < result.total },
  };
}

const authorize = (session, permission) => {
  requireUuid(session?.companyId);
  if (!session.permissions?.includes(permission)) fail('CUSTOMER_LOAN_FORBIDDEN');
};

export async function loadVpsCustomerLoans(api, session, options = {}) {
  authorize(session, 'master-data.read');
  return readCompleteVpsCollection(query => api.listCustomerLoans(query), {
    ...options, companyId: session.companyId,
  });
}

export function mergeVpsCustomerLoans(previous, incoming, companyId) {
  requireUuid(companyId);
  const rows = new Map(previous.map(row => [`${row.companyId}:${row.id}`, row]));
  const seen = new Set();
  for (const record of incoming) {
    if (!record?.id || record.companyId !== companyId || seen.has(record.id)) fail('CUSTOMER_LOAN_SCOPE_MISMATCH');
    seen.add(record.id);
    const next = normalizeVpsCustomerLoan(record);
    const key = `${companyId}:${record.id}`;
    const old = rows.get(key);
    if (old) {
      if (!nativeVersion(old) || !nativeVersion(next) || old.version > next.version) continue;
      if (!historyPrefix(normalizeVpsCustomerLoan(old).returns, next.returns)) {
        rows.set(key, { ...old, reconciliationRequired: true });
        continue;
      }
    }
    rows.set(key, next);
  }
  // Missing rows may be legacy loans, archived loans or mutations newer than this load.
  return [...rows.values()];
}

const mutableLoan = (session, current) => {
  authorize(session, 'master-data.manage');
  if (!current || current.companyId !== session.companyId) fail('CUSTOMER_LOAN_SCOPE_MISMATCH');
  if (!nativeVersion(current) || current.reconciliationRequired) reconcile();
  requireUuid(current.id);
  requireUuid(current.customerId);
  if (current.isArchived) fail('CUSTOMER_LOAN_ARCHIVED');
  return normalizeVpsCustomerLoan(current);
};

const savedLoan = (result, session, customerId, current = null) => {
  if (!result || result.companyId !== session.companyId || result.customerId !== customerId
    || (current && result.id !== current.id)) fail('CUSTOMER_LOAN_SCOPE_MISMATCH');
  requireUuid(result.id);
  if (!nativeVersion(result)) reconcile();
  if (!['open', 'closed'].includes(result.status) || typeof result.isArchived !== 'boolean'
    || (current && result.version <= current.version)) fail('CUSTOMER_LOAN_RESPONSE_INVALID');
  const next = normalizeVpsCustomerLoan(result);
  if (current && !historyPrefix(current.returns, next.returns)) reconcile();
  return next;
};

// Retry identity contains only normalized operation content and tenant/record scope.
// Failed/ambiguous requests stay in memory; a verified create releases its key so
// a later, intentionally identical loan can be created as a separate record.
const requestFor = (operation, companyId, id, payload) => {
  const key = JSON.stringify([operation, companyId, id, payload]);
  if (!pendingRequests.has(key)) {
    if (!globalThis.crypto?.randomUUID) fail('CUSTOMER_LOAN_SECURE_UUID_UNAVAILABLE');
    pendingRequests.set(key, globalThis.crypto.randomUUID());
  }
  return { key, requestId: pendingRequests.get(key) };
};

export async function createVpsCustomerLoan(api, session, customer, data = {}) {
  authorize(session, 'master-data.manage');
  if (!customer || customer.companyId !== session.companyId || customer.isArchived) fail('CUSTOMER_LOAN_SCOPE_MISMATCH');
  const payload = {
    customerId: requireUuid(customer.id),
    ...customerLoanEditablePayload({
      productName: data.productName ?? data.itemName ?? '',
      quantity: data.quantity ?? 0, weightKg: data.weightKg ?? 0, unit: data.unit ?? 'Kg',
      loanDate: data.loanDate, dueDate: data.dueDate ?? null, note: data.note ?? '',
    }),
  };
  requirePositive(payload);
  const { key, requestId } = requestFor('create', session.companyId, customer.id, payload);
  const next = savedLoan(await api.createCustomerLoan({ requestId, ...payload }), session, customer.id);
  pendingRequests.delete(key);
  return next;
}

export async function updateVpsCustomerLoan(api, session, current, patch = {}) {
  const loan = mutableLoan(session, current);
  if (owns(patch, 'returns')) {
    if (Object.keys(patch).some(key => !['returns', 'status', 'closedAt'].includes(key))) {
      fail('CUSTOMER_LOAN_RETURN_PATCH_MIXED');
    }
    if (!Array.isArray(patch.returns) || patch.returns.length !== current.returns.length + 1
      || !historyPrefix(current.returns, patch.returns)) reconcile();
    const event = patch.returns.at(-1);
    if (!event || typeof event !== 'object') reconcile();
    if (event.id && current.returns.some(old => old.id === event.id)) reconcile();
    const payload = {
      version: loan.version,
      quantity: amount(event.quantity ?? 0), weightKg: amount(event.weightKg ?? 0),
      returnDate: date(event.returnDate), note: textValue(event.note ?? ''),
    };
    requirePositive(payload);
    const { requestId } = requestFor('return', session.companyId, loan.id, payload);
    const next = savedLoan(await api.returnCustomerLoan(loan.id, { requestId, ...payload }), session, loan.customerId, loan);
    const appended = next.returns[loan.returns.length];
    if (next.returns.length !== loan.returns.length + 1 || !appended || appended.requestId !== requestId
      || appended.quantity !== payload.quantity || appended.weightKg !== payload.weightKg
      || appended.returnDate !== payload.returnDate || appended.note !== payload.note) reconcile();
    return next;
  }
  if (Object.keys(patch).some(key => !EDITABLE.includes(key))) fail('CUSTOMER_LOAN_PATCH_FORBIDDEN');
  const payload = customerLoanEditablePayload(patch);
  if (Object.keys(payload).length === 0) fail('CUSTOMER_LOAN_PATCH_EMPTY');
  requirePositive({ ...loan, ...payload });
  const next = savedLoan(await api.updateCustomerLoan(loan.id, { version: loan.version, ...payload }), session, loan.customerId, loan);
  if (!same(loan.returns, next.returns)) reconcile();
  return next;
}

export async function archiveVpsCustomerLoan(api, session, current) {
  const loan = mutableLoan(session, current);
  const next = savedLoan(await api.archiveCustomerLoan(loan.id, { version: loan.version }), session, loan.customerId, loan);
  if (!next.isArchived || !same(loan.returns, next.returns)) reconcile();
  return next;
}

export const vpsCustomerLoanFailure = (error) => ({
  success: false, code: error?.code || 'CUSTOMER_LOAN_REQUEST_FAILED',
  message: error?.message || 'Khong the luu phieu vay VPS. Vui long thu lai.',
});
