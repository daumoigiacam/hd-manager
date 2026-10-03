import assert from 'node:assert/strict';
import test from 'node:test';
import { appFunction } from './helpers/app-source-function.mjs';
import { createRecordCalculationCache } from '../src/services/recordCalculationCache.js';

const normalize = value => value.toLowerCase().trim();
const resolveDate = (record, fallback) => record.date || fallback;
const parseDate = value => value ? new Date(`${value}T12:00:00`) : null;
const timestamp = record => record.createdAt ? new Date(record.createdAt).getTime() : 0;

function cache() {
  let parses = 0;
  const calculate = appFunction('getDeliveryRequestMetadata', {
    createRecordCalculationCache, resolveEntityDateKey: resolveDate,
    parseDateInputValue: value => { parses++; return parseDate(value); },
    getEntityTimestamp: timestamp, normalizeLookupText: normalize,
  }, { memoCallback: true, scope: 'DeliveryReportView' });
  return { get: calculate(), parses: () => parses };
}

function reference(request, fallback, customer) {
  const date = resolveDate(request, fallback);
  const value = parseDate(date || '');
  return {
    requestDate: date, requestDateMs: value ? value.getTime() : 0,
    requestTimestamp: timestamp(request) || new Date(`${date || fallback}T00:00:00.000`).getTime(),
    requestCustomer: customer,
    requestCustomerName: request.customerNameSnapshot || request.customerName || customer?.name || '',
    requestItems: Array.isArray(request.items) && request.items.length > 0
      ? request.items : (request.primaryItem ? [request.primaryItem] : []),
    requestBranchId: `${request.branchId || request.customerBranchId || ''}`.trim(),
    requestBranchName: normalize(request.branchName || request.customerBranchName || ''),
  };
}

test('cached request metadata equals legacy preparation for dates, snapshots and primary items', () => {
  const { get } = cache();
  const customer = { id: 'c', name: 'Current' };
  for (const request of [
    { id: 'empty' },
    { id: 'normal', date: '2026-10-02', items: [{ quantity: 10, unitPrice: 7 }] },
    { id: 'legacy', primaryItem: { quantity: 5 }, customerBranchId: ' b ', customerBranchName: ' Legacy ' },
    { id: 'snapshot', customerNameSnapshot: 'Snapshot', customerName: 'Legacy', branchId: 'a', branchName: ' A ' },
    { id: 'timestamp', createdAt: '2026-10-02T08:00:00+07:00', items: [] },
    { id: 'invalid', date: 'invalid' },
  ]) {
    for (const day of ['2026-10-02', '2026-10-03']) {
      assert.deepEqual(get(request, day, customer), reference(request, day, customer));
    }
  }
});

test('unrelated dispatches reuse metadata, with source/customer/date and tenant cache invalidation', () => {
  const h = cache();
  const request = { id: 'r', primaryItem: { quantity: 2 } };
  const customer = { name: 'Customer A' };
  const original = h.get(request, '2026-10-02', customer);
  for (let i = 0; i < 100; i++) assert.equal(h.get(request, '2026-10-02', customer), original);
  assert.equal(h.parses(), 1);
  assert.notEqual(h.get({ ...request, primaryItem: { quantity: 3 } }, '2026-10-02', customer), original);
  assert.equal(h.get(request, '2026-10-02', { name: 'Customer B' }).requestCustomerName, 'Customer B');
  assert.equal(h.get(request, '2026-10-03', customer).requestDate, '2026-10-03');
  const otherTenant = cache();
  assert.notEqual(otherTenant.get(request, '2026-10-02', customer), original);
  assert.equal(otherTenant.parses(), 1);
});
