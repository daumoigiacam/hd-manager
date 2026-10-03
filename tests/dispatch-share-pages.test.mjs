import assert from 'node:assert/strict';
import test from 'node:test';
import { splitDispatchSharePages } from '../src/utils/dispatchSharePages.js';

test('share pages retain all rows and keep each customer on one page', () => {
  for (const count of [0, 1, 15, 16, 30, 31, 50]) {
    const rows = Array.from({ length: count * 2 }, (_, i) => ({ id: i, customerId: `c${i % count}` }));
    const pages = splitDispatchSharePages(rows);
    assert.equal(pages.length, Math.ceil(count / 15));
    assert.deepEqual(pages.flat().map(r => r.id).sort((a, b) => a - b), rows.map(r => r.id));
    const seen = new Set();
    for (const page of pages) {
      const customers = new Set(page.map(r => r.customerId));
      assert(customers.size <= 15);
      for (const customer of customers) { assert(!seen.has(customer)); seen.add(customer); }
    }
  }
});
