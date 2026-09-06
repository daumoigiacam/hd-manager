import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHdConnectStagingApi } from '../src/api/hdConnectStaging.js';
import {
  archiveVpsCustomerLoan, createVpsCustomerLoan, loadVpsCustomerLoans,
  mergeVpsCustomerLoans, normalizeVpsCustomerLoan, updateVpsCustomerLoan,
  vpsCustomerLoanFailure,
} from '../src/api/vpsCustomerLoans.js';

const COMPANY = '11111111-1111-4111-8111-111111111111';
const OTHER_COMPANY = '22222222-2222-4222-8222-222222222222';
const CUSTOMER = '33333333-3333-4333-8333-333333333333';
const OTHER_CUSTOMER = '44444444-4444-4444-8444-444444444444';
const LOAN = '55555555-5555-4555-8555-555555555555';
const OTHER_LOAN = '66666666-6666-4666-8666-666666666666';
const EVENT = '77777777-7777-4777-8777-777777777777';
const REQUEST = '88888888-8888-4888-8888-888888888888';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const session = { companyId: COMPANY, permissions: ['master-data.read', 'master-data.manage'] };
const customer = { id: CUSTOMER, companyId: COMPANY, name: 'Customer' };
const draft = { productName: 'Crates', quantity: '10', weightKg: '25.5', unit: 'Box', loanDate: '2026-09-06', dueDate: '', note: 'Loan' };
const oldEvent = {
  id: EVENT, requestId: REQUEST, quantity: '2', weightKg: '0.5', returnDate: '2026-09-06',
  note: 'First return', createdAt: '2026-09-06T01:00:00Z', createdByEmpId: OTHER_CUSTOMER,
};
const row = (patch = {}) => ({
  ...draft, id: LOAN, companyId: COMPANY, customerId: CUSTOMER, customerName: 'Customer',
  dueDate: null, returns: [structuredClone(oldEvent)], version: 2, status: 'open', isArchived: false,
  createdAt: '2026-09-06T00:00:00Z', updatedAt: '2026-09-06T01:00:00Z', ...patch,
});
const uiEvent = (patch = {}) => ({
  id: 'clr_local', quantity: '0', weightKg: '2.5', returnDate: '2026-09-06', note: 'Second return',
  createdAt: '2026-09-06T02:00:00Z', createdByEmpId: 'local-user', ...patch,
});
const returnPatch = (loan, event = uiEvent()) => ({ returns: [...loan.returns, event], status: 'closed', closedAt: 'ui-only' });
const returnResponse = (loan, body) => row({
  ...loan, version: loan.version + 1,
  returns: [...loan.returns, {
    id: OTHER_LOAN, requestId: body.requestId, quantity: String(body.quantity), weightKg: String(body.weightKg),
    returnDate: body.returnDate, note: body.note, createdAt: '2026-09-06T02:00:00Z', createdByEmpId: OTHER_CUSTOMER,
  }],
});
const code = expected => error => { assert.equal(error.code, expected); return true; };

