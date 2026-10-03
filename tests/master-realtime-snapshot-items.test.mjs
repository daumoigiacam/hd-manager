import assert from 'node:assert/strict';
import test from 'node:test';
import { QuerySnapshot } from 'firebase/firestore';
import { createRealtimeSnapshotItemsCollector } from '../src/services/realtimeSnapshotItems.js';

const query = {};
const normalize = data => Object.fromEntries(Object.entries(data || {}).map(([key, value]) => [
  key, value && typeof value.toDate === 'function' ? value.toDate().toISOString() : value,
]));
const fullMap = snapshot => snapshot.docs.map(doc => ({ id: doc.id, data: normalize(doc.data()) }));
const record = (id, amount = 1) => ({ id, value: { companyId: 'tenant-a', amount, nested: { quantity: 2 } } });

function fixture(records, changes = [], options = {}) {
  const reads = [];
  const docs = records.map(({ id, value }) => ({
    id,
    data() { reads.push(id); return { ...value }; },
  }));
  const snapshot = {
    query: options.query || query,
    metadata: { fromCache: false, hasPendingWrites: false, ...options.metadata },
    docs,
    docChanges() { return typeof changes === 'function' ? changes() : changes; },
  };
  return { snapshot, reads, docs };
}

const change = (type, id, oldIndex, newIndex) => ({
  type, oldIndex, newIndex, doc: { id, data() { throw new Error('Decode snapshot.docs, not change payloads'); } },
});
const assertParity = (collect, f, sourceToken = f.snapshot.query) => {
  const items = collect(f.snapshot, sourceToken);
  const incrementalReads = f.reads.slice();
  assert.deepEqual(items, fullMap(f.snapshot));
  f.reads.splice(0, f.reads.length, ...incrementalReads);
  return items;
};

test('first snapshot is complete even when initial changes are partial or throw', () => {
  for (const changes of [[], [change('added', 'a', -1, 0)], () => { throw new Error('Unavailable'); }]) {
    const f = fixture([record('a'), record('b')], changes);
    assertParity(createRealtimeSnapshotItemsCollector(normalize), f);
    assert.deepEqual(f.reads, ['a', 'b']);
  }
  assert.deepEqual(createRealtimeSnapshotItemsCollector(normalize)(fixture([]).snapshot), []);
});

test('add, modify, remove and sequential reorder equal complete full mapping', () => {
  const collect = createRealtimeSnapshotItemsCollector(normalize);
  const initial = assertParity(collect, fixture([record('a'), record('b'), record('c')]));
  const next = fixture([record('c', 30), record('b', 20), record('d', 40)], [
    change('removed', 'a', 0, -1),
    change('modified', 'c', 1, 0),
    change('modified', 'b', 1, 1),
    change('added', 'd', -1, 2),
  ]);
  assertParity(collect, next);
  assert.deepEqual(next.reads, ['c', 'b', 'd']);
  assert.deepEqual(initial.map(item => [item.id, item.data.amount]), [['a', 1], ['b', 1], ['c', 1]]);
  const removal = fixture([record('c', 30), record('d', 40)], [change('removed', 'b', 1, -1)]);
  assertParity(collect, removal);
  assert.deepEqual(removal.reads, []);
  const empty = fixture([], [change('removed', 'c', 0, -1), change('removed', 'd', 0, -1)]);
  assert.deepEqual(collect(empty.snapshot), []);
  assert.deepEqual(empty.reads, []);
  const refill = fixture([record('z')], [change('added', 'z', -1, 0)]);
  assertParity(collect, refill);
  assert.deepEqual(refill.reads, ['z']);
});

test('cache, pending writes and local ACK metadata do not re-decode unchanged data', () => {
  const collect = createRealtimeSnapshotItemsCollector(normalize);
  const first = collect(fixture([record('a'), record('b')], [], {
    metadata: { fromCache: true, hasPendingWrites: true },
  }).snapshot);
  for (const metadata of [
    { fromCache: true, hasPendingWrites: false },
    { fromCache: false, hasPendingWrites: true },
    { fromCache: false, hasPendingWrites: false },
  ]) {
    const f = fixture([record('a'), record('b')], [], { metadata });
    const items = assertParity(collect, f);
    assert.deepEqual(f.reads, []);
    assert.equal(items[0].data, first[0].data);
    assert.notEqual(items, first);
    assert.notEqual(items[0], first[0]);
  }
});

