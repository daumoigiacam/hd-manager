import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { appFunction } from './helpers/app-source-function.mjs';
import { createSearchRecordIndex, getProductSearchFields, searchProducts } from '../src/services/searchEngine.js';

test('closed manual customer picker performs no search on draft changes', () => {
  let calls = 0;
  const customers = [{ id: 'c', name: 'Customer' }];
  const make = open => appFunction('manualFilteredCustomers', {
    isManualCustomerPickerOpen: open, manualCustomerSearchKeyword: 'c',
    availableCustomers: customers, primaryDraft: { customerSearch: 'C' },
    searchCustomerRecords: () => { calls++; return customers; },
  }, { memoCallback: true });
  assert.deepEqual(make(false)(), []);
  assert.equal(calls, 0);
  assert.equal(make(true)(), customers);
  assert.equal(calls, 1);
});

test('product membership index preserves single-product matching including aliases', () => {
  const products = Array.from({ length: 600 }, (_, i) => ({ id: `p${i}`, name: `Product ${i}`, shortName: `SP${i}`, unit: 'kg' }));
  const index = createSearchRecordIndex(products, getProductSearchFields);
  for (const query of ['p', 'SP12', '12', 'kg', 'not-found', 'product 5']) {
    const matches = new Set(index.search(query));
    for (const product of products) {
      assert.equal(matches.has(product), searchProducts([product], query).length > 0, `${query}:${product.id}`);
    }
  }
});

test('closed extra-product picker does not filter, sort or group catalog variants', () => {
  const run = appFunction('manualExtraProductVariantOptions', {
    isManualExtraProductPickerOpen: false,
    manualCatalogProductVariantOptions: { filter() { throw new Error('unexpected scan'); } },
  }, { memoCallback: true });
  assert.deepEqual(run(), []);
});

test('both detail-form branches exclude closed pickers from per-character collection scans', () => {
  const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  const view = app.slice(app.indexOf('function OrderRequestView('), app.indexOf('function OrderManagementView('));
  assert.equal((view.match(/const filteredCustomers = !isCustomerPickerOpen \? \[\]/g) || []).length, 2);
  assert.match(view, /const branchScopedProducts = isProductPickerOpen && selectedCustomer/);
  assert.match(view, /const filteredProducts = !isProductPickerOpen \? \[\]/);
  assert.doesNotMatch(view, /productMatchesLookup\(product,/);
});
