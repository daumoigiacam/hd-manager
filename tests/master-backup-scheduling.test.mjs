import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { parse } from '@babel/parser';
import { collectBackupCollections } from '../src/services/backupReadScheduler.js';

const root = new URL('../', import.meta.url);
const appUrl = new URL('src/App.jsx', root);
const baselineRevision = '5f162f5ce85fd4dc746382f13a6a4170e4a29775';
const fixedTime = '2026-10-03T08:09:10.123Z';
const fixedMilliseconds = Date.parse(fixedTime);
process.env.TZ = 'Asia/Ho_Chi_Minh';
class BackupDate extends Date {
  constructor(...args) { super(...(args.length ? args : [fixedMilliseconds])); }
  static now() { return fixedMilliseconds; }
  static [Symbol.hasInstance](value) { return value instanceof Date; }
}

const names = new Set(['DATA_COLLECTION_NAMES', 'BACKUP_DATA_COLLECTIONS',
  'getLocalDateInputValue', 'getTodayString', 'sanitizeShareFileName', 'buildBackupFilename',
  'normalizeBackupSerializableValue', 'normalizeBackupCollectionItems', 'countBackupRecords',
  'isWarehouseDispatchForCurrentCompany', 'shouldIncludeBackupRecord',
  'handleCreateCompanyBackup', 'handleRunDailyAutoBackup']);
function sourceRuntime(source) {
  const declarations = new Map();
  const tree = parse(source, { sourceType: 'module', plugins: ['jsx'] });
  function visit(node) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'VariableDeclarator' && names.has(node.id?.name)) {
      assert.ok(!declarations.has(node.id.name), `Ambiguous backup declaration: ${node.id.name}`);
      let expression = node.init;
      if (expression.type === 'CallExpression' && expression.callee.name === 'useCallback') expression = expression.arguments[0];
      declarations.set(node.id.name, source.slice(expression.start, expression.end));
    }
    for (const [key, value] of Object.entries(node)) {
      if (['loc', 'start', 'end', 'extra', 'comments'].includes(key)) continue;
      if (Array.isArray(value)) value.forEach(visit);
      else if (value?.type) visit(value);
    }
  }
  visit(tree);
  return {
    evaluate(name, bindings = {}) {
      assert.ok(declarations.has(name), `Missing actual App backup declaration: ${name}`);
      const parameters = Object.entries(bindings).filter(([key]) => key !== name);
      return new Function(...parameters.map(([key]) => key),
        `"use strict"; const ${name} = (${declarations.get(name)}); return ${name};`)(...parameters.map(([, value]) => value));
    },
  };
}

let currentSource;
let currentRuntime;
let baselineRuntime;
function runtime(revision = 'current') {
  if (revision === 'baseline') {
    baselineRuntime ||= sourceRuntime(execFileSync('git', ['show', `${baselineRevision}:src/App.jsx`], {
      cwd: fileURLToPath(root), encoding: 'utf8', maxBuffer: 30 * 1024 * 1024,
    }));
    return baselineRuntime;
  }
  // Re-read on every harness creation, so a concurrent main patch is never hidden
  // by a process-level snapshot. Parse again only when the source has changed.
  const source = readFileSync(appUrl, 'utf8');
  if (source !== currentSource) {
    currentSource = source;
    currentRuntime = sourceRuntime(source);
  }
  return currentRuntime;
}

function backupBindings(app, extra = {}) {
  const bindings = { Date: BackupDate, myCompanyId: 'tenant-a',
    currentCompanyCustomerIds: new Set(['customer-a']), currentCompanyEmployeeIds: new Set(['employee-a']), ...extra };
  for (const name of ['DATA_COLLECTION_NAMES', 'BACKUP_DATA_COLLECTIONS', 'getLocalDateInputValue', 'getTodayString',
    'sanitizeShareFileName', 'normalizeBackupSerializableValue', 'normalizeBackupCollectionItems', 'countBackupRecords',
    'buildBackupFilename', 'isWarehouseDispatchForCurrentCompany', 'shouldIncludeBackupRecord']) {
    bindings[name] = app.evaluate(name, bindings);
  }
  return bindings;
}

