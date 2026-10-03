import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { readFileSync } from 'node:fs';
import { getPreviousOrderSuggestions, previousOrderDraftFields } from '../src/utils/previousOrderSuggestions.js';
import { appFunction } from './helpers/app-source-function.mjs';

const customer = { id: 'a', companyId: 'company' };
const productLookup = new Map(['duck', 'chicken'].map(id => [id, { id, name: id }]));
const item = { productId: 'duck', quantity: 5, sizeLabel: '2kg', unitPrice: 50000, quantityUnit: 'Con', billingUnit: 'Kg' };
const order = (date, extra = {}) => ({ customerId: 'a', companyId: 'company', date, items: [item], ...extra });
const suggest = requests => getPreviousOrderSuggestions({ requests, customer, productLookup, beforeDate: '2026-10-03' });

test('request UI has no competing async preference loader or post-save memory job', () => {
  const source = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /loadRememberedInputUnitForDraftItem|scheduleOrderRequestMemorySync/);
});

test('only latest prior order supplies products, size, price and separate units', () => {
  const result = suggest([order('2026-10-01', { items: [{ ...item, productId: 'chicken' }] }), order('2026-10-02'), order('2026-10-03', { items: [{ ...item, unitPrice: 90000 }] })]);
  assert.deepEqual(result.map(row => row.product.id), ['duck']);
  assert.deepEqual(previousOrderDraftFields(result[0].variant), {
    previousOrder: true,
    attributeLabel: '', weightKg: '2kg', unitPrice: 50000,
    quantityUnit: 'Con', actualUnit: 'Con', pricingUnit: 'Kg', billingUnit: 'Kg', configurationId: '',
  });
  assert.equal('quantity' in previousOrderDraftFields(result[0].variant), false);
});

test('customer, company, branch, cancelled and future orders cannot leak into suggestions', () => {
  assert.deepEqual(suggest([
    order('2026-10-02', { customerId: 'b' }), order('2026-10-02', { companyId: 'other' }),
    order('2026-10-02', { branchId: 'branch' }), order('2026-10-02', { status: 'cancelled' }),
    order('2026-10-02', { status: 'rejected' }), order('2026-10-02', { isArchived: true }),
    order('2026-10-04'), order('invalid'),
  ]), []);
});

test('fallback is latest earlier day, never union of older products', () => {
  assert.equal(suggest([order('2026-09-29')])[0].variant.price, 50000);
  const result = suggest([order('2026-10-02', { createdAt: '2026-10-02T08:00:00Z' }), order('2026-10-02', { createdAt: '2026-10-02T09:00:00Z', items: [{ ...item, productId: 'chicken' }] })]);
  assert.deepEqual(result.map(row => row.product.id), ['chicken']);
});

test('exact duplicates collapse, different sizes remain, unavailable products do not resurrect older orders', () => {
  const result = suggest([order('2026-10-02', { items: [item, item, { ...item, sizeLabel: '3kg', unitPrice: 0 }] })]);
  assert.equal(result.length, 2);
  assert.equal(previousOrderDraftFields(result[1].variant).unitPrice, 0);
  assert.deepEqual(suggest([order('2026-10-01'), order('2026-10-02', { items: [{ ...item, productId: 'deleted' }] })]), []);
});

test('closed extra picker does not construct catalog variants', () => {
  const run = appFunction('manualCatalogProductVariantOptions', {
    isManualExtraProductPickerOpen: false,
    activeProducts: { flatMap() { throw Error('unexpected catalog expansion'); } },
  }, { memoCallback: true });
  assert.deepEqual(run(), []);
});

test('4500 request lookup is bounded and leaves history intact', { timeout: 2000 }, () => {
  const requests = Array.from({ length: 4500 }, (_, i) => order('2026-10-02', { customerId: `other${i}` }));
  requests.push(order('2026-10-02'));
  const before = JSON.stringify(requests);
  const start = performance.now();
  for (let i = 0; i < 100; i++) assert.equal(suggest(requests).length, 1);
  console.log(`4501 requests, 100 lookups: ${(performance.now() - start).toFixed(1)}ms`);
  assert.equal(JSON.stringify(requests), before);
});
