import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { HdApiClient } from '../src/api/client.js';
import { createHdConnectStagingApi } from '../src/api/hdConnectStaging.js';
import {
  archiveVpsHoliday, createVpsHoliday, loadVpsHolidays, mergeVpsHolidays,
  normalizeVpsHoliday, updateVpsHoliday, vpsHolidayMutationPayload, vpsHolidayQuery,
} from '../src/api/vpsHolidays.js';

const COMPANY = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER_COMPANY = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const USER = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const OTHER_USER = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const HOLIDAY = 'eeeeeeee-eeee-5eee-8eee-eeeeeeeeeeee';
const OTHER_HOLIDAY = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const REQUEST = '11111111-1111-4111-8111-111111111111';
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const session = { id: USER, companyId: COMPANY, permissions: ['hr.payroll.read', 'hr.payroll.manage'] };
const draft = { name: 'National Day', date: '2026-09-02', type: 'percentage', value: 250.125 };
const fields = record => Object.fromEntries(['name', 'date', 'type', 'value'].map(key => [key, record[key]]));
const row = (patch = {}) => ({
  ...draft, id: HOLIDAY, companyId: COMPANY, version: 2, isArchived: false,
  archivedAt: null, archivedByUserId: null,
  createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-02T00:00:00.000Z', ...patch,
});
const created = (body, patch = {}) => row({ ...fields(body), version: 1, ...patch });
const archived = (current = row(), patch = {}) => ({
  ...current, version: current.version + 1, isArchived: true,
  archivedAt: '2026-09-03T00:00:00.000Z', archivedByUserId: USER, ...patch,
});
const code = expected => error => { assert.equal(error.code, expected); return true; };
const noNetwork = new Proxy({}, { get: () => () => assert.fail('Invalid command reached network') });

test('holiday API uses exact GET/POST/PATCH/archive paths with body-only idempotency', async () => {
  const calls = [];
  const api = createHdConnectStagingApi({
    get: async (...args) => { calls.push(['GET', ...args]); return { items: [], nextOffset: null }; },
    post: async (...args) => { calls.push(['POST', ...args]); },
    patch: async (...args) => { calls.push(['PATCH', ...args]); },
  });
  await api.listManagerHolidays({ from: '2026-01-01', includeArchived: 'true', limit: '10', offset: '20' });
  await api.getManagerHoliday(HOLIDAY.toUpperCase());
  await api.createManagerHoliday({ requestId: REQUEST, ...draft });
  await api.updateManagerHoliday(HOLIDAY, { requestId: REQUEST, version: 2, name: 'Changed' });
  await api.archiveManagerHoliday(HOLIDAY, { requestId: REQUEST, version: 2 });
  const base = '/hr-suite/manager-holidays';
  assert.deepEqual(calls, [
    ['GET', base, { query: { from: '2026-01-01', includeArchived: true, limit: 10, offset: 20 } }],
    ['GET', `${base}/${HOLIDAY}`],
    ['POST', base, { requestId: REQUEST, ...draft }, { retry: false }],
    ['PATCH', `${base}/${HOLIDAY}`, { requestId: REQUEST, version: 2, name: 'Changed' }, { retry: false }],
    ['POST', `${base}/${HOLIDAY}/archive`, { requestId: REQUEST, version: 2 }, { retry: false }],
  ]);
  await assert.rejects(api.archiveManagerHoliday('hol_legacy', { requestId: REQUEST, version: 2 }), code('HR_HOLIDAY_ID_INVALID'));
  await assert.rejects(api.listManagerHolidays({ companyId: OTHER_COMPANY }), code('HR_HOLIDAY_INVALID'));
  assert.equal(calls.length, 5);
});

