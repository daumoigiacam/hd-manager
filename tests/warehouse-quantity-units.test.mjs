import assert from 'node:assert/strict';
import {
  addWarehouseQuantityUnit,
  buildWarehouseQuantityUnitSuggestions,
  getRecentWarehouseQuantityUnits,
  resolveRememberedWarehouseQuantityUnit
} from '../src/utils/warehouseQuantityUnits.js';

const records = [
  { id: 'old-product', productId: 'p1', groupName: 'Vịt', quantityUnit: 'Thùng', date: '2026-08-20' },
  { id: 'new-product', productId: 'p1', groupName: 'Vịt', quantityUnit: 'Con', date: '2026-08-21' },
  { id: 'group-fallback', productId: 'p2', groupName: 'Gà', quantityUnit: 'Bộ', date: '2026-08-21' }
];

assert.equal(resolveRememberedWarehouseQuantityUnit(records, { productId: 'p1', groupName: 'Vịt' }), 'Con');
assert.equal(resolveRememberedWarehouseQuantityUnit(records, { productId: 'unknown', groupName: 'Vịt' }), 'Con');
assert.equal(resolveRememberedWarehouseQuantityUnit(records, { groupName: 'Gà' }), 'Bộ');
assert.deepEqual(getRecentWarehouseQuantityUnits(records, { productId: 'p1', groupName: 'Vịt' }), ['Con', 'Thùng']);

const suggestions = buildWarehouseQuantityUnitSuggestions({
  rememberedUnit: 'Bộ',
  currentUnit: 'Con',
  recentUnits: ['Kg', 'Bao'],
  customUnits: ['Thùng xốp', 'Khay'],
  max: 5
});
assert.deepEqual(suggestions, ['Bộ', 'Con', 'Kg', 'Bao', 'Thùng xốp']);
assert.equal(suggestions.length, 5);
assert.deepEqual(addWarehouseQuantityUnit(['Con', 'Kg'], ' con '), ['Con', 'Kg']);
assert.deepEqual(addWarehouseQuantityUnit(['Con', 'Kg'], 'Thùng xốp'), ['Con', 'Kg', 'Thùng xốp']);

console.log(`PASS warehouse quantity unit preferences (${suggestions.length} suggestions)`);