const flush = async () => { for (let i = 0; i < 25; i += 1) await Promise.resolve(); };
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function fakeTimers() {
  const pending = new Map();
  const delays = [];
  let id = 0;
  return {
    pending, delays,
    setTimeout(callback, delay) { delays.push(delay); pending.set(++id, callback); return id; },
    tick() {
      const [key, callback] = pending.entries().next().value || [];
      assert.ok(callback, 'Expected a cooperative backup timer');
      pending.delete(key);
      callback();
    },
  };
}
async function drain(promise, timers) {
  let settled = false;
  let result;
  let failure;
  promise.then(value => { result = value; settled = true; }, error => { failure = error; settled = true; });
  for (let step = 0; step < 3000 && !settled; step += 1) {
    await flush();
    if (!settled && timers.pending.size) timers.tick();
  }
  assert.ok(settled, 'Backup must settle after the fake timers are drained');
  assert.equal(timers.pending.size, 0, 'Backup must not leave timers pending');
  if (failure) throw failure;
  return result;
}

function snapshot(id, data) { return { id, data: () => data, exists: () => true }; }
function fixtures(collectionNames, { legacy = false } = {}) {
  const data = new Map();
  for (const name of collectionNames) {
    const records = [
      snapshot(`${name}-doc-id`, { id: `${name}-data-id`, companyId: 'tenant-a', position: 0,
        createdAt: new Date('2026-09-27T11:22:33.000Z'), missing: undefined,
        bytes: new Uint8Array([0, 127, 255]), buffer: new ArrayBuffer(3),
        nested: { list: [undefined, null, 0.1, NaN, Infinity],
          timestamp: { toDate: () => new Date('2026-10-01T02:03:04.000Z') },
          brokenTimestamp: { toDate() { throw new Error('invalid timestamp'); }, toString: () => 'broken-timestamp' } } }),
      snapshot(`${name}-archived`, { companyId: 'tenant-a', isArchived: true, position: 1 }),
      snapshot(`${name}-foreign`, { companyId: 'tenant-b', position: 2 }),
      snapshot(`${name}-unowned`, { position: 3 }),
    ];
    if (legacy) records.push(snapshot(`${name}-legacy`, { sourceCompanyId: 'tenant-a', position: 4 }),
      snapshot(`${name}-source-owned`, { companyId: 'tenant-b', sourceCompanyId: 'tenant-a', position: 5 }));
    if (legacy && name === 'warehouseDispatches') records.push(
      snapshot('dispatch-customer-legacy', { customerId: 'customer-a', position: 6 }),
      snapshot('dispatch-employee-legacy', { empId: 'employee-a', position: 7 }),
      snapshot('dispatch-creator-legacy', { createdByEmpId: 'employee-a', position: 8 }),
      snapshot('dispatch-archived-legacy', { customerId: 'customer-a', isArchived: true, position: 9 }),
      snapshot('dispatch-foreign-legacy', { customerId: 'customer-b', position: 10 }));
    data.set(name, records);
  }
  data.set('companies', [snapshot('tenant-a', { companyId: 'tenant-a', name: 'Fallback company', createdAt: new Date(fixedTime) }),
    snapshot('tenant-b', { companyId: 'tenant-b', name: 'Other company' })]);
  return data;
}