test('real client serialization keeps UUID in the body and sends no Idempotency-Key header', async () => {
  const requests = [];
  const client = new HdApiClient({
    baseUrl: 'https://example.test/api/v1',
    storage: { getItem: () => null, setItem() {}, removeItem() {} },
    fetchImpl: async (url, init) => {
      requests.push({ url, init });
      return new Response(JSON.stringify({ success: true, data: created(JSON.parse(init.body)), error: null, meta: {} }), {
        status: 201, headers: { 'content-type': 'application/json' },
      });
    },
  });
  await createVpsHoliday(createHdConnectStagingApi(client), session, draft);
  assert.equal(requests[0].url, 'https://example.test/api/v1/hr-suite/manager-holidays');
  assert.match(JSON.parse(requests[0].init.body).requestId, UUID_V4);
  assert.equal(requests[0].init.headers['Idempotency-Key'], undefined);
  assert.equal(requests.length, 1);
});

test('current card numeric values and timestamps map to four server business fields', async () => {
  const bodies = [];
  const api = { createManagerHoliday: async body => { bodies.push(body); return created(body); } };
  for (const input of [
    { ...draft, name: '  National Day  ' },
    { ...draft, value: 0.125 },
    { ...draft, type: 'fixed', value: 500_000 },
    { ...draft, type: 'percentage', value: 1e-30 },
    { ...draft, type: 'fixed', value: Number.MAX_SAFE_INTEGER },
  ]) {
    const result = await createVpsHoliday(api, session, { ...input, createdAt: 'UI timestamp', updatedAt: 'another UI timestamp' });
    assert.equal(result.value, input.value);
    assert.equal(result.name, input.name.trim());
    assert.equal(result.version, 1);
  }
  assert.deepEqual(Object.keys(bodies[0]).sort(), ['requestId', 'name', 'date', 'type', 'value'].sort());
  assert.equal(bodies[0].name, 'National Day');
  assert.equal(bodies[0].value, 250.125);
});

test('holiday dates match backend Gregorian/date-only bounds without future or recurrence rules', async () => {
  const api = { createManagerHoliday: async body => created(body) };
  for (const date of ['2024-02-29', '0001-01-01', '9999-12-31']) {
    assert.equal((await createVpsHoliday(api, session, { ...draft, date })).date, date);
  }
  for (const date of ['2026-02-29', '2024-02-30', '2026-04-31', '2026-00-01', '2026-13-01', '2026-01-00', '0000-01-01', '2026-9-2', '2026-09-02T00:00:00Z', '2026-09-02+07:00']) {
    await assert.rejects(createVpsHoliday(noNetwork, session, { ...draft, date }), code('HR_HOLIDAY_INVALID'));
  }
});

test('name/type/value validation mirrors the strict backend and never parses monetary strings', async () => {
  const invalid = [
    { name: '' }, { name: '   ' }, { name: 'a'.repeat(201) }, { name: 'bad\0name' }, { name: '\tName' }, { name: 'bad\x7f' }, { name: 12 },
    { type: 'recurring' }, { type: 'Fixed' }, { value: '500.000' }, { value: '100,5' }, { value: '100' },
    { value: null }, { value: false }, { value: 0 }, { value: -1 }, { value: NaN }, { value: Infinity },
    { value: Number.MAX_SAFE_INTEGER + 1 }, { value: 1e-31 },
  ];
  for (const patch of invalid) {
    await assert.rejects(createVpsHoliday(noNetwork, session, { ...draft, ...patch }), code('HR_HOLIDAY_INVALID'));
  }
  await assert.rejects(createVpsHoliday(noNetwork, session, { ...draft, type: 'fixed', value: 0.5 }), code('HR_HOLIDAY_FIXED_VALUE_MUST_BE_INTEGER'));
  await assert.rejects(updateVpsHoliday(noNetwork, session, row(), { type: 'fixed' }), code('HR_HOLIDAY_FIXED_VALUE_MUST_BE_INTEGER'));
  await assert.rejects(updateVpsHoliday(noNetwork, session, row({ type: 'fixed', value: 100 }), { value: 1.5 }), code('HR_HOLIDAY_FIXED_VALUE_MUST_BE_INTEGER'));
});

