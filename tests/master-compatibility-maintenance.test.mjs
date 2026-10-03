import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { parse } from '@babel/parser';
import { createCooperativeTaskQueue } from '../src/services/cooperativeTaskQueue.js';

function extract(source) {
  const declarations = new Map();
  const assignments = new Map();
  const effects = [];
  const text = node => source.slice(node.start, node.end);
  function walk(node) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'VariableDeclarator' && node.id?.name && node.init) {
      if (!declarations.has(node.id.name)) declarations.set(node.id.name, text(node.init));
    }
    if (node.type === 'AssignmentExpression' && text(node.left).startsWith('compatibilityMaintenance')) {
      assignments.set(text(node.left), text(node.right));
    }
    if (node.type === 'CallExpression' && node.callee?.name === 'useEffect') {
      effects.push({ callback: text(node.arguments[0]), dependencies: node.arguments[1] ? text(node.arguments[1]) : 'undefined' });
    }
    for (const [key, value] of Object.entries(node)) {
      if (['loc', 'start', 'end', 'extra', 'comments'].includes(key)) continue;
      if (Array.isArray(value)) value.forEach(walk);
      else if (value?.type) walk(value);
    }
  }
  walk(parse(source, { sourceType: 'module', plugins: ['jsx'] }));
  const evaluate = (expression, bindings) => new Function(...Object.keys(bindings), `return (${expression});`)(...Object.values(bindings));
  const effect = anchor => {
    const matches = effects.filter(item => item.callback.includes(anchor));
    assert.equal(matches.length, 1, `one actual effect contains ${anchor}`);
    return matches[0];
  };
  return {
    declaration(name, bindings) {
      assert.ok(declarations.has(name), `declaration ${name}`);
      return evaluate(declarations.get(name), bindings);
    },
    assignment(name, bindings) {
      assert.ok(assignments.has(name), `assignment ${name}`);
      return evaluate(assignments.get(name), bindings);
    },
    effect: (anchor, bindings) => evaluate(effect(anchor).callback, bindings)(),
    dependencies: (anchor, bindings) => evaluate(effect(anchor).dependencies, bindings),
  };
}