function appHarness({ revision = 'current', preview = true, company = undefined, data = null, failAt = '', onRead = null } = {}) {
  const app = runtime(revision);
  const timers = fakeTimers();
  const calls = [];
  const fileWrites = [];
  const stateWrites = [];
  let activeReads = 0;
  let maximumReads = 0;
  const bindings = backupBindings(app, {
    firebaseUser: { uid: 'authorized-user' }, myCompanyId: 'tenant-a', appId: 'backup-fixture', db: {},
    isPreviewDataMode: preview,
    currentCompany: company === undefined ? { id: 'old-id', companyId: 'old-company', name: 'C\u00f4ng ty / A: * Depot',
      createdAt: new Date('2026-09-01T00:00:00Z'), bytes: new Uint8Array([1, 2]) } : company,
    activeTenantScopeRef: { current: 'tenant-a' },
    loyaltyActivityRef: { current: { tab: 'orders', lastInputAt: -Infinity } },
    document: { visibilityState: 'visible', activeElement: null }, navigator: { onLine: true },
    window: { setTimeout: timers.setTimeout }, collectBackupCollections,
    collection: (_db, ...path) => ({ kind: 'collection', path }),
    doc: (_db, ...path) => ({ kind: 'document', path }),
    firebaseWhere: (field, operator, value) => ({ field, operator, value }),
    firebaseQuery: (target, ...constraints) => ({ kind: 'query', target, constraints }),
    getAutoBackupStateForCompany: () => null,
    setAutoBackupStateForCompany: (...args) => { stateWrites.push(args); },
    saveAutomaticBackupFile: async payload => { fileWrites.push(payload); return { status: 'saved', path: '/mock/company.json' }; },
    Capacitor: { getPlatform: () => 'web' },
  });
  const fixture = data || fixtures(bindings.BACKUP_DATA_COLLECTIONS, { legacy: preview });
  const read = async (kind, target) => {
    calls.push({ kind, target });
    activeReads += 1;
    maximumReads = Math.max(maximumReads, activeReads);
    try {
      const reference = target.kind === 'query' ? target.target : target;
      const name = kind === 'getDoc' ? reference.path.at(-2) : reference.path.at(-1);
      if (onRead) await onRead(name, bindings, target);
      await Promise.resolve();
      if (name === failAt) throw Object.assign(new Error(`Read failed: ${name}`), { code: 'permission-denied' });
      if (kind === 'getDoc') {
        const document = (fixture.get(name) || []).find(item => item.id === reference.path.at(-1));
        return document || { id: reference.path.at(-1), exists: () => false };
      }
      let documents = fixture.get(name) || [];
      if (target.kind === 'query') {
        for (const constraint of target.constraints) {
          assert.equal(constraint.operator, '==');
          documents = documents.filter(item => item.data()[constraint.field] === constraint.value);
        }
      }
      return { docs: documents };
    } finally { activeReads -= 1; }
  };
  bindings.getDocs = target => read('getDocs', target);
  bindings.getDoc = target => read('getDoc', target);
  const create = () => app.evaluate('handleCreateCompanyBackup', bindings);
  bindings.handleCreateCompanyBackup = create();
  return { app, bindings, timers, calls, fileWrites, stateWrites, fixture,
    create, auto: () => app.evaluate('handleRunDailyAutoBackup', bindings),
    run: options => drain(bindings.handleCreateCompanyBackup(options), timers),
    get maximumReads() { return maximumReads; },
  };
}

test('scheduler matches old map/filter ordering and exact date/binary normalization', async () => {
  const old = backupBindings(runtime('baseline'));
  const current = backupBindings(runtime());
  const collectionNames = ['orders', 'warehouseDispatches', 'empty', 'products'];
  const data = fixtures(collectionNames, { legacy: true });
  data.set('empty', []);
  data.set('orders', [...data.get('orders'), ...Array.from({ length: 205 }, (_, i) =>
    snapshot(`row-${i}`, { companyId: i % 3 ? 'tenant-a' : 'tenant-b', quantity: i / 10 }))]);
  const expected = collectionNames.map(name => [name, data.get(name)
    .map(document => old.normalizeBackupSerializableValue({ id: document.id, ...document.data() }))
    .filter(record => old.shouldIncludeBackupRecord(name, record))]);
  const events = [];
  let active = 0;
  let maximum = 0;
  const result = await collectBackupCollections({ collectionNames,
    readCollection: async name => {
      active += 1;
      maximum = Math.max(maximum, active);
      events.push(`read:${name}`);
      await Promise.resolve();
      active -= 1;
      return data.get(name);
    },
    normalizeRecord: document => current.normalizeBackupSerializableValue({ id: document.id, ...document.data() }),
    includeRecord: current.shouldIncludeBackupRecord,
    yieldWork: async () => { events.push('yield'); },
  });
  assert.deepStrictEqual(result, expected);
  assert.equal(maximum, 1);
  assert.deepStrictEqual(events, ['yield', 'read:orders', 'yield', 'yield', 'yield', 'read:warehouseDispatches',
    'yield', 'read:empty', 'yield', 'read:products']);
  const record = result[0][1][0];
  assert.equal(record.id, 'orders-data-id');
  assert.equal(record.createdAt, '2026-09-27T11:22:33.000Z');
  assert.deepStrictEqual(record.bytes, { 0: 0, 1: 127, 2: 255 });
  assert.deepStrictEqual(record.buffer, {});
  assert.equal(record.missing, null);
  assert.equal(record.nested.timestamp, '2026-10-01T02:03:04.000Z');
  assert.equal(record.nested.brokenTimestamp, 'broken-timestamp');
});

