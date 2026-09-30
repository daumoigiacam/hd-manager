import assert from 'node:assert/strict';
import test from 'node:test';
import { createCustomerLedgerMapBuilder } from '../src/utils/customerLedgerIndex.js';

test('customer-only changes recompute one ledger without discarding full history', () => {
  let calls = 0;
  const build = (customer, orders, payments) => {
    calls++;
    return { customer, orders, payments, debt: orders.reduce((s, r) => s + r.amount, customer.openingDebt || 0) - payments.reduce((s, r) => s + r.amount, 0) };
  };
  const cached = createCustomerLedgerMapBuilder(build);
  const customers = Array.from({ length: 360 }, (_, i) => ({ id: `c${i}`, companyId: 'one' }));
  const orders = Array.from({ length: 1800 }, (_, i) => ({ id: `o${i}`, customerId: `c${i % 360}`, amount: 100 }));
  const payments = Array.from({ length: 900 }, (_, i) => ({ id: `p${i}`, customerId: `c${i % 360}`, amount: 10 }));
  const first = cached(customers, orders, payments, '2026-09-30');
  assert.equal(calls, 360);
  const changed = customers.map((c, i) => i === 0 ? { ...c, productPrices: { p: 63 }, openingDebt: 20 } : c);
  const second = cached(changed, orders, payments, '2026-09-30');
  assert.equal(calls, 361);
  assert.equal(second.c1, first.c1);
  assert.notEqual(second.c0, first.c0);
  assert.equal(second.c0.debt, first.c0.debt + 20);
  for (const c of changed) assert.deepEqual(second[c.id], build(c, orders.filter(r => r.customerId === c.id), payments.filter(r => r.customerId === c.id)));
  const revisedOrders = orders.map((o, i) => i === 0 ? { ...o, amount: 200 } : o);
  assert.equal(cached(changed, revisedOrders, payments, '2026-09-30').c0.debt, second.c0.debt + 100);
  assert.equal(cached(changed, orders, [...payments, { customerId: 'c0', amount: 5 }], '2026-09-30').c0.debt, second.c0.debt - 5);
  assert.notEqual(cached(changed, orders, payments, '2026-10-01').c0, second.c0);
  assert.equal(cached(changed.slice(1), orders, payments, '2026-10-01').c0, undefined);
  const otherTenant = changed.map(c => ({ ...c, companyId: 'two', openingDebt: 500 }));
  assert.equal(cached(otherTenant, [], [], '2026-09-30').c0.debt, 500);
  assert.equal(first.c0.customer.companyId, 'one');
});

test('payment/order changes rebuild affected ledgers only, including moved and deleted records', () => {
  let calls = 0;
  const build = (customer, orders, payments) => {
    calls++;
    return { debt: orders.reduce((sum, row) => sum + row.amount, customer.openingDebt || 0) - payments.reduce((sum, row) => sum + row.amount, 0) };
  };
  const cached = createCustomerLedgerMapBuilder(build);
  const customers = Array.from({ length: 360 }, (_, i) => ({ id: `c${i}`, companyId: 'one' }));
  const orders = Array.from({ length: 1800 }, (_, i) => ({ customerId: `c${i % 360}`, amount: 100 }));
  const payments = Array.from({ length: 900 }, (_, i) => ({ customerId: `c${i % 360}`, amount: 10 }));
  const first = cached(customers, orders, payments, 'day');
  const revisedOrders = orders.map((row, i) => i === 0 ? { ...row, amount: 200 } : row);
  const second = cached(customers, revisedOrders, payments, 'day');
  assert.equal(calls, 361);
  assert.equal(second.c1, first.c1);
  assert.equal(second.c0.debt, first.c0.debt + 100);
  const movedPayments = payments.map((row, i) => i === 0 ? { ...row, customerId: 'c1' } : row);
  const third = cached(customers, revisedOrders, movedPayments, 'day');
  assert.equal(calls, 363);
  assert.equal(third.c2, second.c2);
  assert.equal(third.c0.debt, second.c0.debt + 10);
  assert.equal(third.c1.debt, second.c1.debt - 10);
  const removed = cached(customers, revisedOrders, movedPayments.slice(1), 'day');
  assert.equal(calls, 364);
  assert.equal(removed.c0, third.c0);
  assert.equal(removed.c1.debt, third.c1.debt + 10);
  for (const customer of customers) assert.deepEqual(removed[customer.id], build(customer, revisedOrders.filter(row => row.customerId === customer.id), movedPayments.slice(1).filter(row => row.customerId === customer.id)));
  assert.equal(cached(customers, orders, payments, 'day').c0.debt, first.c0.debt, 'switching back to an older snapshot must never return a stale changed ledger');
});