test('server timestamp ACK with a data change decodes the new value', () => {
  const collect = createRealtimeSnapshotItemsCollector(normalize);
  collect(fixture([{ id: 'a', value: { createdAt: null } }]).snapshot);
  const f = fixture([{ id: 'a', value: { createdAt: { toDate: () => new Date('2026-10-03T00:00:00Z') } } }],
    [change('modified', 'a', 0, 0)]);
  assertParity(collect, f);
  assert.deepEqual(f.reads, ['a']);
});

const malformed = [
  ['not an array', {}],
  ['throws', () => { throw new Error('Invalid options'); }],
  ['null change', [null]],
  ['unknown type', [change('metadata', 'a', 0, 0)]],
  ['missing document', [{ type: 'modified', oldIndex: 0, newIndex: 0 }]],
  ['invalid old index', [change('modified', 'a', 1, 0)]],
  ['invalid new index', [change('modified', 'a', 0, 4)]],
  ['fractional index', [change('modified', 'a', 0.5, 0)]],
  ['added existing document', [change('added', 'a', -1, 0)]],
  ['removed absent document', [change('removed', 'z', 0, -1)]],
  ['removed new index', [change('removed', 'a', 0, 0)]],
  ['duplicate change', [change('modified', 'a', 0, 0), change('modified', 'a', 0, 0)]],
  ['missing data function', [{ type: 'modified', doc: { id: 'a' }, oldIndex: 0, newIndex: 0 }]],
];
for (const [label, changes] of malformed) {
  test(`untrusted changes fall back before decoding: ${label}`, () => {
    const collect = createRealtimeSnapshotItemsCollector(normalize);
    collect(fixture([record('a'), record('b')]).snapshot);
    const f = fixture([record('a', 20), record('b')], changes);
    assertParity(collect, f);
    assert.deepEqual(f.reads, ['a', 'b']);
  });
}

test('missing changes, unexplained membership/order and duplicate IDs use full mapping', () => {
  for (const records of [
    [record('b'), record('a')], [record('a'), record('c')],
    [record('a'), record('a', 20)], [record('a'), record('b')],
  ]) {
    const collect = createRealtimeSnapshotItemsCollector(normalize);
    collect(fixture([record('a'), record('b')]).snapshot);
    const f = fixture(records);
    if (records[1].id === 'b') delete f.snapshot.docChanges;
    assertParity(collect, f);
    assert.deepEqual(f.reads, records.map(item => item.id));
  }
});

test('query changes and independent tenant/source closures never share cache', () => {
  const a = createRealtimeSnapshotItemsCollector(normalize);
  const b = createRealtimeSnapshotItemsCollector(normalize);
  a(fixture([record('same', 10)]).snapshot);
  const otherSource = fixture([record('same', 20)]);
  assertParity(b, otherSource);
  assert.deepEqual(otherSource.reads, ['same']);
  const otherTenant = fixture([{ id: 'same', value: { companyId: 'tenant-b', amount: 30 } }], [], { query: {} });
  assertParity(a, otherTenant);
  assert.deepEqual(otherTenant.reads, ['same']);
  a.reset();
  const restarted = fixture([record('same', 40)], [], { query: otherTenant.snapshot.query });
  assertParity(a, restarted);
  assert.deepEqual(restarted.reads, ['same']);
});

test('explicit captured source token avoids reliance on query wrapper identity', () => {
  const collect = createRealtimeSnapshotItemsCollector(normalize);
  const sourceToken = {};
  assert.equal(collect.collect, collect);
  collect.collect(fixture([record('a'), record('b')], [], { query: {} }).snapshot, sourceToken);
  const update = fixture([record('a', 20), record('b')], [change('modified', 'a', 0, 0)], { query: {} });
  assertParity(collect.collect, update, sourceToken);
  assert.deepEqual(update.reads, ['a']);
  const metadata = fixture([record('a', 20), record('b')], [], { query: {} });
  assertParity(collect.collect, metadata, sourceToken);
  assert.deepEqual(metadata.reads, []);
});

test('different default query wrappers conservatively decode the full snapshot', () => {
  const collect = createRealtimeSnapshotItemsCollector(normalize);
  collect(fixture([record('a'), record('b')], [], { query: {} }).snapshot);
  const next = fixture([record('a', 20), record('b')], [], { query: {} });
  assertParity(collect, next);
  assert.deepEqual(next.reads, ['a', 'b']);
});