test('scheduler never starts a second read while the first is unresolved', async () => {
  const reads = [];
  const first = deferred();
  const second = deferred();
  const pending = collectBackupCollections({ collectionNames: ['first', 'second'],
    readCollection: name => { reads.push(name); return name === 'first' ? first.promise : second.promise; },
    normalizeRecord: value => value, includeRecord: () => true, yieldWork: async () => {},
  });
  await flush();
  assert.deepStrictEqual(reads, ['first']);
  first.resolve([3, 1, 2]);
  await flush();
  assert.deepStrictEqual(reads, ['first', 'second']);
  second.resolve([6, 5]);
  assert.deepStrictEqual(await pending, [['first', [3, 1, 2]], ['second', [6, 5]]]);
});

test('scheduler checkpoints match chunk boundaries including excluded documents', async () => {
  for (const [length, chunkSize] of [[0, 100], [99, 100], [100, 100], [101, 100], [200, 100], [201, 100], [7, 3]]) {
    let visited = 0;
    const checkpoints = [];
    const result = await collectBackupCollections({ collectionNames: ['records'],
      readCollection: async () => Array.from({ length }, (_, i) => i),
      normalizeRecord: value => { visited += 1; return value; }, includeRecord: () => false,
      yieldWork: async () => { checkpoints.push(visited); }, chunkSize,
    });
    assert.deepStrictEqual(result, [['records', []]]);
    assert.deepStrictEqual(checkpoints, [0, ...Array.from({ length: Math.max(0, Math.ceil(length / chunkSize) - 1) },
      (_, i) => (i + 1) * chunkSize)]);
  }
  for (const chunkSize of [0, -1, 1.5, NaN, Infinity, '100', null]) {
    await assert.rejects(collectBackupCollections({ collectionNames: [], chunkSize }), TypeError);
  }
  assert.deepStrictEqual(await collectBackupCollections({ collectionNames: [], chunkSize: 100 }), []);
});

test('scheduler propagates read/normalization/filter/yield errors without returning partial entries', async () => {
  for (const stage of ['read', 'normalize', 'include', 'yield']) {
    const failure = new Error(`failure in ${stage}`);
    const reads = [];
    let checkpoint = 0;
    const options = { collectionNames: ['first', 'failure', 'never'],
      readCollection: async name => { reads.push(name); if (stage === 'read' && name === 'failure') throw failure; return [{ name }]; },
      normalizeRecord: record => { if (stage === 'normalize' && record.name === 'failure') throw failure; return record; },
      includeRecord: (name) => { if (stage === 'include' && name === 'failure') throw failure; return true; },
      yieldWork: async () => { if (stage === 'yield' && ++checkpoint === 2) throw failure; },
    };
    await assert.rejects(collectBackupCollections(options), error => error === failure);
    assert.deepStrictEqual(reads, stage === 'yield' ? ['first'] : ['first', 'failure']);
  }
});

