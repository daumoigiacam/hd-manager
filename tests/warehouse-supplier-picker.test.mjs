import assert from 'node:assert/strict';
import fs from 'node:fs';
import { getWarehouseSupplierOptionKey, mergeWarehouseSupplierOptions } from '../src/utils/warehouseSupplierOptions.js';

const recentOptions = [
  { id: 'recent-1', name: 'Chị Cúc Lò', phone: '+84 394 676 542', source: 'recent' },
  { id: 'recent-2', name: 'Chi Cuc Lo', phone: '0394676542', source: 'recent' }
];
const customerOptions = [
  { id: 'customer-1', name: 'Chị Cúc Lò', phone: '0394676542', source: 'customer' },
  { id: 'customer-2', name: 'Chị Cúc Lò', phone: '0900000000', source: 'customer' }
];

assert.equal(getWarehouseSupplierOptionKey(recentOptions[0]), getWarehouseSupplierOptionKey(customerOptions[0]));
assert.equal(
  getWarehouseSupplierOptionKey({ name: 'Chị Cúc Lò', phone: '+84 394 676 542' }),
  getWarehouseSupplierOptionKey({ name: 'Cúc Lò', phone: '0394676542' }),
  'cùng số điện thoại vẫn là một nhà cung cấp dù nhãn tên khác nhau'
);
const merged = mergeWarehouseSupplierOptions(recentOptions, customerOptions);
assert.equal(merged.length, 2, 'trùng tên và số điện thoại chỉ còn một gợi ý');
assert.equal(merged.filter(option => option.name === 'Chị Cúc Lò' && option.phone.replace(/\D/g, '') === '0394676542').length, 1);
assert.equal(merged.find(option => option.phone.replace(/\D/g, '') === '0394676542').source, 'customer', 'bản ghi khách hàng thắng bản ghi lịch sử');
assert.match(fs.readFileSync('src/App.jsx', 'utf8'), /data-keyboard-guard="off"/);

console.log('PASS warehouse supplier picker dedupe and keyboard guard');
