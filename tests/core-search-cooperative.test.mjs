import test from 'node:test';
import assert from 'node:assert/strict';
import { createSearchRecordIndex, createSearchRecordIndexAsync } from '../src/services/searchEngine.js';
import { createOrderSearchState } from '../src/services/orderSearchState.js';

const fields = row => [{ key: 'primary', priority: 100, values: [row.name, row.id] }];
test('asynchronous search retains sparse, duplicate, numeric, accent and ranking semantics', { timeout: 10000 }, async () => {
  const rows = [{ id: '1', name: 'Gà Móc' }, , { id: '2', name: '0909123456' }];
  rows.push(rows[0]);
  const expected = createSearchRecordIndex(rows, fields);
  const actual = await createSearchRecordIndexAsync(rows, fields);
  for (const query of ['', 'ga', 'moc', '0909', '123', 'absent']) {
    assert.deepEqual(actual.rank(query), expected.rank(query));
  }
});
test('cancelled builds stop preparing fields on navigation or replacement data', { timeout: 10000 }, async () => {
  const controller = new AbortController();
  let reads = 0;
  const task = createSearchRecordIndexAsync(Array.from({ length: 1000 }, (_, i) => ({ id: `${i}` })), row => {
    reads++;
    return fields(row);
  }, { signal: controller.signal, maxRecordsPerTurn: 12, now: () => 0,
    yieldTask: async () => { controller.abort(); } });
  await assert.rejects(task, { name: 'AbortError' });
  assert.equal(reads, 12);
});
for (const size of [5000, 10000, 50000]) {
  test(`local ${size} search fixture yields field work and reuses the completed index`, { timeout: 30000 }, async () => {
    const rows = Array.from({ length: size }, (_, i) => ({ id: `sku${i}`, name: `product${i}` }));
    let reads = 0;
    let chunk = 0;
    let maximum = 0;
    let yields = 0;
    const index = await createSearchRecordIndexAsync(rows, row => {
      reads++; chunk++;
      return fields(row);
    }, { now: () => 0, yieldTask: async () => { maximum = Math.max(maximum, chunk); chunk = 0; yields++; } });
    maximum = Math.max(maximum, chunk);
    assert.ok(maximum <= 24);
    assert.ok(yields >= Math.floor(size / 24));
    assert.deepEqual(index.search(`sku${size - 1}`), [rows.at(-1)]);
    assert.deepEqual(index.search('absent'), []);
    assert.equal(reads, size, 'queries must not prepare the collection again');
  });
}
test('screen-local search subscription has no root setter and cleans up subscribers', () => {
  const store = createOrderSearchState();
  let first = 0;
  let second = 0;
  const unsubscribe = store.subscribe(() => first++);
  store.subscribe(() => second++);
  store.set('query'); store.set('query');
  assert.equal(first, 1);
  unsubscribe();
  store.set(value => value + '2');
  assert.equal(first, 1);
  assert.equal(second, 2);
  assert.equal(store.getSnapshot(), 'query2');
  assert.equal(createOrderSearchState().getSnapshot(), '', 'new tenant/session owns a new store');
});
