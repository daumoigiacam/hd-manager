import assert from 'node:assert/strict';
import test from 'node:test';
import { createIncrementalStableSorter } from '../src/services/incrementalStableSort.js';

test('incremental ordering matches stable full sort through edits, removals, ties and duplicates', () => {
  const collator = new Intl.Collator('vi', { numeric: true, sensitivity: 'base' });
  const compare = (a, b) => collator.compare(a.label, b.label) || a.price - b.price;
  const sort = createIncrementalStableSorter(compare, row => row.id);
  let rows = Array.from({ length: 500 }, (_, i) => ({ id: String(i), label: `Product ${i % 17}`, price: i % 3 }));
  let seed = 7;
  const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  for (let step = 0; step < 80; step++) {
    const result = sort(rows);
    assert.deepEqual(result, [...rows].sort(compare));
    assert.ok(result.every(row => rows.includes(row)), 'return current objects, never cached business fields');
    const index = Math.floor(random() * rows.length);
    rows = rows.map((row, i) => i === index ? { ...row, label: `Product ${step % 20}`, note: step } : row);
    if (step % 5 === 0) rows = [...rows].reverse();
    if (step % 7 === 0) rows = rows.slice(1).concat({ id: `new-${step}`, label: 'Product 2', price: 0 });
    if (step % 11 === 0) rows = rows.concat({ ...rows[0], note: 'duplicate' });
  }
});

test('single insert avoids full comparison sort and cache stores only the current collection', () => {
  let calls = 0;
  const compare = (a, b) => { calls++; return a.value - b.value; };
  const sort = createIncrementalStableSorter(compare, row => row.id);
  const rows = Array.from({ length: 4500 }, (_, i) => ({ id: i, value: (i * 7919) % 4501 }));
  sort(rows);
  calls = 0;
  const updated = [...rows, { id: 'new', value: 2.5 }];
  const actual = sort(updated);
  const incremental = calls;
  calls = 0;
  assert.deepEqual(actual, [...updated].sort(compare));
  assert.ok(incremental < calls / 2, `${incremental} incremental vs ${calls} full comparisons`);
  assert.deepEqual(sort([]), []);
  assert.deepEqual(sort([{ id: 1, value: 4 }]), [{ id: 1, value: 4 }]);
});