test('mutation builders reject client authority, unknown fields and invalid request IDs', async () => {
  for (const key of ['companyId', 'id', 'tenantId', 'isArchived', 'archivedAt', 'archivedByEmpId', 'metadata', 'sourceReference', 'payrollPeriodId']) {
    await assert.rejects(createVpsHoliday(noNetwork, session, { ...draft, [key]: 'forged' }), code('HR_HOLIDAY_INVALID'));
    await assert.rejects(updateVpsHoliday(noNetwork, session, row(), { name: 'Changed', [key]: 'forged' }), code('HR_HOLIDAY_INVALID'));
  }
  for (const requestId of ['hol_123', HOLIDAY, '', null]) {
    assert.throws(() => vpsHolidayMutationPayload('create', { ...draft, requestId }), code('HR_HOLIDAY_INVALID'));
  }
  assert.throws(() => vpsHolidayMutationPayload('update', { requestId: REQUEST, version: 2 }), code('HR_HOLIDAY_INVALID'));
  assert.throws(() => vpsHolidayMutationPayload('archive', { requestId: REQUEST, version: 2, isArchived: true }), code('HR_HOLIDAY_INVALID'));
  assert.throws(() => vpsHolidayMutationPayload('create', { requestId: REQUEST, ...draft, createdAt: 'UI timestamp' }), code('HR_HOLIDAY_INVALID'));
});

test('create retries survive new timestamps and interleaved drafts, but separate actor/tenant/content', async () => {
  const bodies = [];
  const api = { createManagerHoliday: async body => { bodies.push(body); throw new Error('offline'); } };
  const send = (data, actor = session) => assert.rejects(createVpsHoliday(api, actor, data), /offline/);
  await send({ ...draft, name: '  Retry  ', createdAt: 'first', updatedAt: 'first' });
  await send({ ...draft, name: 'Another' });
  await send({ ...draft, name: 'Retry', createdAt: 'later', updatedAt: 'later' });
  await send({ ...draft, name: 'Retry', value: 300 });
  await send({ ...draft, name: 'Retry' }, { ...session, id: OTHER_USER });
  await send({ ...draft, name: 'Retry' }, { ...session, companyId: OTHER_COMPANY });
  assert.equal(bodies[0].requestId, bodies[2].requestId);
  assert.equal(new Set([0, 1, 3, 4, 5].map(index => bodies[index].requestId)).size, 5);
  bodies.forEach(body => assert.match(body.requestId, UUID_V4));
});

test('successful creation releases retry intent so identical date/name holidays remain allowed', async () => {
  const bodies = [];
  const api = { createManagerHoliday: async body => { bodies.push(body); return created(body); } };
  await createVpsHoliday(api, session, draft);
  await createVpsHoliday(api, session, draft);
  assert.notEqual(bodies[0].requestId, bodies[1].requestId);
});

test('updates send partial fields plus native version; archive sends only UUID and version', async () => {
  const calls = [];
  const current = row();
  const snapshot = structuredClone(current);
  const updated = await updateVpsHoliday({ updateManagerHoliday: async (id, body) => {
    calls.push({ id, body }); return row({ ...body, version: 3 });
  } }, session, current, { type: 'fixed', value: 500_000 });
  assert.deepEqual({ ...calls[0].body, requestId: 'uuid' }, { requestId: 'uuid', version: 2, type: 'fixed', value: 500_000 });
  assert.equal(updated.type, 'fixed');
  const saved = await archiveVpsHoliday({ archiveManagerHoliday: async (id, body) => {
    calls.push({ id, body }); return archived(current);
  } }, session, current);
  assert.deepEqual({ ...calls[1].body, requestId: 'uuid' }, { requestId: 'uuid', version: 2 });
  assert.equal(saved.isArchived, true);
  assert.equal(saved.archivedByUserId, USER);
  assert.deepEqual(current, snapshot);
});

