import test from 'node:test';
import assert from 'node:assert/strict';
import { createSearchRecordIndexAsync } from '../src/services/searchEngine.js';

for (const size of [1000, 5000, 10000, 50000]) {
  test(`cooperative broad query ${size}: identical results, no field rebuild, bounded batches`, { timeout: 30000 }, async () => {
    const rows = Array.from({ length: size }, (_, i) => ({ id: `${i}`, name: `Gà Móc ${i}` }));
    let reads = 0;
    const index = await createSearchRecordIndexAsync(rows, row => {
      reads++;
      return [{ key: 'primary', priority: 100, values: [row.name, row.id] }];
    });
    let yields = 0;
    const start = performance.now();
    for (const query of ['ga', 'moc 123', 'absent', 'ga']) {
      const actual = await index.searchAsync(query, { maxOperations: 128, yieldTask: async () => { yields++; } });
      assert.deepEqual(actual, index.search(query));
    }
    const orderedRecords = rows.slice().reverse();
    const membership = new Set(rows.filter((_, i) => i % 2 === 0));
    assert.deepEqual(await index.searchAsync('ga', { orderedRecords, membership }), orderedRecords.filter(row => membership.has(row)));
    assert.equal(reads, size);
    assert.ok(yields > size / 128);
    console.log(JSON.stringify({ size, queryParityMs: performance.now() - start, yields, reads }));
  });
}
test('query abort and invalid budget cannot run indefinitely', { timeout: 10000 }, async () => {
  const index = await createSearchRecordIndexAsync(Array.from({ length: 1000 }, (_, i) => ({ id: i })), row => [{ values: [`ga ${row.id}`] }]);
  const controller = new AbortController();
  await assert.rejects(index.searchAsync('ga', { signal: controller.signal, yieldTask: async () => controller.abort() }), { name: 'AbortError' });
  for (const options of [{ budgetMs: 0 }, { maxOperations: 0 }, { budgetMs: Infinity }]) {
    await assert.rejects(index.searchAsync('ga', options), RangeError);
  }
});

test('duplicate recency keys retain relevance tie order and duplicate source occurrences', { timeout: 10000 }, async () => {
  const rows = [{ id: 'same', name: 'Gà Móc' }, { id: 'same', name: 'Gà' }];
  rows.push(rows[0]);
  const index = await createSearchRecordIndexAsync(rows, row => [{ values: [row.name], priority: 100 }]);
  const orderRanks = new Map(rows.map(row => [row, 0]));
  assert.deepEqual(await index.searchAsync('ga', { orderedRecords: rows, orderRanks }), index.search('ga'));
});
