import assert from 'node:assert/strict';
import test from 'node:test';
import { buildDeliveryRequestIndex } from '../src/utils/deliveryRequestIndex.js';

test('indexed delivery candidates equal the original ID-or-name filter in source order', () => {
  const normalize = value => value.trim().toLowerCase();
  const customers = new Map([['a', { name: 'Same name' }], ['b', { name: 'Same name' }], ['c', { name: 'Different' }]]);
  const requests = Array.from({ length: 4500 }, (_, i) => ({ id: `r${i}`, customerId: ['a', 'b', 'c', ''][i % 4], customerNameSnapshot: i % 7 === 0 ? 'Snapshot' : '', customerName: i % 11 === 0 ? 'Legacy' : '', isArchived: i % 13 === 0 }));
  requests.push(requests[1]);
  const find = buildDeliveryRequestIndex(requests, customers, normalize);
  for (const id of ['', 'a', 'b', 'c', 'missing']) {
    for (const name of ['', 'same name', 'different', 'snapshot', 'legacy']) {
      const legacy = requests.filter(r => !r.isArchived && ((id && r.customerId === id) || (name && normalize(r.customerNameSnapshot || r.customerName || customers.get(r.customerId)?.name || '') === name)));
      assert.deepEqual(find(id, name), legacy);
    }
  }
});