test('edit/archive retry keys include operation, target, version and normalized patch', async () => {
  const calls = [];
  const api = {
    updateManagerHoliday: async (id, body) => { calls.push({ id, ...body }); throw new Error('offline'); },
    archiveManagerHoliday: async (id, body) => { calls.push({ id, ...body }); throw new Error('offline'); },
  };
  const current = row();
  await assert.rejects(updateVpsHoliday(api, session, current, { name: '  Changed  ', value: 200 }), /offline/);
  await assert.rejects(updateVpsHoliday(api, session, current, { value: 200, name: 'Changed' }), /offline/);
  await assert.rejects(updateVpsHoliday(api, session, current, { name: 'Changed', value: 201 }), /offline/);
  await assert.rejects(updateVpsHoliday(api, session, row({ version: 3 }), { name: 'Changed', value: 200 }), /offline/);
  await assert.rejects(updateVpsHoliday(api, session, row({ id: OTHER_HOLIDAY }), { name: 'Changed', value: 200 }), /offline/);
  await assert.rejects(archiveVpsHoliday(api, session, current), /offline/);
  await assert.rejects(archiveVpsHoliday(api, session, current), /offline/);
  assert.equal(calls[0].requestId, calls[1].requestId);
  assert.equal(calls[5].requestId, calls[6].requestId);
  assert.equal(new Set([0, 2, 3, 4, 5].map(index => calls[index].requestId)).size, 5);
});

for (const version of [undefined, null, '2', 'legacy-version', 0, -1, 1.5, 2_147_483_648]) {
  test(`historical holiday version ${String(version)} stays raw and requires reconciliation`, async () => {
    const legacy = row({ version, value: '500.000', audit: { original: true } });
    const before = structuredClone(legacy);
    assert.equal(normalizeVpsHoliday(legacy), legacy);
    await assert.rejects(updateVpsHoliday(noNetwork, session, legacy, { name: 'Changed' }), code('reconciliation_required'));
    await assert.rejects(archiveVpsHoliday(noNetwork, session, legacy), code('reconciliation_required'));
    assert.deepEqual(legacy, before);
  });
}

test('maximum native version remains readable but cannot overflow during update/archive', async () => {
  const current = row({ version: 2_147_483_647 });
  assert.equal(normalizeVpsHoliday(current).version, 2_147_483_647);
  await assert.rejects(updateVpsHoliday(noNetwork, session, current, { name: 'Changed' }), code('reconciliation_required'));
  await assert.rejects(archiveVpsHoliday(noNetwork, session, current), code('reconciliation_required'));
});

test('read/manage permissions, tenant, actor UUID and active state are checked before network', async () => {
  const denied = { ...session, permissions: ['master-data.manage', 'hr.employee.read'], role: 'owner' };
  await assert.rejects(createVpsHoliday(noNetwork, denied, draft), code('HR_HOLIDAY_PERMISSION_REQUIRED'));
  await assert.rejects(updateVpsHoliday(noNetwork, denied, row(), { name: 'Changed' }), code('HR_HOLIDAY_PERMISSION_REQUIRED'));
  await assert.rejects(archiveVpsHoliday(noNetwork, denied, row()), code('HR_HOLIDAY_PERMISSION_REQUIRED'));
  await assert.rejects(loadVpsHolidays(noNetwork, denied), code('HR_HOLIDAY_PERMISSION_REQUIRED'));
  await assert.rejects(createVpsHoliday(noNetwork, { ...session, id: undefined }, draft), code('HR_HOLIDAY_ID_INVALID'));
  await assert.rejects(archiveVpsHoliday(noNetwork, session, row({ companyId: OTHER_COMPANY })), code('HR_HOLIDAY_SCOPE_MISMATCH'));
  await assert.rejects(archiveVpsHoliday(noNetwork, session, archived()), code('HR_HOLIDAY_NOT_FOUND'));
});