test('scheduler aborts stale tenants before read, after read, and around chunk yields', async () => {
  for (const stage of ['initial', 'read', 'yield', 'chunk']) {
    let current = stage !== 'initial';
    const reads = [];
    let visited = 0;
    let checkpoints = 0;
    await assert.rejects(collectBackupCollections({ collectionNames: ['first', 'never'],
      isCurrent: () => current,
      readCollection: async name => { reads.push(name); if (stage === 'read') current = false;
        return Array.from({ length: 101 }, (_, i) => i); },
      normalizeRecord: value => { visited += 1; return value; }, includeRecord: () => true,
      yieldWork: async () => { checkpoints += 1; if (stage === 'yield' || (stage === 'chunk' && checkpoints === 2)) current = false; },
    }), { name: 'AbortError' });
    assert.deepStrictEqual(reads, stage === 'initial' || stage === 'yield' ? [] : ['first']);
    assert.equal(visited, stage === 'chunk' ? 100 : 0);
  }
});

test('actual App preview backup is exactly the old complete output including legacy ownership', async () => {
  for (const company of [undefined, null]) {
    const old = appHarness({ revision: 'baseline', company });
    const current = appHarness({ company });
    assert.deepStrictEqual(current.bindings.BACKUP_DATA_COLLECTIONS, old.bindings.BACKUP_DATA_COLLECTIONS);
    const expected = await old.run();
    const result = await current.run();
    assert.deepStrictEqual(result, expected);
    assert.equal(result.success, true);
    assert.equal(result.backup.exportedAt, fixedTime);
    assert.deepStrictEqual(Object.keys(result.backup.collections), ['companies', ...current.bindings.BACKUP_DATA_COLLECTIONS]);
    assert.equal(result.count, Object.values(result.backup.collections).slice(1).reduce((sum, rows) => sum + rows.length, 0));
    assert.equal(current.maximumReads, 1);
    assert.ok(current.timers.delays.every(delay => delay === 0));
    for (const name of current.bindings.BACKUP_DATA_COLLECTIONS) {
      assert.ok(result.backup.collections[name].some(row => row.id === `${name}-legacy` && row.sourceCompanyId === 'tenant-a'));
      assert.ok(result.backup.collections[name].some(row => row.id === `${name}-source-owned` && row.companyId === 'tenant-b'));
    }
    assert.deepStrictEqual(result.backup.collections.warehouseDispatches.filter(row => row.id.startsWith('dispatch-')).map(row => row.id),
      ['dispatch-customer-legacy', 'dispatch-employee-legacy', 'dispatch-creator-legacy']);
    assert.ok(current.calls.every(call => call.kind === 'getDocs' && call.target.kind === 'collection'));
  }
});

test('actual App production queries are tenant-scoped and authorized output equals the old backup', async () => {
  for (const company of [undefined, null]) {
    const old = appHarness({ revision: 'baseline', preview: false, company });
    const current = appHarness({ preview: false, company });
    const expected = await old.run();
    assert.deepStrictEqual(await current.run(), expected);
    const queries = current.calls.filter(call => call.kind === 'getDocs');
    assert.equal(queries.length, current.bindings.BACKUP_DATA_COLLECTIONS.length);
    assert.deepStrictEqual(queries.map(call => call.target.target.path.at(-1)), current.bindings.BACKUP_DATA_COLLECTIONS);
    for (const { target } of queries) {
      assert.equal(target.kind, 'query', 'Every production collection read must be an SDK query');
      assert.deepStrictEqual(target.constraints, [{ field: 'companyId', operator: '==', value: 'tenant-a' }]);
      assert.deepStrictEqual(target.target.path.slice(0, -1), ['artifacts', 'backup-fixture', 'public', 'data']);
    }
    const documents = current.calls.filter(call => call.kind === 'getDoc');
    assert.deepStrictEqual(documents.map(call => call.target.path), company === null
      ? [['artifacts', 'backup-fixture', 'public', 'data', 'companies', 'tenant-a']] : []);
    assert.equal(current.maximumReads, 1);
  }
  const missing = appHarness({ preview: false, company: null });
  missing.fixture.set('companies', []);
  assert.deepStrictEqual((await missing.run()).backup.collections.companies, []);
});

