import assert from 'node:assert/strict';
import {
  buildWarehouseProductScanLookup,
  extractWarehouseProductScanCandidates,
  resolveWarehouseProductScan
} from '../src/utils/warehouseProductScanner.js';

const products = [
  {
    id: 'product-vkm',
    name: 'Vịt Không Móc',
    shortName: 'VKM',
    barcode: '893850000001',
    productCode: 'VKM-001'
  },
  {
    id: 'product-box',
    name: 'Thùng xốp',
    sku: 'BOX-12',
    barcode: '893850000002'
  }
];

const lookup = buildWarehouseProductScanLookup(products);

assert.equal(resolveWarehouseProductScan(lookup, '893850000001').product.id, 'product-vkm');
assert.equal(resolveWarehouseProductScan(lookup, 'vkm001').product.id, 'product-vkm');
assert.equal(
  resolveWarehouseProductScan(lookup, 'https://app.hdconnect.net/products/VKM-001?source=qr').product.id,
  'product-vkm'
);
assert.equal(
  resolveWarehouseProductScan(lookup, JSON.stringify({ productCode: 'BOX-12' })).product.id,
  'product-box'
);
assert.equal(resolveWarehouseProductScan(lookup, 'unknown-code').product, null);
assert.deepEqual(
  extractWarehouseProductScanCandidates('893850000001|VKM-001').slice(0, 2),
  ['893850000001|VKM-001', '893850000001']
);

const scanPayloads = ['893850000001', 'VKM-001', 'https://app.hdconnect.net/products/VKM-001?source=qr', 'BOX-12'];
const expectedProductIds = ['product-vkm', 'product-vkm', 'product-vkm', 'product-box'];
const concurrentResults = [];
for (let round = 0; round < 20; round += 1) {
  const batch = await Promise.all(Array.from({ length: 50 }, async (_, index) => {
    const payloadIndex = index % scanPayloads.length;
    return resolveWarehouseProductScan(lookup, scanPayloads[payloadIndex]);
  }));
  concurrentResults.push(...batch);
  batch.forEach((result, index) => {
    const payloadIndex = index % scanPayloads.length;
    assert.equal(result.product?.id, expectedProductIds[payloadIndex]);
  });
}

assert.equal(concurrentResults.length, 1000);
console.log(`PASS warehouse product scanner (${concurrentResults.length} logical concurrent scans)`);
