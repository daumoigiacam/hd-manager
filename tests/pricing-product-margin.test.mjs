import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildPricingProductMarginRows,
  getPricingProductMarginKey,
  getPricingProductTargetMargin,
  normalizePricingMarginByProduct,
} from '../src/utils/pricingProductMargins.js';

const products = [
  { id: 'duck-hooked', name: 'Vịt móc', category: 'Vịt' },
  { id: 'duck-unhooked', name: 'Vịt không móc', category: 'Vịt' },
  { id: 'duck-offal', name: 'Lòng vịt', category: 'Vịt' },
];

const getGroupKey = product => product.category === 'Vịt' ? 'duck' : 'other';
const getGroupLabel = product => product.category;

const legacyRows = buildPricingProductMarginRows({
  products,
  getGroupKey,
  getGroupLabel,
  marginByProduct: {},
  legacyMarginByGroup: { duck: { targetMargin: 20 } },
});
assert.equal(legacyRows.every(row => row.targetMargin === 20 && row.inheritedFromGroup), true);

const savedMargins = normalizePricingMarginByProduct({
  'duck-hooked': { targetMargin: 15 },
  'duck-unhooked': { targetMargin: 0 },
});
const productRows = buildPricingProductMarginRows({
  products,
  getGroupKey,
  getGroupLabel,
  marginByProduct: savedMargins,
  legacyMarginByGroup: { duck: { targetMargin: 20 } },
});
assert.equal(getPricingProductMarginKey(products[0]), 'duck-hooked');
assert.equal(getPricingProductTargetMargin(savedMargins, 'duck-hooked'), 15);
assert.equal(productRows.find(row => row.productKey === 'duck-hooked').targetMargin, 15);
assert.equal(productRows.find(row => row.productKey === 'duck-unhooked').targetMargin, 0);
assert.equal(productRows.find(row => row.productKey === 'duck-offal').targetMargin, 0, 'missing product margin is not filled from the old group after product configuration exists');
assert.deepEqual(productRows.filter(row => row.targetMargin > 0).map(row => row.productName), ['Vịt móc']);

const appSource = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'App.jsx'), 'utf8');
assert.match(appSource, /marginByProduct/);
assert.match(appSource, /Biên độ lợi nhuận theo sản phẩm/);
assert.match(appSource, /productMargin <= 0/);
assert.match(appSource, /getPricingProductMarginKey/);

console.log('pricing-product-margin: PASS');