test('actual App chunks normalization at 100 records and preserves all document order', async () => {
  const current = appHarness();
  const name = current.bindings.BACKUP_DATA_COLLECTIONS[0];
  current.fixture.set(name, Array.from({ length: 205 }, (_, i) => snapshot(`document-${i}`, { companyId: 'tenant-a', order: i })));
  let visited = 0;
  const normalize = current.bindings.normalizeBackupSerializableValue;
  current.bindings.normalizeBackupSerializableValue = value => { visited += 1; return normalize(value); };
  current.bindings.handleCreateCompanyBackup = current.create();
  const pending = current.bindings.handleCreateCompanyBackup();
  await flush();
  assert.equal(visited, 0);
  current.timers.tick();
  await flush();
  assert.equal(visited, 100);
  current.timers.tick();
  await flush();
  assert.equal(visited, 200);
  current.timers.tick();
  await flush();
  assert.equal(visited, 205);
  const result = await drain(pending, current.timers);
  assert.deepStrictEqual(result.backup.collections[name].map(record => record.order), Array.from({ length: 205 }, (_, i) => i));
});

test('actual App background yields 500ms while hidden/offline/editable/warehouse/recent-input gates remain active', async () => {
  for (const gate of ['hidden', 'offline', 'input', 'textarea', 'select', 'contenteditable', 'warehouse', 'recentInput']) {
    const current = appHarness();
    const { bindings } = current;
    if (gate === 'hidden') bindings.document.visibilityState = 'hidden';
    if (gate === 'offline') bindings.navigator.onLine = false;
    if (['input', 'textarea', 'select', 'contenteditable'].includes(gate)) {
      bindings.document.activeElement = { matches: selector => {
        assert.equal(selector, 'input, textarea, select, [contenteditable="true"]');
        return true;
      } };
    }
    if (gate === 'warehouse') bindings.loyaltyActivityRef.current.tab = 'warehouse_dispatch';
    if (gate === 'recentInput') bindings.loyaltyActivityRef.current.lastInputAt = BackupDate.now();
    const pending = bindings.handleCreateCompanyBackup({ background: true });
    for (let i = 0; i < 3; i += 1) {
      await flush();
      assert.deepStrictEqual(current.calls, [], `No reads while ${gate} is active`);
      assert.equal(current.timers.delays.at(-1), 500);
      current.timers.tick();
    }
    await flush();
    assert.deepStrictEqual(current.calls, []);
    bindings.document.visibilityState = 'visible';
    bindings.navigator.onLine = true;
    bindings.document.activeElement = null;
    bindings.loyaltyActivityRef.current.tab = 'orders';
    bindings.loyaltyActivityRef.current.lastInputAt = -Infinity;
    const result = await drain(pending, current.timers);
    assert.equal(result.success, true);
    assert.ok(current.timers.delays.every(delay => delay === 500));
    assert.equal(current.maximumReads, 1);
    assert.deepStrictEqual(result, await appHarness({ revision: 'baseline' }).run());
  }
  const foreground = appHarness();
  foreground.bindings.document.visibilityState = 'hidden';
  foreground.bindings.navigator.onLine = false;
  foreground.bindings.loyaltyActivityRef.current.tab = 'warehouse_dispatch';
  assert.equal((await foreground.run()).success, true);
  assert.ok(foreground.timers.delays.every(delay => delay === 0));
});

test('actual App errors in every collection reject instead of returning incomplete backup success', async () => {
  const collectionNames = backupBindings(runtime()).BACKUP_DATA_COLLECTIONS;
  for (const preview of [false, true]) {
    for (const failAt of [...collectionNames, 'companies']) {
      const current = appHarness({ preview, failAt, company: null });
      await assert.rejects(current.run(), error => error.message === `Read failed: ${failAt}` && error.code === 'permission-denied');
      assert.deepStrictEqual(current.fileWrites, []);
      assert.deepStrictEqual(current.stateWrites, []);
      assert.equal(current.maximumReads, 1);
      const failedIndex = failAt === 'companies' ? collectionNames.length : collectionNames.indexOf(failAt);
      assert.equal(current.calls.length, failedIndex + 1, 'No reads may start after a collection fails');
    }
  }
});