test('goods-loan transport uses only master-data routes and allowlisted fields', async () => {
  const calls = [];
  const api = createHdConnectStagingApi({
    get: async (...args) => { calls.push(['GET', ...args]); return { items: [], total: 0, page: 1, pageSize: 100 }; },
    post: async (...args) => { calls.push(['POST', ...args]); },
    patch: async (...args) => { calls.push(['PATCH', ...args]); },
  });
  await api.listCustomerLoans({ customerId: CUSTOMER, companyId: OTHER_COMPANY, limit: 100, sortBy: 'createdAt' });
  await api.createCustomerLoan({ ...draft, requestId: REQUEST, customerId: CUSTOMER, companyId: OTHER_COMPANY, returns: [oldEvent], status: 'closed' });
  await api.updateCustomerLoan(LOAN, { version: 2, quantity: '3', customerId: OTHER_CUSTOMER, companyId: OTHER_COMPANY, returns: [], status: 'closed' });
  await api.returnCustomerLoan(LOAN, { requestId: REQUEST, version: 2, quantity: 0, weightKg: 1, returnDate: '2026-09-06', note: '', returns: [], status: 'closed' });
  await api.archiveCustomerLoan(LOAN, { version: 3, companyId: OTHER_COMPANY });
  const base = '/master-data/customer-goods-loans';
  assert.deepEqual(calls[0], ['GET', base, { query: { page: 1, pageSize: 100, customerId: CUSTOMER } }]);
  assert.deepEqual(calls[1], ['POST', base, {
    requestId: REQUEST, customerId: CUSTOMER, ...draft, quantity: 10, weightKg: 25.5, dueDate: null,
  }, { retry: false, idempotencyKey: REQUEST }]);
  assert.deepEqual(calls[2], ['PATCH', `${base}/${LOAN}`, { version: 2, quantity: 3 }, { retry: false }]);
  assert.deepEqual(calls[3], ['POST', `${base}/${LOAN}/returns`, {
    requestId: REQUEST, version: 2, quantity: 0, weightKg: 1, returnDate: '2026-09-06', note: '',
  }, { retry: false, idempotencyKey: REQUEST }]);
  assert.deepEqual(calls[4], ['POST', `${base}/${LOAN}/archive`, { version: 3 }, { retry: false }]);
});

test('native decimal strings normalize without inventing quantity/kg coupling or changing source', () => {
  const raw = row({ quantity: '0', weightKg: '12.75' });
  const before = structuredClone(raw);
  const next = normalizeVpsCustomerLoan(raw);
  assert.equal(next.quantity, 0);
  assert.equal(next.weightKg, 12.75);
  assert.equal(next.returns[0].quantity, 2);
  assert.equal(next.returns[0].weightKg, 0.5);
  assert.equal(next.returns[0].createdByEmpId, oldEvent.createdByEmpId);
  assert.deepEqual(raw, before);
});

test('create normalizes values, allows either independent measure and excludes client authority fields', async () => {
  const bodies = [];
  const api = { createCustomerLoan: async body => {
    bodies.push(body);
    return row({ ...body, returns: [], quantity: String(body.quantity), weightKg: String(body.weightKg), version: 1 });
  } };
  for (const measures of [{ quantity: '0', weightKg: '4.5' }, { quantity: '3', weightKg: '' }]) {
    const saved = await createVpsCustomerLoan(api, session, customer, {
      ...draft, ...measures, companyId: OTHER_COMPANY, customerId: OTHER_CUSTOMER,
      status: 'closed', returns: [oldEvent], version: 99, warehouseId: 'ignored', amount: 999,
    });
    assert.equal(saved.companyId, COMPANY);
    assert.equal(saved.customerId, CUSTOMER);
  }
  assert.equal(bodies[0].quantity, 0);
  assert.equal(bodies[0].weightKg, 4.5);
  assert.equal(bodies[1].quantity, 3);
  assert.equal(bodies[1].weightKg, 0);
  assert.deepEqual(Object.keys(bodies[0]).sort(), ['requestId', 'customerId', 'productName', 'quantity', 'weightKg', 'unit', 'loanDate', 'dueDate', 'note'].sort());
  assert.match(bodies[0].requestId, UUID);
});

test('create retry keys survive changed UI metadata and other drafts but separate content/customer/tenant', async () => {
  const bodies = [];
  const api = { createCustomerLoan: async body => { bodies.push(body); throw new Error('offline'); } };
  const send = async (data, selected = customer, scope = session) => assert.rejects(createVpsCustomerLoan(api, scope, selected, data), /offline/);
  await send({ ...draft, note: 'retry-create', id: 'local-one' });
  await send({ ...draft, note: 'different' });
  await send({ ...draft, note: 'retry-create', id: 'local-two', createdAt: 'later', requestId: 'unsafe-id' });
  await send({ ...draft, note: 'retry-create' }, { ...customer, id: OTHER_CUSTOMER });
  await send({ ...draft, note: 'retry-create' }, { ...customer, companyId: OTHER_COMPANY }, { ...session, companyId: OTHER_COMPANY });
  assert.equal(bodies[0].requestId, bodies[2].requestId);
  assert.equal(new Set([0, 1, 3, 4].map(index => bodies[index].requestId)).size, 4);
  bodies.forEach(body => assert.match(body.requestId, UUID));
});

