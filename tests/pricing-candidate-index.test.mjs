import assert from 'node:assert/strict';
import { test } from 'node:test';
import { appFunction } from './helpers/app-source-function.mjs';

const normalize = appFunction('normalizeLookupText');
const group = text => normalize(text).includes('vit') ? 'duck' : 'other';
const type = appFunction('inferPricingTypeKeyFromText', { normalizeLookupText: normalize });
const catalogGroup = item => item.groupName === 'Catalog only' ? 'catalog' : group(`${item.groupName} ${item.name}`);
const build = appFunction('buildPricingCandidateIndexes', {
  inferPricingTypeKeyFromText: type, inferPricingGroupKeyFromText: group,
  getPricingProductGroupKey: catalogGroup,
});

test('indexed lookups preserve the former find semantics and source order', () => {
  const rows = [
    { name: 'Vịt sống', groupName: 'Vịt', price: 0, isCatalogProduct: false },
    { name: 'Vịt sống', groupName: 'Vịt', price: 60000, isCatalogProduct: false },
    { name: 'Vịt sống', groupName: 'Vịt', price: 63000, isCatalogProduct: true },
    { name: 'Vịt sống', groupName: 'Vịt', price: 64000, isCatalogProduct: true },
    { name: 'Vịt không móc', groupName: 'Vịt', price: -1, isCatalogProduct: true },
    { name: 'Lòng vịt', groupName: 'Catalog only', price: 5000, isCatalogProduct: true },
    ...Array.from({ length: 600 }, (_, i) => ({ name: `Hàng ${i}`, groupName: '', price: i, isCatalogProduct: true })),
  ];
  const indexed = build(rows);
  for (const g of ['duck', 'other', 'catalog', 'missing']) {
    for (const t of ['live', 'unhooked', 'offal', '', 'head']) {
      assert.equal(indexed.pricedCandidateByCell.get(`${g}:${t}`), rows.find(item => group(`${item.groupName} ${item.name}`) === g && type(item.name) === t && item.price > 0));
      assert.equal(indexed.catalogCandidateByCell.get(`${g}:${t}`), rows.find(item => item.isCatalogProduct && catalogGroup(item) === g && type(item.name) === t));
    }
  }
});
test('each candidate is classified only once for type and group', () => {
  let types = 0;
  let groups = 0;
  const counted = appFunction('buildPricingCandidateIndexes', {
    inferPricingTypeKeyFromText: () => { types++; return ''; },
    inferPricingGroupKeyFromText: () => { groups++; return ''; },
    getPricingProductGroupKey: () => '',
  });
  counted(Array.from({ length: 600 }, () => ({ name: '', groupName: '', price: 1, isCatalogProduct: true })));
  assert.equal(types, 600);
  assert.equal(groups, 600);
});

test('quote product ID index preserves saved/legacy/override precedence without rescanning catalog', () => {
  const normalizeIds = appFunction('normalizeCustomerProductIds', {
    normalizeCustomerPriceOverrides: customer => customer.priceOverrides || {},
  });
  const products = [{ id: 'a' }, { id: 'b' }];
  const validIds = new Set(['a', 'b']);
  for (const customer of [
    { customerProductIds: ['a', 'a', 'deleted'], priceOverrides: { b: {} } },
    { quotedProductIds: ['b', 'deleted'] },
    { priceOverrides: { a: {}, deleted: {} } },
    {},
  ]) {
    assert.deepEqual(normalizeIds(customer, products, validIds), normalizeIds(customer, products));
  }
  assert.deepEqual(normalizeIds({ customerProductIds: ['legacy'] }, [], new Set()), ['legacy']);
  let scans = 0;
  products.map = (...args) => { scans++; return Array.prototype.map.apply(products, args); };
  for (let i = 0; i < 360; i++) normalizeIds({ customerProductIds: ['b'] }, products, validIds);
  assert.equal(scans, 0);
  assert.deepEqual(normalizeIds({ customerProductIds: ['a', 'b'] }, [{ id: 'b' }], new Set(['b'])), ['b']);
});