test('actual App tenant switches abort during yields, collection reads, and company-document fallback', async () => {
  const firstName = backupBindings(runtime()).BACKUP_DATA_COLLECTIONS[0];
  for (const target of ['yield', firstName, 'companies']) {
    const current = appHarness({ preview: false, company: null,
      onRead: name => { if (name === target) current.bindings.activeTenantScopeRef.current = 'tenant-b'; },
    });
    const pending = current.bindings.handleCreateCompanyBackup();
    await flush();
    if (target === 'yield') current.bindings.activeTenantScopeRef.current = 'tenant-b';
    await assert.rejects(drain(pending, current.timers), { name: 'AbortError' });
    assert.deepStrictEqual(current.fileWrites, []);
    assert.deepStrictEqual(current.stateWrites, []);
    if (target === 'yield') assert.deepStrictEqual(current.calls, []);
    if (target === firstName) assert.equal(current.calls.length, 1);
  }
  for (const patch of [{ firebaseUser: null }, { myCompanyId: '' }]) {
    const current = appHarness();
    Object.assign(current.bindings, patch);
    current.bindings.handleCreateCompanyBackup = current.create();
    const result = await current.run();
    assert.equal(result.success, false);
    assert.deepStrictEqual(current.calls, []);
  }
});

test('actual auto-backup writes full baseline-equivalent content and preserves successful daily state', async () => {
  const old = appHarness({ revision: 'baseline' });
  const current = appHarness();
  const expected = await drain(old.auto()(), old.timers);
  const actual = await drain(current.auto()(), current.timers);
  assert.deepStrictEqual(actual, expected);
  assert.deepStrictEqual(current.fileWrites, old.fileWrites);
  assert.deepStrictEqual(current.stateWrites, old.stateWrites);
  assert.equal(current.fileWrites.length, 1);
  assert.equal(current.fileWrites[0].filename, `auto-${(await appHarness({ revision: 'baseline' }).run()).filename}`);
  assert.deepStrictEqual(JSON.parse(current.fileWrites[0].content), JSON.parse(JSON.stringify((await appHarness({ revision: 'baseline' }).run()).backup)));
  assert.ok(current.timers.delays.every(delay => delay === 500));
});

test('actual auto-backup post-collection await guard blocks file and state writes after tenant change', async () => {
  for (const result of [{ success: true, backup: { collections: {} }, filename: 'complete.json', count: 0 },
    { success: false, message: 'collection failed' }]) {
    const current = appHarness();
    const gate = deferred();
    current.bindings.handleCreateCompanyBackup = options => {
      assert.deepStrictEqual(options, { background: true });
      return gate.promise;
    };
    const pending = current.auto()();
    const rejected = assert.rejects(pending, { name: 'AbortError' });
    current.bindings.activeTenantScopeRef.current = 'tenant-b';
    gate.resolve(result);
    await rejected;
    assert.deepStrictEqual(current.fileWrites, [], 'Stale tenant must not save a file');
    assert.deepStrictEqual(current.stateWrites, [], 'Stale tenant must not write success or failure state');
  }
});

test('actual auto-backup post-file await guard blocks stale completion-state writes', async () => {
  const current = appHarness();
  const gate = deferred();
  current.bindings.handleCreateCompanyBackup = async () => ({ success: true,
    backup: { collections: { orders: [] } }, filename: 'complete.json', count: 0 });
  current.bindings.saveAutomaticBackupFile = payload => { current.fileWrites.push(payload); return gate.promise; };
  const pending = current.auto()();
  const rejected = assert.rejects(pending, { name: 'AbortError' });
  await flush();
  assert.equal(current.fileWrites.length, 1, 'File write begins in the original authorized tenant');
  current.bindings.activeTenantScopeRef.current = 'tenant-b';
  gate.resolve({ status: 'saved', path: '/mock/complete.json' });
  await rejected;
  assert.deepStrictEqual(current.stateWrites, [], 'No completion metadata may be written after the tenant switches');
});

test('actual auto-backup propagates collection failure without file writes or successful state', async () => {
  const current = appHarness({ failAt: 'orders' });
  await assert.rejects(drain(current.auto()(), current.timers), { code: 'permission-denied' });
  assert.deepStrictEqual(current.fileWrites, []);
  assert.deepStrictEqual(current.stateWrites, []);
});