test('changing explicit source tokens forces complete mapping even with the same query wrapper', () => {
  const collect = createRealtimeSnapshotItemsCollector(normalize);
  collect(fixture([record('a'), record('b')]).snapshot, {});
  const next = fixture([record('a', 20), record('b')]);
  assertParity(collect, next, {});
  assert.deepEqual(next.reads, ['a', 'b']);
});

test('feed unpublished cache/pending data events before any application early return', () => {
  const collect = createRealtimeSnapshotItemsCollector(normalize);
  const published = collect(fixture([record('a')]).snapshot);
  const ignored = fixture([record('a', 20)], [change('modified', 'a', 0, 0)], {
    metadata: { fromCache: true, hasPendingWrites: true },
  });
  collect(ignored.snapshot);
  const confirmed = fixture([record('a', 20)], []);
  assertParity(collect, confirmed);
  assert.deepEqual(ignored.reads, ['a']);
  assert.deepEqual(confirmed.reads, []);
  assert.equal(published[0].data.amount, 1);
});

test('reset on an intentionally skipped data event forces complete recovery on metadata ACK', () => {
  const collect = createRealtimeSnapshotItemsCollector(normalize);
  collect(fixture([record('a'), record('b')]).snapshot);
  collect.reset();
  // The a=20 event is deliberately not passed to the collector.
  const confirmed = fixture([record('a', 20), record('b')], []);
  assertParity(collect, confirmed);
  assert.deepEqual(confirmed.reads, ['a', 'b']);
});

test('document snapshots keep old exists/data behavior and reset query history', () => {
  const collect = createRealtimeSnapshotItemsCollector(normalize);
  collect(fixture([record('a')]).snapshot);
  let reads = 0;
  const doc = { id: 'company', exists: () => true, data: () => { reads++; return { name: 'Company' }; } };
  assert.deepEqual(collect(doc), [{ id: 'company', data: { name: 'Company' } }]);
  assert.deepEqual(collect(doc), [{ id: 'company', data: { name: 'Company' } }]);
  assert.equal(reads, 2);
  assert.deepEqual(collect({ exists: () => false, data: () => { throw new Error('Missing'); } }), []);
  assert.deepEqual(collect(null), []);
  const next = fixture([record('a')]);
  assertParity(collect, next);
  assert.deepEqual(next.reads, ['a']);
});

test('failure publishes nothing and invalidates history for the next event', () => {
  for (const failure of ['data', 'normalizer']) {
    let fail = false;
    const collect = createRealtimeSnapshotItemsCollector(data => {
      if (failure === 'normalizer' && fail && data.amount === 30) throw new Error('Decode failed');
      return normalize(data);
    });
    const old = collect(fixture([record('a'), record('b')]).snapshot);
    const broken = fixture([record('a', 20), record('b', 30)], [
      change('modified', 'a', 0, 0), change('modified', 'b', 1, 1),
    ]);
    fail = true;
    if (failure === 'data') broken.docs[1].data = () => { throw new Error('Decode failed'); };
    assert.throws(() => collect(broken.snapshot), /Decode failed/);
    assert.deepEqual(old.map(item => item.data.amount), [1, 1]);
    fail = false;
    const next = fixture([record('a', 20), record('b', 30)]);
    assertParity(collect, next);
    assert.deepEqual(next.reads, ['a', 'b']);
  }
});

test('later events do not mutate previous arrays/records and docs getter is read once', () => {
  const collect = createRealtimeSnapshotItemsCollector(normalize);
  const old = collect(fixture([record('a'), record('b')]).snapshot);
  old.reverse();
  old[0].id = 'consumer-edit';
  const next = fixture([record('a'), record('b')]);
  let accesses = 0;
  Object.defineProperty(next.snapshot, 'docs', { get() { accesses++; return next.docs; } });
  assert.deepEqual(collect(next.snapshot).map(item => item.id), ['a', 'b']);
  assert.equal(accesses, 1);
  assert.deepEqual(next.reads, []);
});

test('mutating an old snapshot document list cannot poison saved ID order', () => {
  const collect = createRealtimeSnapshotItemsCollector(normalize);
  const first = fixture([record('a'), record('b')]);
  const old = collect(first.snapshot);
  first.docs.reverse();
  first.docs[0].id = 'mutated-old-wrapper';
  first.docs.length = 0;
  const next = fixture([record('b'), record('a', 20)], [change('modified', 'a', 0, 1)]);
  assertParity(collect, next);
  assert.deepEqual(next.reads, ['a']);
  assert.deepEqual(old.map(item => [item.id, item.data.amount]), [['a', 1], ['b', 1]]);
});