test('a verified create permits a later intentionally identical new loan', async () => {
  const ids = [];
  const api = { createCustomerLoan: async body => { ids.push(body.requestId); return row({ ...body, returns: [], version: 1 }); } };
  await createVpsCustomerLoan(api, session, customer, { ...draft, note: 'intentional duplicate' });
  await createVpsCustomerLoan(api, session, customer, { ...draft, note: 'intentional duplicate' });
  assert.notEqual(ids[0], ids[1]);
});

test('edit uses server integer version and only editable loan fields', async () => {
  const current = row();
  const before = structuredClone(current);
  let sent;
  const saved = await updateVpsCustomerLoan({ updateCustomerLoan: async (id, body) => {
    sent = { id, body };
    return row({ ...body, version: 3 });
  } }, session, current, { productName: ' Updated ', quantity: '0', weightKg: '30', dueDate: '' });
  assert.deepEqual(sent, { id: LOAN, body: { version: 2, productName: 'Updated', quantity: 0, weightKg: 30, dueDate: null } });
  assert.equal(saved.quantity, 0);
  assert.deepEqual(current, before);
  assert.equal(saved.returns.length, 1);
});

test('cumulative UI returns append exactly one immutable event via POST, ignoring UI status', async () => {
  const current = normalizeVpsCustomerLoan(row());
  const before = structuredClone(current);
  let sent;
  const api = { returnCustomerLoan: async (id, body) => { sent = { id, body }; return returnResponse(current, body); } };
  const saved = await updateVpsCustomerLoan(api, session, current, returnPatch(current));
  assert.equal(sent.id, LOAN);
  assert.deepEqual(Object.keys(sent.body).sort(), ['requestId', 'version', 'quantity', 'weightKg', 'returnDate', 'note'].sort());
  assert.equal(sent.body.quantity, 0);
  assert.equal(sent.body.weightKg, 2.5);
  assert.equal(sent.body.version, 2);
  assert.equal(saved.status, 'open');
  assert.equal(saved.returns.length, 2);
  assert.deepEqual(saved.returns[0], current.returns[0]);
  assert.deepEqual(current, before);
});

test('return retry identity ignores regenerated local ID/time but separates loan/version/content', async () => {
  const bodies = [];
  const api = { returnCustomerLoan: async (id, body) => { bodies.push({ id, ...body }); throw new Error('timeout'); } };
  const first = row({ note: 'return retry' });
  await assert.rejects(updateVpsCustomerLoan(api, session, first, returnPatch(first)), /timeout/);
  await assert.rejects(updateVpsCustomerLoan(api, session, first, returnPatch(first, uiEvent({ id: 'new-local', createdAt: 'later' }))), /timeout/);
  for (const [current, event] of [
    [row({ id: OTHER_LOAN }), uiEvent()], [row({ version: 3 }), uiEvent()], [first, uiEvent({ weightKg: 3 })],
  ]) await assert.rejects(updateVpsCustomerLoan(api, session, current, returnPatch(current, event)), /timeout/);
  assert.equal(bodies[0].requestId, bodies[1].requestId);
  assert.equal(new Set([0, 2, 3, 4].map(index => bodies[index].requestId)).size, 4);
});

