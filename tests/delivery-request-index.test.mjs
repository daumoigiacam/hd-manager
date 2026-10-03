import assert from 'node:assert/strict';
import test from 'node:test';
import { buildDeliveryRequestIndex, getDeliveryRecordLookup } from '../src/utils/deliveryRequestIndex.js';

test('reopen reuses immutable indexes; source and tenant replacements invalidate them', () => {
  const records = [{ id: 'a', name: 'First' }, { id: 'a', name: 'Last' }];
  const lookup = getDeliveryRecordLookup(records);
  assert.equal(lookup.get('a').name, 'Last');
  assert.equal(getDeliveryRecordLookup(records), lookup);
  let normalized = 0;
  const normalize = value => { normalized++; return value.toLowerCase(); };
  const requests = [{ id: 'r', customerId: 'a' }];
  const first = buildDeliveryRequestIndex(requests, lookup, normalize);
  assert.equal(buildDeliveryRequestIndex(requests, lookup, normalize), first);
  assert.equal(normalized, 1);
  const replacement = getDeliveryRecordLookup([{ id: 'a', name: 'New tenant' }]);
  const next = buildDeliveryRequestIndex(requests, replacement, normalize);
  assert.notEqual(next, first);
  assert.deepEqual(next('', 'new tenant'), requests);
  assert.deepEqual(next('', 'last'), []);
  assert.notEqual(buildDeliveryRequestIndex([...requests], lookup, normalize), first);
});

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

test('linear merge preserves duplicate positions and independent result ownership', () => {
  const shared = { id: 'same', customerId: 'a', customerName: 'Name' };
  const requests = Array.from({ length: 12000 }, (_, index) => index % 2 ? shared
    : { id: index, customerId: 'b', customerName: 'Name' });
  const find = buildDeliveryRequestIndex(requests, new Map(), value => value.toLowerCase());
  const first = find('a', 'name');
  assert.deepEqual(first, requests);
  first.splice(0, first.length);
  assert.deepEqual(find('a', 'name'), requests);
  assert.equal(find('a', '').length, 6000);
  assert.deepEqual(find('missing', 'missing'), []);
});
