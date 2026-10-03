import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { parse } from '@babel/parser';
import { appFunction } from './helpers/app-source-function.mjs';
import { createRecordCalculationCache } from '../src/services/recordCalculationCache.js';

test('delivery source pricing does not prepare unused fallback configuration', () => {
  let fallbackCalls = 0;
  let requests = [];
  const product = { id: 'p', name: 'Product', unit: 'Kg' };
  const customer = { id: 'c', name: 'Customer' };
  const normalize = value => `${value || ''}`.trim().toLowerCase();
  const snapshot = ({ record }) => ({ hasFrozenPricing: Boolean(record.frozen),
    unitPrice: record.unitPrice || 0, billingUnit: 'kg', actualUnit: 'kg',
    billingQuantity: record.quantity || 0, amount: record.amount || 0 });
  const bindings = {
    workingDate: '2026-10-02', products: [product], customerLookup: new Map([['c', customer]]),
    productLookup: new Map([['p', product]]), resolveTransactionBillingSnapshot: snapshot,
    resolveEntityDateKey: record => record.date || '2026-10-02',
    parseDateInputValue: value => new Date(value), normalizeLookupText: normalize,
    collapseLookupText: normalize, getProductShortName: row => row?.name || '',
    getEntityTimestamp: () => 1, parseLooseMoneyValue: value => Number(value) || 0,
    getCustomerBranchProductConfigSource: () => { fallbackCalls++; return customer; },
    resolveCustomerProductBillingConfiguration: () => ({ unitPrice: 9, billingUnit: 'kg' }),
    normalizeProductPricingUnit: normalize, isCustomerProductUnitAllowed: () => true,
    parseLooseQuantityValue: value => Number(value) || 0,
    findDeliveryRequests: () => requests,
    getDeliveryRequestMetadata: request => ({ requestDate: '2026-10-02', requestDateMs: Date.parse('2026-10-02'),
      requestTimestamp: 1, requestCustomer: customer, requestCustomerName: customer.name,
      requestItems: request.items, requestBranchId: '', requestBranchName: '' }),
    getOrderLineUnitPriceValue: row => row.unitPrice || 0,
    getOrderLineQuantityValue: row => row.quantity || 0, getOrderLineWeightKgValue: () => 0,
    getOrderLineSizeLabel: () => '', getCustomerProductPricingUnit: () => 'kg',
    areLooseQuantityValuesClose: (a, b) => a === b,
  };
  bindings.getDeliveryItemSearchNames = appFunction('getDeliveryItemSearchNames', {
    createRecordCalculationCache, getProductShortName: bindings.getProductShortName,
    normalizeLookupText: normalize, collapseLookupText: normalize,
  }, { memoCallback: true, scope: 'DeliveryReportView' })();
  bindings.getDeliveryItemBillingSnapshot = appFunction('getDeliveryItemBillingSnapshot', {
    createRecordCalculationCache, resolveTransactionBillingSnapshot: snapshot,
  }, { memoCallback: true, scope: 'DeliveryReportView' })();
  bindings.getDeliveryItemMatchMetadata = appFunction('getDeliveryItemMatchMetadata', {
    ...bindings, createRecordCalculationCache,
  }, { memoCallback: true, scope: 'DeliveryReportView' })();
  const calculate = appFunction('calculateDispatchOrderRequestPrice', bindings,
    { memoCallback: true, scope: 'DeliveryReportView' });
  const dispatch = { customerId: 'c', productId: 'p', quantity: 3, date: '2026-10-02' };
  assert.equal(calculate({ ...dispatch, frozen: true, unitPrice: 7 }, product, customer).unitPrice, 7);
  assert.equal(fallbackCalls, 0);
  requests = [{ id: 'r', customerId: 'c', items: [{ productId: 'p', frozen: true, unitPrice: 5, quantity: 3, amount: 15 }] }];
  const source = calculate(dispatch, product, customer);
  assert.equal(source.unitPrice, 5);
  assert.equal(source.amount, 15);
  assert.equal(source.source, 'order_snapshot');
  assert.equal(fallbackCalls, 0, 'neither fallback nor legacy configuration is needed for a frozen source');
  requests = [];
  assert.equal(calculate(dispatch, product, customer).unitPrice, 9);
  assert.equal(fallbackCalls, 1, 'missing source still uses the required customer fallback');

  const oldSource = execFileSync('git', ['show', '5f162f5c:src/App.jsx'], { encoding: 'utf8', maxBuffer: 30 * 1024 * 1024, timeout: 10000 });
  const tree = parse(oldSource, { sourceType: 'module', plugins: ['jsx'] });
  let oldNode;
  const walk = node => {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'VariableDeclarator' && node.id?.name === 'resolveDispatchOrderRequestPrice') oldNode = node.init.arguments[0];
    for (const [key, value] of Object.entries(node)) {
      if (['loc', 'start', 'end'].includes(key)) continue;
      if (Array.isArray(value)) value.forEach(walk);
      else if (value?.type) walk(value);
    }
  };
  walk(tree);
  assert.ok(oldNode);
  const original = new Function(...Object.keys(bindings), `return (${oldSource.slice(oldNode.start, oldNode.end)})`)(...Object.values(bindings));
  for (const frozen of [false, true]) {
    for (const price of [0, 5, 19]) {
      requests = [{ id: 'r', customerId: 'c', items: [{ productId: 'p', frozen, unitPrice: price, quantity: 3, amount: 15 }] }];
      assert.deepEqual(calculate(dispatch, product, customer), original(dispatch, product, customer));
      assert.deepEqual(calculate({ ...dispatch, frozen, unitPrice: price }, product, customer),
        original({ ...dispatch, frozen, unitPrice: price }, product, customer));
    }
  }
  for (let seed = 0; seed < 40; seed++) {
    requests = Array.from({ length: 8 }, (_, r) => ({
      id: `r${r}`, customerId: 'c', items: Array.from({ length: 6 }, (_, i) => ({
        productId: i % 3 === 0 ? 'missing' : 'p', frozen: (seed + i + r) % 2 === 0,
        unitPrice: (seed + r + i) % 7, quantity: (seed + i) % 5,
        amount: (seed + i + r) * 3, rowKey: `row${i}`, configurationId: `cfg${i % 2}`,
        size: `${i % 3}`, unit: 'kg',
      })),
    }));
    const row = { ...dispatch, sourceOrderRequestId: `r${seed % 8}`,
      sourceOrderRequestRowKey: `row${seed % 6}`, configurationId: `cfg${seed % 2}`, size: `${seed % 3}` };
    assert.deepEqual(calculate(row, product, customer), original(row, product, customer), `candidate parity seed ${seed}`);
  }
  requests = [{ id: 'r', customerId: 'c', items: Array.from({ length: 40 }, (_, i) => ({
    productId: 'p', unitPrice: i + 1, quantity: 3, unit: 'kg',
  })) }];
  fallbackCalls = 0;
  const winner = calculate(dispatch, product, customer);
  assert.equal(winner.unitPrice, 1, 'stable ties still select first source item');
  assert.equal(fallbackCalls, 1, 'legacy unit configuration is resolved only for the winning item');
});