const runtime = extract(readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8'));
// Independent old effects, not a duplicate of the queue implementation under test.
const reference = extract(execFileSync('git', ['show', '5f162f5ce85fd4dc746382f13a6a4170e4a29775:src/App.jsx'], {
  cwd: new URL('..', import.meta.url), encoding: 'utf8', maxBuffer: 8 * 1024 * 1024,
}));
const helperNames = ['normalizeLookupText', 'normalizeCustomerHonorific', 'inferCustomerHonorificFromName',
  'stripCustomerHonorificPrefix', 'toTitleCase', 'getCustomerHonorific'];
function helpers(source, bindings) {
  if (source === runtime) {
    for (const name of ['LOOKUP_NORMALIZATION_CACHE_LIMIT', 'LOOKUP_NORMALIZATION_MAX_LENGTH', 'lookupNormalizationCache']) {
      bindings[name] = source.declaration(name, bindings);
    }
  }
  for (const name of helperNames) bindings[name] = source.declaration(name, bindings);
}

function timers() {
  let now = 0;
  let id = 0;
  let callbacks = 0;
  const pending = new Map();
  const schedule = (callback, delay) => { const key = ++id; pending.set(key, { callback, at: now + delay }); return key; };
  const cancel = key => pending.delete(key);
  const start = () => {
    const [key, item] = [...pending].sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0] || [];
    assert.ok(item, 'a callback is pending');
    pending.delete(key);
    callbacks++;
    now = Math.max(now, item.at);
    return { callback: item.callback, completion: item.callback() };
  };
  return { schedule, cancel, pending, start, get now() { return now; }, get callbacks() { return callbacks; },
    async tick() { await start().completion; },
    async advance(ms) {
      const until = now + ms;
      while ([...pending.values()].some(item => item.at <= until)) await start().completion;
      now = until;
    },
  };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function harness({ customers = [], warehouseDispatches = [], write = async () => {}, online = true, visible = true } = {}) {
  const clock = timers();
  const epoch = Date.parse('2026-10-03T00:00:00Z');
  class ClockDate extends Date {
    constructor(...args) { super(...(args.length ? args : [epoch + clock.now])); }
    static now() { return epoch + clock.now; }
  }
  class Surface extends EventTarget {
    listeners = new Map();
    addEventListener(name, listener) {
      super.addEventListener(name, listener);
      const list = this.listeners.get(name) || new Set();
      list.add(listener);
      this.listeners.set(name, list);
    }
    removeEventListener(name, listener) {
      super.removeEventListener(name, listener);
      const list = this.listeners.get(name);
      list?.delete(listener);
      if (!list?.size) this.listeners.delete(name);
    }
  }
  const browser = new Surface();
  browser.setTimeout = clock.schedule;
  browser.clearTimeout = clock.cancel;
  const document = new Surface();
  document.visibilityState = visible ? 'visible' : 'hidden';
  document.activeElement = null;
  const writes = [];
  const recent = [];
  const errors = [];
  const queues = [];
  let raw = warehouseDispatches;
  let normalizations = 0;
  let inFlight = 0;
  let peakInFlight = 0;
  const bindings = {
    window: browser, document, navigator: { onLine: online }, Date: ClockDate,
    console: { warn: (...args) => errors.push(args), error: (...args) => errors.push(args) },
    firebaseUser: { uid: 'user-a' }, myCompanyId: 'tenant-a', db: 'db', appId: 'fixture-app',
    activeTenantScopeRef: { current: 'tenant-a' },
    loyaltyActivityRef: { current: { tab: 'home', lastInputAt: epoch - 2000 } },
    customers, warehouseDispatches,
    customerHonorificMigrationRef: { current: new Set() }, warehouseDispatchCompanyMigrationRef: { current: new Set() },
    compatibilityMaintenanceRef: { current: null }, compatibilityMaintenanceCallbackRef: { current: null },
    compatibilityMaintenanceDataRef: { current: null },
    compatibilityMaintenanceCustomerCacheRef: { current: new WeakMap() },
    createCooperativeTaskQueue: options => {
      const queue = createCooperativeTaskQueue(options);
      queues.push(queue);
      return queue;
    },
    setRawWarehouseDispatches: update => { raw = update(raw); },
    rememberRecentLocalWrite: (...args) => recent.push(args),
    doc: (...parts) => parts,
  };
  const perform = async call => {
    writes.push(call);
    inFlight++;
    peakInFlight = Math.max(peakInFlight, inFlight);
    try { return await write(call, bindings); }
    finally { inFlight--; }
  };
  bindings.saveDataDocument = (collection, id, payload, options) => perform({ kind: 'dispatch', collection, id, payload, options });
  bindings.setDoc = (path, payload, options) => perform({ kind: 'customer', path, id: path.at(-1), payload, options });
  helpers(runtime, bindings);
  for (const name of ['inferCustomerHonorificFromName', 'toTitleCase']) {
    const actual = bindings[name];
    bindings[name] = (...args) => { normalizations++; return actual(...args); };
  }
  for (const name of ['getIdleScheduler', 'cancelIdleScheduler', 'scheduleMaintenanceWork', 'cancelMaintenanceWork']) {
    bindings[name] = runtime.declaration(name, bindings);
  }
  const anchors = ['compatibilityMaintenanceRef.current = queue', 'compatibilityMaintenanceRef.current?.enqueue'];
  const previous = new Map();
  const cleanups = new Map();
  function render(patch = {}) {
    Object.assign(bindings, patch);
    if ('warehouseDispatches' in patch) raw = patch.warehouseDispatches;
    bindings.compatibilityMaintenanceDataRef.current = runtime.assignment('compatibilityMaintenanceDataRef.current', bindings);
    bindings.compatibilityMaintenanceCallbackRef.current = runtime.assignment('compatibilityMaintenanceCallbackRef.current', bindings);
    for (const anchor of anchors) {
      const next = runtime.dependencies(anchor, bindings);
      const last = previous.get(anchor);
      if (last && next.every((value, index) => Object.is(value, last[index]))) continue;
      cleanups.get(anchor)?.();
      previous.set(anchor, next);
      cleanups.set(anchor, runtime.effect(anchor, bindings));
    }
  }
  render();
  return { clock, browser, document, writes, recent, errors, queues, bindings, render,
    get raw() { return raw; }, get normalizations() { return normalizations; },
    get inFlight() { return inFlight; }, get peakInFlight() { return peakInFlight; },
    input() { bindings.loyaltyActivityRef.current.lastInputAt = ClockDate.now(); },
    online(value) { bindings.navigator.onLine = value; browser.dispatchEvent(new Event(value ? 'online' : 'offline')); },
    visible(value) { document.visibilityState = value ? 'visible' : 'hidden'; document.dispatchEvent(new Event('visibilitychange')); },
    dispose() { for (const cleanup of cleanups.values()) cleanup?.(); cleanups.clear(); },
  };
}

function oldResult(kind, record, bindings) {
  const writes = [];
  const recent = [];
  let raw = kind === 'dispatch' ? [record] : [];
  const old = { ...bindings,
    customers: kind === 'customer' ? [record] : [], warehouseDispatches: raw,
    customerHonorificMigrationRef: { current: new Set() }, warehouseDispatchCompanyMigrationRef: { current: new Set() },
    setRawWarehouseDispatches: update => { raw = update(raw); },
    rememberRecentLocalWrite: (...args) => recent.push(args),
    saveDataDocument: (collection, id, payload, options) => {
      writes.push({ kind: 'dispatch', collection, id, payload, options });
      return Promise.resolve();
    },
    setDoc: (path, payload, options) => {
      writes.push({ kind: 'customer', path, id: path.at(-1), payload, options });
      return Promise.resolve();
    },
  };
  helpers(reference, old);
  reference.effect(kind === 'dispatch' ? 'const legacyDispatches = warehouseDispatches.filter' : 'const customersToNormalize = customers.filter', old);
  return { writes, raw, recent };
}

test('300 eligible compatibility jobs match the frozen old payloads, merge paths and dispatch bookkeeping exactly', async () => {
  const names = ['Anh NGUYEN   VAN A', 'Ch\u1ecb: TR\u1ea6N b', 'a. LE c', 'c, PHAM d', 'CHU   VO e', 'co DO f'];
  const customers = Array.from({ length: 150 }, (_, index) => ({ id: `c-${index}`, name: names[index % names.length] }));
  const warehouseDispatches = Array.from({ length: 150 }, (_, index) => ({ id: `d-${index}`, note: `row-${index}`,
    updatedAt: index % 2 ? '2026-09-01T00:00:00Z' : '' }));
  const h = harness({ customers, warehouseDispatches, write: async (call, bindings) => {
    const record = (call.kind === 'dispatch' ? warehouseDispatches : customers).find(item => item.id === call.id);
    const expected = oldResult(call.kind, record, bindings);
    assert.deepEqual(expected.writes, [call]);
    if (call.kind === 'dispatch') {
      assert.deepEqual(h.raw.find(item => item.id === call.id), expected.raw[0]);
      assert.deepEqual(h.recent.at(-1), expected.recent[0]);
    }
  } });
  assert.equal(h.normalizations, 0, 'render and enqueue never normalize customer fields');
  assert.equal(h.queues[0].size, 151, 'dispatch writes plus one deferred customer classifier');
  assert.equal(h.bindings.customerHonorificMigrationRef.current.size, 0);
  assert.equal(h.bindings.warehouseDispatchCompanyMigrationRef.current.size, 0);
  await h.clock.advance(1700 * 302);
  assert.equal(h.writes.length, 300, 'all eligible rows, not only a 25-row dispatch batch, finish');
  assert.equal(h.peakInFlight, 1);
  assert.equal(h.recent.length, 150);
  assert.equal(h.bindings.customerHonorificMigrationRef.current.size, 150);
  assert.equal(h.bindings.warehouseDispatchCompanyMigrationRef.current.size, 150);
  h.render({ customers: [...customers], warehouseDispatches: [...warehouseDispatches] });
  await h.clock.advance(3400);
  assert.equal(h.queues[0].size, 0, 'completed migration IDs prevent duplicate writes');
  h.dispose();
});

test('active acknowledgements serialize both migration kinds and repeated renders retain pending jobs', async () => {
  const pending = deferred();
  const h = harness({ customers: [{ id: 'shared', name: 'Anh OLD NAME' }],
    warehouseDispatches: [{ id: 'shared' }], write: () => pending.promise });
  await h.clock.tick();
  const active = h.clock.start();
  assert.equal(h.writes.length, 1);
  assert.equal(h.inFlight, 1);
  assert.equal(h.bindings.warehouseDispatchCompanyMigrationRef.current.has('shared'), true);
  assert.equal(h.bindings.customerHonorificMigrationRef.current.has('shared'), false);
  h.render({ customers: [{ id: 'shared', name: 'Ch\u1ecb LATEST NAME' }] });
  h.render();
  assert.equal(h.queues.length, 1, 'renders do not recreate the session queue');
  assert.equal(h.queues[0].size, 1, 'the pending classifier coalesces latest customer renders');
  assert.equal(h.clock.pending.size, 0);
  h.online(false);
  pending.resolve();
  await active.completion;
  assert.equal(h.clock.pending.size, 0);
  h.online(true);
  await h.clock.advance(3400);
  assert.deepEqual(h.writes[1].payload, { name: 'Latest Name', customerHonorific: 'chi' });
  assert.equal(h.peakInFlight, 1);
  h.dispose();
});

test('hidden/offline queues park without polling or claiming IDs and resume only visible plus online', async () => {
  const h = harness({ customers: [{ id: 'c', name: 'Anh TEST' }], warehouseDispatches: [{ id: 'd' }], online: false });
  assert.equal(h.clock.pending.size, 0);
  await h.clock.advance(600000);
  h.visible(true);
  assert.equal(h.clock.pending.size, 0);
  h.visible(false);
  h.online(true);
  assert.equal(h.clock.pending.size, 0);
  assert.equal(h.normalizations, 0);
  assert.equal(h.bindings.customerHonorificMigrationRef.current.size, 0);
  assert.equal(h.bindings.warehouseDispatchCompanyMigrationRef.current.size, 0);
  h.visible(true);
  await h.clock.advance(5100);
  assert.equal(h.writes.length, 2);
  h.dispose();
  assert.equal(h.clock.pending.size, 0);
  assert.equal(h.document.listeners.size, 0);
  assert.equal(h.browser.listeners.size, 0);
});

test('warehouse entry, editable focus and recent input defer all normalization and retain pending work', async () => {
  const h = harness({ customers: [{ id: 'c', name: 'Anh TEST' }], warehouseDispatches: [{ id: 'd' }] });
  h.bindings.loyaltyActivityRef.current.tab = 'warehouse_dispatch';
  for (let i = 0; i < 5; i++) { h.render(); h.input(); await h.clock.advance(1700); }
  assert.equal(h.normalizations, 0);
  h.bindings.loyaltyActivityRef.current.tab = 'home';
  h.document.activeElement = { matches: selector => {
    assert.equal(selector, 'input, textarea, select, [contenteditable="true"]');
    return true;
  } };
  await h.clock.advance(1700);
  assert.equal(h.writes.length, 0);
  h.document.activeElement = null;
  await h.clock.advance(1699);
  h.input();
  await h.clock.advance(1);
  assert.equal(h.writes.length, 0);
  assert.equal(h.normalizations, 0);
  assert.equal(h.queues[0].size, 2);
  await h.clock.advance(5100);
  assert.equal(h.writes.length, 2);
  h.dispose();
});

test('parked jobs recheck edited/removed records and latest dispatch timestamps, not captured payloads', async () => {
  const h = harness({ customers: [{ id: 'c', name: 'Anh OLD NAME' }, { id: 'gone', name: 'Anh GONE' }],
    warehouseDispatches: [{ id: 'd' }, { id: 'claimed' }], visible: false });
  h.render({ customers: [{ id: 'c', name: 'Custom edited name' }], warehouseDispatches: [
    { id: 'd', updatedAt: '2026-09-02T00:00:00Z' }, { id: 'claimed', companyId: 'tenant-a' },
  ] });
  assert.equal(h.normalizations, 0);
  h.visible(true);
  await h.clock.advance(1700 * 4);
  assert.equal(h.writes.length, 1);
  assert.equal(h.writes[0].payload.updatedAt, '2026-09-02T00:00:00Z');
  assert.equal(h.bindings.customerHonorificMigrationRef.current.size, 0);
  assert.deepEqual([...h.bindings.warehouseDispatchCompanyMigrationRef.current], ['d']);
  h.render({ customers: [{ id: 'c', name: 'Ch\u1ecb NEW NAME' }] });
  await h.clock.advance(3400);
  assert.deepEqual(h.writes[1].payload, { name: 'New Name', customerHonorific: 'chi' });
  h.dispose();
});

test('ineligible honorific values preserve the exact old formula and never claim migration IDs', async () => {
  const customers = [
    { id: 'empty', name: '' }, { id: 'no-prefix', name: 'Ordinary Customer' }, { id: 'only-prefix', name: 'Anh' },
    { id: 'null-name', name: null }, { id: 'already-plain', name: 'Name', customerHonorific: 'anh' },
  ];
  const h = harness({ customers });
  for (const customer of customers) assert.deepEqual(oldResult('customer', customer, h.bindings).writes, []);
  await h.clock.advance(1700 * customers.length);
  assert.deepEqual(h.writes, []);
  assert.equal(h.bindings.customerHonorificMigrationRef.current.size, 0);
  h.dispose();
});

test('logout/tenant cleanup drops old pending work and new sessions enqueue their latest eligible data', async () => {
  const h = harness({ customers: [{ id: 'c', name: 'Anh OLD' }], warehouseDispatches: [{ id: 'd' }], visible: false });
  const obsolete = h.queues[0];
  h.render({ firebaseUser: null });
  assert.equal(obsolete.size, 0);
  assert.equal(h.bindings.compatibilityMaintenanceRef.current, null);
  h.visible(true);
  assert.equal(h.clock.pending.size, 0);
  h.bindings.activeTenantScopeRef.current = 'tenant-b';
  h.render({ firebaseUser: { uid: 'user-b' }, myCompanyId: 'tenant-b',
    customers: [{ id: 'c', name: 'Ch\u1ecb NEW' }], warehouseDispatches: [{ id: 'd' }] });
  await h.clock.advance(5100);
  assert.equal(h.writes.length, 2);
  assert.equal(h.writes[0].payload.companyId, 'tenant-b');
  assert.deepEqual(h.writes[1].payload, { name: 'New', customerHonorific: 'chi' });
  h.dispose();
});

test('tenant switch invalidates late active errors without mutating new session markers or launching old pending writes', async () => {
  const pending = deferred();
  const h = harness({ customers: [{ id: 'c-old', name: 'Anh OLD' }], warehouseDispatches: [{ id: 'd' }],
    write: call => call.payload.companyId === 'tenant-a' ? pending.promise : Promise.resolve() });
  await h.clock.tick();
  const active = h.clock.start();
  const oldQueue = h.queues[0];
  h.bindings.activeTenantScopeRef.current = 'tenant-b';
  h.render({ firebaseUser: { uid: 'user-b' }, myCompanyId: 'tenant-b',
    customers: [{ id: 'c-new', name: 'Ch\u1ecb NEW' }], warehouseDispatches: [{ id: 'd' }] });
  pending.reject(new Error('old tenant acknowledgement failed'));
  await active.completion;
  assert.equal(oldQueue.size, 0);
  assert.equal(h.errors.length, 0, 'old acknowledgement cannot affect the new session');
  assert.equal(h.bindings.warehouseDispatchCompanyMigrationRef.current.size, 0);
  await h.clock.advance(5100);
  assert.deepEqual(h.writes.map(call => call.id), ['d', 'd', 'c-new']);
  assert.equal(h.writes[1].payload.companyId, 'tenant-b');
  assert.equal(h.bindings.warehouseDispatchCompanyMigrationRef.current.has('d'), true);
  h.dispose();
});

test('stale tenant scope blocks admission even before effect cleanup runs', async () => {
  const h = harness({ customers: [{ id: 'c', name: 'Anh OLD' }], warehouseDispatches: [{ id: 'd' }] });
  h.bindings.activeTenantScopeRef.current = 'tenant-b';
  await h.clock.advance(3400);
  assert.deepEqual(h.writes, []);
  assert.deepEqual(h.recent, []);
  assert.equal(h.normalizations, 0);
  assert.equal(h.bindings.customerHonorificMigrationRef.current.size, 0);
  assert.equal(h.bindings.warehouseDispatchCompanyMigrationRef.current.size, 0);
  h.dispose();
});

test('individual write errors release the queue and retain the old per-kind migration marker behavior', async () => {
  const h = harness({ warehouseDispatches: [{ id: 'd' }], customers: [{ id: 'bad', name: 'Anh BAD' }, { id: 'good', name: 'Ch\u1ecb GOOD' }],
    write: call => call.id === 'good' ? Promise.resolve() : Promise.reject(new Error('write failed')) });
  await h.clock.advance(6800);
  assert.deepEqual(h.writes.map(call => call.id), ['d', 'bad', 'good']);
  assert.equal(h.errors.length, 2);
  assert.equal(h.bindings.warehouseDispatchCompanyMigrationRef.current.has('d'), false, 'failed dispatch remains retryable as before');
  assert.equal(h.bindings.customerHonorificMigrationRef.current.has('bad'), true, 'old customer migration marker semantics remain unchanged');
  assert.equal(h.bindings.customerHonorificMigrationRef.current.has('good'), true);
  assert.equal(h.peakInFlight, 1);
  h.dispose();
});

test('300 unchanged noncandidate customers use three idle classifier batches, no write jobs, and no repeated normalization', async () => {
  const customers = Array.from({ length: 300 }, (_, index) => ({ id: `c-${index}`, name: `Ordinary Customer ${index}` }));
  const h = harness({ customers });
  assert.equal(h.normalizations, 0);
  assert.equal(h.queues[0].size, 1, 'no per-row no-op jobs are scheduled');
  const cache = h.bindings.compatibilityMaintenanceCustomerCacheRef.current;
  assert.equal(cache.has(customers[0]), false, 'identity is cached only after idle admission');
  for (let batch = 0; batch < 3; batch++) {
    await h.clock.advance(1700);
    assert.equal(h.normalizations, (batch + 1) * 100, 'at most 100 records are classified per admission');
    assert.equal(h.clock.callbacks, (batch + 1) * 2, 'only delay plus idle wakeups, not one delay per customer');
  }
  assert.equal(h.clock.pending.size, 0);
  assert.deepEqual(h.writes, []);
  assert.equal(h.bindings.customerHonorificMigrationRef.current.size, 0, 'noncandidate IDs remain eligible for later edits');
  for (let index = 0; index < 5; index++) { h.input(); h.render(); }
  assert.equal(h.clock.pending.size, 0, 'unchanged input renders create no extra scans');
  assert.equal(h.normalizations, 300);
  h.render({ customers: [...customers] });
  await h.clock.advance(5100);
  assert.equal(h.normalizations, 300, 'a changed array containing unchanged objects uses the admitted identity cache');
  assert.equal(h.clock.callbacks, 12);
  assert.deepEqual(h.writes, []);
  h.dispose();
});

test('cached noncandidates reclassify edited fields/new objects and queued candidates still recheck latest data', async () => {
  const customer = { id: 'c', name: 'Ordinary Customer' };
  const h = harness({ customers: [customer] });
  await h.clock.advance(1700);
  assert.equal(h.normalizations, 1);
  assert.equal(h.bindings.customerHonorificMigrationRef.current.size, 0);
  customer.name = 'Anh FIRST DRAFT';
  h.render({ customers: [customer] });
  assert.equal(h.normalizations, 1, 'mutated-field classification remains deferred');
  await h.clock.advance(1700);
  assert.equal(h.queues[0].size, 1, 'only the actual candidate becomes a write job');
  assert.equal(h.bindings.customerHonorificMigrationRef.current.size, 0, 'classification does not claim migration IDs');
  h.visible(false);
  customer.name = 'Custom editing in progress';
  h.render();
  assert.equal(h.normalizations, 3);
  h.visible(true);
  await h.clock.advance(1700);
  assert.deepEqual(h.writes, [], 'queued name snapshot cannot overwrite an edited unprefixed name');
  assert.equal(h.bindings.customerHonorificMigrationRef.current.size, 0);
  const changedObject = { id: 'c', name: 'Ch\u1ecb FINAL DRAFT' };
  h.render({ customers: [changedObject] });
  await h.clock.advance(3400);
  assert.deepEqual(h.writes.map(call => call.payload), [{ name: 'Final Draft', customerHonorific: 'chi' }]);
  h.dispose();
});

test('lazy lookup keeps strict first-match semantics for duplicate IDs and is refreshed before admission after render', async () => {
  const h = harness({ customers: [{ id: 'c', name: 'First Plain Name' }, { id: 'c', name: 'Anh SECOND NAME' }],
    warehouseDispatches: [{ id: 'd', updatedAt: 'first timestamp' }, { id: 'd', updatedAt: 'second timestamp' }] });
  assert.equal(h.bindings.compatibilityMaintenanceDataRef.current.customerLookup, undefined, 'typing/render does not build indexes');
  await h.clock.advance(3400);
  assert.equal(h.writes.length, 1);
  assert.equal(h.writes[0].payload.updatedAt, 'first timestamp');
  assert.equal(h.bindings.customerHonorificMigrationRef.current.size, 0);
  h.render({ customers: [{ id: 'c', name: 'Ch\u1ecb NEW FIRST NAME' }, { id: 'c', name: 'Anh SECOND NAME' }] });
  assert.equal(h.bindings.compatibilityMaintenanceDataRef.current.customerLookup, undefined);
  await h.clock.advance(3400);
  assert.deepEqual(h.writes[1].payload, { name: 'New First Name', customerHonorific: 'chi' });
  h.dispose();
});