test('mutation responses must match tenant/record, version, fields and archive actor', async () => {
  for (const patch of [{ companyId: OTHER_COMPANY }, { version: '1' }, { version: 2 }, { value: 999 }, { value: '250.125' }, { date: '2026-02-29' }, { isArchived: true }, { createdAt: null }]) {
    await assert.rejects(createVpsHoliday({ createManagerHoliday: async body => created(body, patch) }, session, draft));
  }
  for (const patch of [{ companyId: OTHER_COMPANY }, { id: OTHER_HOLIDAY }, { version: 2 }, { version: 4 }, { version: '3' }, { name: 'Unexpected' }]) {
    await assert.rejects(updateVpsHoliday({ updateManagerHoliday: async () => row({ version: 3, name: 'Changed', ...patch }) }, session, row(), { name: 'Changed' }));
    await assert.rejects(archiveVpsHoliday({ archiveManagerHoliday: async () => archived(row(), patch) }, session, row()));
  }
  for (const patch of [{ isArchived: false }, { archivedAt: null }, { archivedByUserId: OTHER_USER }]) {
    await assert.rejects(archiveVpsHoliday({ archiveManagerHoliday: async () => archived(row(), patch) }, session, row()), code('HR_HOLIDAY_RESPONSE_INVALID'));
  }
});

test('list query parsing and validation match limit/offset/date contract', () => {
  assert.deepEqual(vpsHolidayQuery(), { includeArchived: false, limit: 100, offset: 0 });
  assert.deepEqual(vpsHolidayQuery({ limit: '200', offset: '100', includeArchived: 'false', from: '2024-02-29' }), {
    includeArchived: false, limit: 200, offset: 100, from: '2024-02-29',
  });
  for (const query of [{ includeArchived: 'yes' }, { includeArchived: 1 }, { limit: '1e2' }, { limit: 201 }, { limit: 0 }, { offset: -1 }, { offset: 2_147_483_648 }, { from: '2026-02-29' }, { companyId: COMPANY }, { sort: 'date' }]) {
    assert.throws(() => vpsHolidayQuery(query), code('HR_HOLIDAY_INVALID'));
  }
  assert.throws(() => vpsHolidayQuery({ from: '2026-12-31', to: '2026-01-01' }), code('HR_HOLIDAY_DATE_RANGE_INVALID'));
});