test('invalid normalizer is rejected', () => {
  assert.throws(() => createRealtimeSnapshotItemsCollector(null), /normalizeData/);
});

// Real SDK getters/docChanges/data methods, with only their internal document
// set and value writer substituted. No app import, emulator or network client.
function sdkFixture(records, oldRecords, changes, counter, metadata = {}, sourceQuery = query) {
  const toDoc = ({ id, value }) => ({ key: { path: { lastSegment: () => id } }, data: { value } });
  const documents = records.map(toDoc);
  const rank = new Map(records.map((r, index) => [r.id, index]));
  const idOf = key => key.path.lastSegment();
  const documentSet = docs => ({
    size: docs.length,
    isEmpty: () => docs.length === 0,
    forEach: callback => docs.forEach(callback),
    indexOf: key => docs.findIndex(doc => idOf(doc.key) === idOf(key)),
    delete: key => documentSet(docs.filter(doc => idOf(doc.key) !== idOf(key))),
    add: doc => documentSet([...docs, doc].sort((a, b) => rank.get(idOf(a.key)) - rank.get(idOf(b.key)))),
  });
  const oldDocs = oldRecords.map(toDoc);
  const internalChanges = changes.map(([type, id]) => ({
    type, doc: [...documents, ...oldDocs].find(doc => idOf(doc.key) === id),
  }));
  return new QuerySnapshot({}, {
    convertValue(value) { counter.reads++; return { ...value }; },
  }, sourceQuery, {
    docs: documentSet(documents), oldDocs: documentSet(oldDocs), docChanges: internalChanges,
    mutatedKeys: { has: () => Boolean(metadata.hasPendingWrites) },
    fromCache: Boolean(metadata.fromCache), hasPendingWrites: Boolean(metadata.hasPendingWrites),
    excludesMetadataChanges: false,
  });
}

test('real SDK contract: 4000 initial data() reads, one update read, zero metadata ACK reads', () => {
  const records = Array.from({ length: 4000 }, (_, index) => record(`doc-${index}`, index));
  const counter = { reads: 0 };
  const collect = createRealtimeSnapshotItemsCollector(normalize);
  const old = collect(sdkFixture(records, [], [], counter, { fromCache: true, hasPendingWrites: true }));
  assert.equal(counter.reads, 4000);
  const updated = records.slice();
  updated[2000] = record('doc-2000', 9000);
  const snapshot = sdkFixture(updated, records, [[2, 'doc-2000']], counter);
  assert.deepEqual(snapshot.docChanges().map(c => [c.type, c.oldIndex, c.newIndex]), [['modified', 2000, 2000]]);
  counter.reads = 0;
  const items = collect(snapshot);
  assert.equal(counter.reads, 1);
  assert.deepEqual(items, fullMap(snapshot));
  assert.equal(old[2000].data.amount, 2000);
  const ack = sdkFixture(updated, updated, [[3, 'doc-2000']], counter);
  assert.deepEqual(ack.docChanges(), []);
  assert.equal(ack.docChanges({ includeMetadataChanges: true })[0].type, 'modified');
  counter.reads = 0;
  assert.deepEqual(collect(ack), items);
  assert.equal(counter.reads, 0);
});

test('real SDK snapshots with fresh query wrappers remain incremental with a captured source token', () => {
  const collect = createRealtimeSnapshotItemsCollector(normalize);
  const sourceToken = {};
  const records = [record('a'), record('b')];
  const counter = { reads: 0 };
  const first = sdkFixture(records, [], [], counter, {}, {});
  collect.collect(first, sourceToken);
  const updated = [record('a', 20), record('b')];
  counter.reads = 0;
  const next = sdkFixture(updated, records, [[2, 'a']], counter, {}, {});
  assert.notEqual(first.query, next.query);
  const items = collect.collect(next, sourceToken);
  assert.equal(counter.reads, 1);
  assert.deepEqual(items, fullMap(next));
  counter.reads = 0;
  assert.deepEqual(collect.collect(sdkFixture(updated, updated, [], counter, {}, {}), sourceToken), items);
  assert.equal(counter.reads, 0);
  const otherSource = {};
  const foreign = updated.map(r => ({ ...r, value: { ...r.value, companyId: 'tenant-b' } }));
  counter.reads = 0;
  const foreignItems = collect.collect(sdkFixture(foreign, updated, [], counter, {}, {}), otherSource);
  assert.equal(counter.reads, 2);
  assert.ok(foreignItems.every(item => item.data.companyId === 'tenant-b'));
});