test('return validation refuses deletion, replacement, reordering, audit edits and multiple appends before network', async () => {
  const current = row({ returns: [oldEvent, { ...oldEvent, id: OTHER_LOAN, quantity: '1' }] });
  let calls = 0;
  const api = { returnCustomerLoan: async () => { calls++; } };
  const badLists = [
    [], current.returns, [...current.returns, uiEvent(), uiEvent()],
    [current.returns[1], current.returns[0], uiEvent()],
    [{ ...oldEvent, quantity: '3' }, current.returns[1], uiEvent()],
    [{ ...oldEvent, createdByEmpId: 'forged' }, current.returns[1], uiEvent()],
    [{ ...oldEvent, note: 'rewritten' }, current.returns[1], uiEvent()],
    [{ ...oldEvent, requestId: OTHER_CUSTOMER }, current.returns[1], uiEvent()],
    [{ ...oldEvent, extra: true }, current.returns[1], uiEvent()],
    [current.returns[0], current.returns[1], uiEvent({ id: EVENT })],
    null,
  ];
  for (const returns of badLists) {
    await assert.rejects(updateVpsCustomerLoan(api, session, current, { returns }), code('reconciliation_required'));
  }
  assert.equal(calls, 0);
});

test('key ordering alone is not an immutable history change', async () => {
  const current = row();
  const reordered = Object.fromEntries(Object.entries(current.returns[0]).reverse());
  const saved = await updateVpsCustomerLoan({ returnCustomerLoan: async (id, body) => returnResponse(current, body) },
    session, current, { returns: [reordered, uiEvent()] });
  assert.equal(saved.returns.length, 2);
});

test('protected patch fields and mixed return/edit commands are refused', async () => {
  const current = row();
  const api = new Proxy({}, { get: () => () => assert.fail('Network must not be used') });
  for (const key of ['customerId', 'companyId', 'tenantId', 'status', 'isArchived', 'version', 'createdAt', 'closedAt']) {
    await assert.rejects(updateVpsCustomerLoan(api, session, current, { [key]: 'forged' }), code('CUSTOMER_LOAN_PATCH_FORBIDDEN'));
  }
  await assert.rejects(updateVpsCustomerLoan(api, session, current, { ...returnPatch(current), note: 'mixed' }), code('CUSTOMER_LOAN_RETURN_PATCH_MIXED'));
  await assert.rejects(updateVpsCustomerLoan(api, session, current, {}), code('CUSTOMER_LOAN_PATCH_EMPTY'));
});