const numberedRows = count => Array.from({ length: count }, (_, index) => row({ id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}` }));
test('core holiday loading follows nextOffset to completion and includes archived rows', async () => {
  const all = numberedRows(203);
  all[1] = archived(all[1]);
  const calls = [];
  const api = createHdConnectStagingApi({ get: async (path, { query }) => {
    calls.push({ path, query });
    return { items: all.slice(query.offset, query.offset + query.limit), nextOffset: query.offset + query.limit < all.length ? query.offset + query.limit : null };
  } });
  const result = await loadVpsHolidays(api, session);
  assert.deepEqual(result.items, all);
  assert.equal(result.complete, true);
  assert.deepEqual(calls.map(call => call.query), [0, 100, 200].map(offset => ({ includeArchived: true, limit: 100, offset })));
  assert.ok(calls.every(call => call.path === '/hr-suite/manager-holidays'));
});

test('malformed, repeated, partial, failed and foreign pages cannot commit a partial calendar', async () => {
  const old = [row({ id: 'hol_historical', version: undefined, audit: { source: 'legacy' } })];
  const first = numberedRows(100);
  for (const reader of [
    async () => { throw new Error('offline'); },
    async () => ({ items: [] }),
    async () => ({ items: [row()], nextOffset: 100 }),
    async () => ({ items: first, nextOffset: 0 }),
    async () => ({ items: first, nextOffset: '100' }),
    async () => ({ items: [row(), row()], nextOffset: null }),
    async () => ({ items: [row({ companyId: OTHER_COMPANY })], nextOffset: null }),
    async query => query.offset === 0 ? { items: first, nextOffset: 100 } : { items: [first[0]], nextOffset: null },
    async query => query.offset === 0 ? { items: first, nextOffset: 100 } : { items: [], nextOffset: null },
    async query => query.offset === 0 ? { items: first, nextOffset: 100 } : Promise.reject(new Error('second page failed')),
  ]) {
    let state = old;
    await assert.rejects((async () => {
      const loaded = await loadVpsHolidays({ listManagerHolidays: reader }, session);
      state = mergeVpsHolidays(state, loaded.items, COMPANY);
    })());
    assert.equal(state, old);
  }
});

test('cancelled/filter-violating reads fail closed and valid empty reads preserve historical records', async () => {
  await assert.rejects(loadVpsHolidays(noNetwork, session, { cancelled: () => true }), code('HR_HOLIDAY_LOAD_CANCELLED'));
  let cancelled = false;
  await assert.rejects(loadVpsHolidays({ listManagerHolidays: async () => { cancelled = true; return { items: [], nextOffset: null }; } }, session, { cancelled: () => cancelled }), code('HR_HOLIDAY_LOAD_CANCELLED'));
  await assert.rejects(loadVpsHolidays({ listManagerHolidays: async () => ({ items: [archived()], nextOffset: null }) }, session, { query: { includeArchived: false } }), code('HR_HOLIDAY_FILTER_MISMATCH'));
  await assert.rejects(loadVpsHolidays({ listManagerHolidays: async () => ({ items: [row()], nextOffset: null }) }, session, { query: { from: '2027-01-01' } }), code('HR_HOLIDAY_FILTER_MISMATCH'));
  const old = [row({ version: undefined })];
  const result = await loadVpsHolidays({ listManagerHolidays: async () => ({ items: [], nextOffset: null }) }, session);
  assert.deepEqual(mergeVpsHolidays(old, result.items, COMPANY), old);
});

test('merge retains historical raw data, stale/newer native versions and valid duplicate dates', async () => {
  const historical = row({ version: '2', audit: { original: 'untouched' } });
  const absent = row({ id: 'hol_old', version: undefined });
  const foreign = row({ id: 'hol_foreign', companyId: OTHER_COMPANY, version: undefined });
  const merged = mergeVpsHolidays([historical, absent, foreign], [row({ version: 10, name: 'New' }), row({ id: OTHER_HOLIDAY })], COMPANY);
  assert.equal(merged[0], historical);
  assert.equal(merged[1], absent);
  assert.equal(merged[2], foreign);
  assert.equal(merged.length, 4);
  const native = row({ version: 5 });
  assert.equal(mergeVpsHolidays([native], [row({ version: 4 })], COMPANY)[0], native);
  assert.equal(mergeVpsHolidays([native], [row({ version: 5, name: 'Unexpected' })], COMPANY)[0], native);
  assert.equal(mergeVpsHolidays([native], [archived(native)], COMPANY)[0].isArchived, true);
  const legacy = row({ id: 'hol_imported', version: undefined, value: '100,5' });
  const loaded = await loadVpsHolidays({ listManagerHolidays: async () => ({ items: [legacy], nextOffset: null }) }, session);
  assert.equal(loaded.items[0], legacy);
  assert.throws(() => mergeVpsHolidays([historical], [row({ companyId: OTHER_COMPANY })], COMPANY), code('HR_HOLIDAY_SCOPE_MISMATCH'));
});

const appSource = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const handlerSource = appSource.slice(appSource.indexOf('  const handleAddHoliday ='), appSource.indexOf('  const handleAddMessage ='));
function appHandlers(api, previous = [row()], extra = {}) {
  let state = previous;
  let updates = 0;
  const firebaseWrites = [];
  const bindings = {
    isVpsApiMode: true, currentUser: session, myCompanyId: COMPANY, rawHolidays: previous, firebaseUser: null,
    getHdConnectStagingApi: () => api, createVpsHoliday, archiveVpsHoliday, mergeVpsHolidays,
    setRawHolidays: update => { updates++; state = update(state); },
    db: {}, appId: 'test-app', doc: (...args) => args,
    setDoc: async (...args) => { firebaseWrites.push(args); }, ...extra,
  };
  return {
    ...new Function(...Object.keys(bindings), `${handlerSource}\nreturn { handleAddHoliday, handleDeleteHoliday };`)(...Object.values(bindings)),
    state: () => state, updates: () => updates, firebaseWrites,
  };
}

test('App holiday handlers await verification, propagate failures, and never optimistically mutate', async () => {
  let reject;
  const pending = new Promise((resolve, fail) => { reject = fail; });
  const create = appHandlers({ createManagerHoliday: () => pending });
  const saving = create.handleAddHoliday(draft);
  assert.equal(create.updates(), 0);
  reject(new Error('timeout'));
  await assert.rejects(saving, /timeout/);
  assert.equal(create.updates(), 0);
  assert.equal(create.firebaseWrites.length, 0);
  const previous = [row()];
  const archive = appHandlers({ archiveManagerHoliday: async () => { throw new Error('HR_HOLIDAY_CHANGED_RELOAD'); } }, previous);
  await assert.rejects(archive.handleDeleteHoliday(HOLIDAY), /CHANGED_RELOAD/);
  assert.equal(archive.state(), previous);
  assert.equal(archive.updates(), 0);
  assert.equal(archive.firebaseWrites.length, 0);
  const legacy = appHandlers(noNetwork, [row({ version: '2' })]);
  await assert.rejects(legacy.handleDeleteHoliday(HOLIDAY), code('reconciliation_required'));
  const mismatch = appHandlers({ createManagerHoliday: async body => created(body, { companyId: OTHER_COMPANY }) });
  await assert.rejects(mismatch.handleAddHoliday(draft), code('HR_HOLIDAY_SCOPE_MISMATCH'));
  assert.equal(mismatch.updates(), 0);
});

test('App only merges saved native calendar records and keeps Firebase add/soft-archive unchanged', async () => {
  const legacy = row({ id: 'hol_legacy', version: undefined });
  const create = appHandlers({ createManagerHoliday: async body => created(body) }, [legacy]);
  assert.equal((await create.handleAddHoliday(draft)).success, true);
  assert.equal(create.state()[0], legacy);
  assert.equal(create.state()[1].version, 1);
  const archive = appHandlers({ archiveManagerHoliday: async () => archived() }, [row(), legacy]);
  assert.equal((await archive.handleDeleteHoliday(HOLIDAY)).success, true);
  assert.equal(archive.state()[0].isArchived, true);
  assert.equal(archive.state()[1], legacy);
  const firebase = appHandlers(noNetwork, [], { isVpsApiMode: false, firebaseUser: { uid: 'test-user' } });
  await firebase.handleAddHoliday(draft);
  await firebase.handleDeleteHoliday('hol_legacy');
  assert.equal(firebase.firebaseWrites.length, 2);
  assert.equal(firebase.firebaseWrites[0][1].companyId, COMPANY);
  assert.equal(firebase.firebaseWrites[1][1].isArchived, true);
  assert.deepEqual(firebase.firebaseWrites[1][2], { merge: true });
  assert.equal(firebase.updates(), 0);
});

const coreSource = appSource.slice(appSource.indexOf('    const loadCoreVpsData ='), appSource.indexOf('    void loadCoreVpsData();'));
async function coreLoad(listManagerHolidays, previous, actor = session) {
  let state = previous;
  let loaded;
  let status;
  const noop = () => {};
  const bindings = {
    currentUser: actor, api: { listManagerHolidays, getInventoryReconciliationStatus: async () => ({}), getManagerSettings: async () => ({ companyId: COMPANY, settings: {}, version: 'v1' }) },
    readComplete: async () => ({ items: [] }), hydrateVpsEmployeeProfiles: async () => [],
    loadVpsCustomerLoans: async () => ({ items: [] }), mergeVpsCustomerLoans: (old) => old,
    loadVpsHolidays, mergeVpsHolidays,
    loadVpsSalaryAdvances: async () => ({ items: [] }),
    mergeVpsSalaryAdvances: old => old,
    mergeVpsSalaryAdvanceFinancials: old => old,
    normalizeVpsAttendance: item => item,
    setRawHolidays: update => { state = update(state); },
    setLoadedCollections: update => { loaded = update({}); }, setRealtimeStatus: value => { status = value; },
  };
  for (const name of ['setCurrentCompany', 'setRawCompanies', 'setRawCustomers', 'setRawCustomerLoans', 'setRawOrders', 'setRawPayments', 'setRawProducts', 'setVpsMasterData', 'setRawEmployees', 'setRawNotifications', 'setRawAttendance', 'setVpsInventoryReconciliation', 'setRawAdvanceRequests', 'setRawFinancials']) bindings[name] = noop;
  await new Function(...Object.keys(bindings), `let cancelled = false; let loading = false;\n${coreSource}\nreturn loadCoreVpsData();`)(...Object.values(bindings));
  return { state, loaded, status };
}

test('App core load commits complete holiday pages only and does not read without payroll permission', async () => {
  const previous = [row({ id: 'hol_old', version: undefined })];
  const success = await coreLoad(async () => ({ items: [row()], nextOffset: null }), previous);
  assert.equal(success.state.length, 2);
  assert.equal(success.state[0], previous[0]);
  assert.equal(success.loaded.holidays, true);
  const failure = await coreLoad(async () => { throw new Error('unavailable'); }, previous);
  assert.equal(failure.state, previous);
  assert.equal(failure.loaded.holidays, false);
  assert.equal(failure.status.state, 'degraded');
  assert.match(failure.status.error, /holidays/);
  const denied = await coreLoad(() => assert.fail('Unauthorized read'), previous, { ...session, permissions: [] });
  assert.equal(denied.state, previous);
  assert.equal(denied.loaded.holidays, false);
});

test('current holiday-card handlers do not reset drafts or claim success on VPS errors', async () => {
  const card = appSource.slice(appSource.indexOf('function HolidayConfigCard('), appSource.indexOf('function EmployeeView('));
  const source = card.slice(card.indexOf('  const parseHolidayRewardValue ='), card.indexOf('\n  return ('));
  const statuses = [];
  let draftResets = 0;
  const bindings = {
    isVpsApiMode: true, holidayForm: { ...draft, value: '250,125' }, canManage: true,
    onAddHoliday: async data => { assert.equal(data.value, 250.125); throw new Error('request timeout'); },
    onDeleteHoliday: async () => { throw Object.assign(new Error('Reconciliation required'), { code: 'reconciliation_required' }); },
    setHolidaySaveStatus: value => statuses.push(value), setHolidayForm: () => { draftResets++; },
    setShowHolidayForm: () => { draftResets++; }, capitalizeFirst: value => value,
    getTodayString: () => '2026-09-02', parseInputCurrency: Number, window: { confirm: () => true },
    getFriendlyFirebaseErrorMessage: () => assert.fail('VPS error must not claim queued Firebase success'),
  };
  const cardHandlers = new Function(...Object.keys(bindings), `${source}\nreturn { handleHolidaySubmit, handleDeleteHolidayConfig };`)(...Object.values(bindings));
  await cardHandlers.handleHolidaySubmit({ preventDefault() {} });
  assert.equal(statuses.at(-1), 'request timeout');
  assert.equal(draftResets, 0);
  await cardHandlers.handleDeleteHolidayConfig(HOLIDAY);
  assert.equal(statuses.at(-1), 'Reconciliation required');
});