for (const version of [undefined, null, '2', 'legacy-v2', 0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
  test(`legacy version ${String(version)} requires reconciliation for edit/return/archive`, async () => {
    const current = row({ version });
    const raw = structuredClone(current);
    const api = new Proxy({}, { get: () => () => assert.fail('Legacy mutation reached network') });
    assert.equal(normalizeVpsCustomerLoan(current), current);
    await assert.rejects(updateVpsCustomerLoan(api, session, current, { note: 'edit' }), code('reconciliation_required'));
    await assert.rejects(updateVpsCustomerLoan(api, session, current, returnPatch(current)), code('reconciliation_required'));
    await assert.rejects(archiveVpsCustomerLoan(api, session, current), code('reconciliation_required'));
    assert.deepEqual(current, raw);
  });
}

test('invalid quantities and dates fail closed before network for create/edit/return', async () => {
  const api = new Proxy({}, { get: () => () => assert.fail('Invalid input reached network') });
  for (const invalid of [-1, '-1', 'NaN', Infinity, NaN, true, {}, '1,5', '1kg']) {
    await assert.rejects(createVpsCustomerLoan(api, session, customer, { ...draft, quantity: invalid }), code('CUSTOMER_LOAN_AMOUNT_INVALID'));
    await assert.rejects(updateVpsCustomerLoan(api, session, row(), { weightKg: invalid }), code('CUSTOMER_LOAN_AMOUNT_INVALID'));
    await assert.rejects(updateVpsCustomerLoan(api, session, row(), returnPatch(row(), uiEvent({ quantity: invalid }))), code('CUSTOMER_LOAN_AMOUNT_INVALID'));
  }
  for (const invalid of ['2026-02-30', '06/09/2026', '2026-09-06T00:00:00Z', '']) {
    await assert.rejects(createVpsCustomerLoan(api, session, customer, { ...draft, loanDate: invalid }), code('CUSTOMER_LOAN_DATE_INVALID'));
    await assert.rejects(updateVpsCustomerLoan(api, session, row(), returnPatch(row(), uiEvent({ returnDate: invalid }))), code('CUSTOMER_LOAN_DATE_INVALID'));
  }
  await assert.rejects(createVpsCustomerLoan(api, session, customer, { ...draft, quantity: 0, weightKg: 0 }), code('CUSTOMER_LOAN_AMOUNT_REQUIRED'));
  await assert.rejects(updateVpsCustomerLoan(api, session, row(), { quantity: 0, weightKg: 0 }), code('CUSTOMER_LOAN_AMOUNT_REQUIRED'));
  await assert.rejects(updateVpsCustomerLoan(api, session, row(), returnPatch(row(), uiEvent({ quantity: 0, weightKg: 0 }))), code('CUSTOMER_LOAN_AMOUNT_REQUIRED'));
});

test('master-data permissions and tenant scope are required before any network operation', async () => {
  const api = new Proxy({}, { get: () => () => assert.fail('Unauthorized request reached network') });
  const denied = { ...session, permissions: ['finance.manage', 'inventory.manage'] };
  await assert.rejects(createVpsCustomerLoan(api, denied, customer, draft), code('CUSTOMER_LOAN_FORBIDDEN'));
  await assert.rejects(updateVpsCustomerLoan(api, denied, row(), { note: 'edit' }), code('CUSTOMER_LOAN_FORBIDDEN'));
  await assert.rejects(archiveVpsCustomerLoan(api, denied, row()), code('CUSTOMER_LOAN_FORBIDDEN'));
  await assert.rejects(loadVpsCustomerLoans(api, denied), code('CUSTOMER_LOAN_FORBIDDEN'));
  await assert.rejects(createVpsCustomerLoan(api, session, { ...customer, companyId: OTHER_COMPANY }, draft), code('CUSTOMER_LOAN_SCOPE_MISMATCH'));
  await assert.rejects(updateVpsCustomerLoan(api, session, row({ companyId: OTHER_COMPANY }), { note: 'edit' }), code('CUSTOMER_LOAN_SCOPE_MISMATCH'));
  await assert.rejects(archiveVpsCustomerLoan(api, session, row({ isArchived: true })), code('CUSTOMER_LOAN_ARCHIVED'));
});

test('archive is version guarded, keeps history and uses server archive state', async () => {
  const current = row();
  let sent;
  const saved = await archiveVpsCustomerLoan({ archiveCustomerLoan: async (id, body) => {
    sent = { id, body }; return row({ version: 3, isArchived: true });
  } }, session, current);
  assert.deepEqual(sent, { id: LOAN, body: { version: 2 } });
  assert.equal(saved.isArchived, true);
  assert.equal(saved.returns.length, 1);
  assert.equal(current.isArchived, false);
});

test('all mutation responses must match tenant and customer; update/archive must match record', async () => {
  for (const bad of [{ companyId: OTHER_COMPANY }, { customerId: OTHER_CUSTOMER }]) {
    await assert.rejects(createVpsCustomerLoan({ createCustomerLoan: async () => row(bad) }, session, customer, draft), code('CUSTOMER_LOAN_SCOPE_MISMATCH'));
  }
  for (const bad of [{ companyId: OTHER_COMPANY }, { customerId: OTHER_CUSTOMER }, { id: OTHER_LOAN }]) {
    const current = row();
    await assert.rejects(updateVpsCustomerLoan({ updateCustomerLoan: async () => row({ version: 3, ...bad }) }, session, current, { note: 'edit' }), code('CUSTOMER_LOAN_SCOPE_MISMATCH'));
    await assert.rejects(updateVpsCustomerLoan({ returnCustomerLoan: async (id, body) => ({ ...returnResponse(current, body), ...bad }) }, session, current, returnPatch(current)), code('CUSTOMER_LOAN_SCOPE_MISMATCH'));
    await assert.rejects(archiveVpsCustomerLoan({ archiveCustomerLoan: async () => row({ version: 3, isArchived: true, ...bad }) }, session, current), code('CUSTOMER_LOAN_SCOPE_MISMATCH'));
  }
});

test('missing/regressed versions and lost or rewritten response histories cannot be saved', async () => {
  for (const bad of [{ version: '3' }, { version: 2 }, { version: 1 }, { returns: null }, { returns: [] }, { returns: [{ ...oldEvent, note: 'changed' }] }]) {
    await assert.rejects(updateVpsCustomerLoan({ updateCustomerLoan: async () => row({ version: 3, ...bad }) }, session, row(), { note: 'edit' }));
  }
  const current = row();
  for (const modify of [
    saved => ({ ...saved, returns: current.returns }),
    saved => ({ ...saved, returns: [...saved.returns, saved.returns.at(-1)] }),
    saved => ({ ...saved, returns: [saved.returns[0], { ...saved.returns[1], requestId: REQUEST }] }),
    saved => ({ ...saved, returns: [saved.returns[0], { ...saved.returns[1], quantity: '999' }] }),
  ]) {
    await assert.rejects(updateVpsCustomerLoan({ returnCustomerLoan: async (id, body) => modify(returnResponse(current, body)) }, session, current, returnPatch(current)), code('reconciliation_required'));
  }
  await assert.rejects(archiveVpsCustomerLoan({ archiveCustomerLoan: async () => row({ version: 3, isArchived: false }) }, session, current), code('reconciliation_required'));
});

test('complete loading maps pageSize contract, checks tenants and preserves raw legacy history', async () => {
  const legacy = row({ id: 'cl_legacy', version: undefined, returns: [{ id: 'legacy-return', quantity: '2', audit: { source: 'old' } }] });
  const items = Array.from({ length: 100 }, (_, index) => row({ id: `native-${index}` }));
  items.push(legacy);
  const queries = [];
  const api = createHdConnectStagingApi({ get: async (path, { query }) => {
    assert.equal(path, '/master-data/customer-goods-loans');
    queries.push(query);
    return { items: items.slice((query.page - 1) * 100, query.page * 100), total: 101, page: query.page, pageSize: 100 };
  } });
  const loaded = await loadVpsCustomerLoans(api, session);
  assert.deepEqual(queries, [{ page: 1, pageSize: 100 }, { page: 2, pageSize: 100 }]);
  assert.equal(loaded.complete, true);
  assert.equal(loaded.items.length, 101);
  assert.equal(loaded.items.at(-1), legacy);
  assert.equal(loaded.items[0].weightKg, 25.5);
});

test('empty, failed, partial, repeated and cross-tenant pages never silently replace old state', async () => {
  const previous = [row({ id: 'legacy', version: undefined })];
  const empty = await loadVpsCustomerLoans(createHdConnectStagingApi({ get: async () => ({ items: [], total: 0, page: 1, pageSize: 100 }) }), session);
  assert.deepEqual(mergeVpsCustomerLoans(previous, empty.items, COMPANY), previous);
  for (const read of [
    async () => { throw new Error('offline'); },
    async () => ({ items: [row()], total: 2, page: 1, pageSize: 100 }),
    async () => ({ items: [row(), row()], total: 2, page: 1, pageSize: 100 }),
    async () => ({ items: [row({ companyId: OTHER_COMPANY })], total: 1, page: 1, pageSize: 100 }),
    async () => ({ items: [], total: 0, page: 2, pageSize: 100 }),
    async () => ({ items: [], total: '0', page: 1, pageSize: 100 }),
    async (path, { query }) => query.page === 1
      ? { items: Array.from({ length: 100 }, (_, i) => row({ id: `loan-${i}` })), total: 101, page: 1, pageSize: 100 }
      : Promise.reject(new Error('page two failed')),
  ]) {
    let state = previous;
    await assert.rejects((async () => {
      const loaded = await loadVpsCustomerLoans(createHdConnectStagingApi({ get: read }), session);
      state = mergeVpsCustomerLoans(state, loaded.items, COMPANY);
    })());
    assert.equal(state, previous);
  }
});

test('customer-filtered reads reject mismatched records and unsafe pagination/query IDs', async () => {
  const api = createHdConnectStagingApi({ get: async () => ({ items: [row()], total: 1, page: 1, pageSize: 100 }) });
  await assert.rejects(api.listCustomerLoans({ customerId: OTHER_CUSTOMER }), code('CUSTOMER_LOAN_CUSTOMER_MISMATCH'));
  await assert.rejects(api.listCustomerLoans({ customerId: 'legacy-id' }), code('CUSTOMER_LOAN_ID_INVALID'));
  for (const query of [{ page: 0 }, { pageSize: 101 }, { pageSize: '100' }]) {
    await assert.rejects(api.listCustomerLoans(query), code('CUSTOMER_LOAN_PAGINATION_INVALID'));
  }
});

test('merge never drops legacy rows/history, regresses a newer native version or accepts tenant mismatch', async () => {
  const legacy = row({ version: '2', returns: [{ id: 'legacy-event', quantity: '4', extra: true }] });
  const unrelated = row({ id: 'another-legacy', version: undefined });
  const foreign = row({ id: 'foreign', companyId: OTHER_COMPANY, version: undefined });
  const previous = [legacy, unrelated, foreign];
  const merged = mergeVpsCustomerLoans(previous, [row({ version: 10, returns: [] }), row({ id: OTHER_LOAN })], COMPANY);
  assert.equal(merged[0], legacy);
  assert.equal(merged[1], unrelated);
  assert.equal(merged[2], foreign);
  assert.equal(merged.length, 4);
  const native = normalizeVpsCustomerLoan(row({ version: 4 }));
  assert.equal(mergeVpsCustomerLoans([native], [row({ version: 3 })], COMPANY)[0], native);
  const guarded = mergeVpsCustomerLoans([native], [row({ version: 5, returns: [] })], COMPANY)[0];
  assert.equal(guarded.returns, native.returns);
  assert.equal(guarded.reconciliationRequired, true);
  await assert.rejects(archiveVpsCustomerLoan({}, session, guarded), code('reconciliation_required'));
  assert.throws(() => mergeVpsCustomerLoans(previous, [row({ companyId: OTHER_COMPANY })], COMPANY), code('CUSTOMER_LOAN_SCOPE_MISMATCH'));
});

const appSource = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const handlerSource = appSource.slice(appSource.indexOf('  const handleAddCustomerLoan ='), appSource.indexOf('  const handleAddProduct ='));
function appHandlers(api, loans = [row()], options = {}) {
  let state = loans;
  let updates = 0;
  let firebaseCalls = 0;
  const bindings = {
    isVpsApiMode: true, currentUser: session, myCompanyId: COMPANY, rawCustomers: [customer], rawCustomerLoans: loans,
    firebaseUser: null, getHdConnectStagingApi: () => api, getTodayString: () => '2026-09-06',
    setRawCustomerLoans: update => { updates++; state = update(state); },
    saveDataDocument: async () => { firebaseCalls++; },
    createVpsCustomerLoan, updateVpsCustomerLoan, archiveVpsCustomerLoan, mergeVpsCustomerLoans, vpsCustomerLoanFailure,
    getCustomerDisplayName: item => item.name, parseLooseQuantityValue: value => Number(value || 0), ...options,
  };
  const handlers = new Function(...Object.keys(bindings), `${handlerSource}\nreturn { handleAddCustomerLoan, handleEditCustomerLoan, handleDeleteCustomerLoan };`)(...Object.values(bindings));
  return { ...handlers, state: () => state, updates: () => updates, firebaseCalls: () => firebaseCalls };
}

test('App VPS handlers return explicit failures with no optimistic or Firebase mutation', async () => {
  const current = row();
  let rejectPending;
  const pending = new Promise((resolve, reject) => { rejectPending = reject; });
  const handlers = appHandlers({ createCustomerLoan: () => pending });
  const result = handlers.handleAddCustomerLoan(CUSTOMER, draft);
  assert.equal(handlers.updates(), 0);
  rejectPending(Object.assign(new Error('version conflict'), { code: 'VERSION_CONFLICT' }));
  assert.deepEqual(await result, { success: false, code: 'VERSION_CONFLICT', message: 'version conflict' });
  assert.equal(handlers.updates(), 0);
  for (const name of ['updateCustomerLoan', 'returnCustomerLoan', 'archiveCustomerLoan']) {
    const state = [current];
    const failing = appHandlers({ [name]: async () => { throw Object.assign(new Error('offline'), { code: 'OFFLINE' }); } }, state);
    const outcome = name === 'archiveCustomerLoan' ? await failing.handleDeleteCustomerLoan(LOAN)
      : await failing.handleEditCustomerLoan(LOAN, name === 'returnCustomerLoan' ? returnPatch(current) : { note: 'edit' });
    assert.equal(outcome.success, false);
    assert.equal(failing.updates(), 0);
    assert.equal(failing.state(), state);
    assert.equal(failing.firebaseCalls(), 0);
  }
  const legacy = appHandlers({}, [row({ version: '2' })]);
  assert.equal((await legacy.handleDeleteCustomerLoan(LOAN)).code, 'reconciliation_required');
  assert.equal(legacy.updates(), 0);
});

test('App commits only verified VPS records and preserves archived/legacy history', async () => {
  const legacy = row({ id: 'cl_old', version: undefined });
  const create = appHandlers({ createCustomerLoan: async body => row({ ...body, returns: [], version: 1 }) }, [legacy]);
  assert.equal((await create.handleAddCustomerLoan(CUSTOMER, draft)).success, true);
  assert.equal(create.state()[0], legacy);
  assert.equal(create.state()[1].quantity, 10);
  const current = row();
  const edit = appHandlers({ returnCustomerLoan: async (id, body) => returnResponse(current, body) }, [current, legacy]);
  assert.equal((await edit.handleEditCustomerLoan(LOAN, returnPatch(current))).success, true);
  assert.equal(edit.state()[0].returns.length, 2);
  const archive = appHandlers({ archiveCustomerLoan: async () => row({ version: 3, isArchived: true }) }, [current, legacy]);
  assert.equal((await archive.handleDeleteCustomerLoan(LOAN)).success, true);
  assert.equal(archive.state()[0].isArchived, true);
  assert.equal(archive.state()[0].returns.length, 1);
  assert.equal(archive.state()[1], legacy);
  const mismatch = appHandlers({ updateCustomerLoan: async () => row({ version: 3, companyId: OTHER_COMPANY }) });
  assert.equal((await mismatch.handleEditCustomerLoan(LOAN, { note: 'edit' })).success, false);
  assert.equal(mismatch.updates(), 0);
});

test('App core loading merges only fulfilled complete loan reads; Firebase path remains usable', async () => {
  const core = appSource.slice(appSource.indexOf('    const loadCoreVpsData ='), appSource.indexOf('    void loadCoreVpsData();'));
  assert.match(core, /currentUser\.permissions\?\.includes\('master-data\.read'\)/);
  assert.match(core, /loadVpsCustomerLoans\(api, currentUser, \{ cancelled: \(\) => cancelled \}\)/);
  assert.match(core, /customerLoansResult\.status === 'fulfilled' && customerLoansResult\.value/);
  assert.match(core, /setRawCustomerLoans\(previous => mergeVpsCustomerLoans\(previous, customerLoansResult\.value\.items, currentUser\.companyId\)\)/);
  assert.match(core, /customerLoans: customerLoansResult\.status === 'fulfilled' && Boolean\(customerLoansResult\.value\)/);
  const firebase = appHandlers({}, [row()], { isVpsApiMode: false, firebaseUser: { uid: 'firebase-user' } });
  assert.equal((await firebase.handleAddCustomerLoan(CUSTOMER, draft)).success, true);
  assert.equal((await firebase.handleEditCustomerLoan(LOAN, { note: 'Firebase edit' })).success, true);
  assert.equal((await firebase.handleDeleteCustomerLoan(LOAN)).success, true);
  assert.equal(firebase.firebaseCalls(), 3);
});
