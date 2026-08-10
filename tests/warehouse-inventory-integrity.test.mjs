import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildWarehouseStockChecklistRows,
  hasRecordedWarehouseStockMeasure,
  resolveWarehouseStockChecklistDisplayValue,
  resolveWarehouseStockCountStatus,
  selectLatestWarehouseStockCountMeasures
} from '../src/utils/warehouseInventory.js';

const checklistRows = buildWarehouseStockChecklistRows([{
  key: 'vit',
  groupName: 'Vịt',
  measureRows: [
    { unit: 'Con', remaining: -2, isPrimaryStockUnit: true },
    { unit: 'Kg', remaining: 45.7, isPrimaryStockUnit: false }
  ]
}]);
assert.equal(checklistRows.length, 1, 'Vịt phải còn trong danh sách kiểm khi Kg vẫn dương');
assert.deepEqual(checklistRows[0].measureRows.map(row => row.unit), ['Kg']);

const orderedChecklistRows = buildWarehouseStockChecklistRows([{
  key: 'ga',
  groupName: 'Gà',
  measureRows: [
    { unit: 'Kg', remaining: 18, isPrimaryStockUnit: false },
    { unit: 'Con', remaining: 8, isPrimaryStockUnit: true }
  ]
}]);
assert.deepEqual(
  orderedChecklistRows[0].measureRows.map(row => row.unit),
  ['Con', 'Kg'],
  'Đơn vị chính phải đứng trước nhưng không được làm mất đơn vị tham chiếu còn tồn'
);

assert.equal(buildWarehouseStockChecklistRows([{
  key: 'empty',
  groupName: 'Hết hàng',
  measureRows: [{ unit: 'Con', remaining: 0, isPrimaryStockUnit: true }]
}]).length, 0, 'Nhóm không còn tồn dương không cần xuất hiện trong checklist');

const manyChecklistRows = buildWarehouseStockChecklistRows([
  ...Array.from({ length: 12 }, (_, index) => ({
    key: `group_${index}`,
    groupName: `Nhóm ${index}`,
    measureRows: [{ unit: 'Con', remaining: index + 1, isPrimaryStockUnit: true }]
  })),
  {
    key: 'duck_after_twelve',
    groupName: 'Vịt',
    measureRows: [{ unit: 'Kg', remaining: 25, isPrimaryStockUnit: false }]
  }
]);
assert.equal(manyChecklistRows.length, 13, 'Checklist không được âm thầm ẩn các nhóm sau vị trí thứ 12');
assert.equal(manyChecklistRows.at(-1)?.groupName, 'Vịt');

const countRecords = [
  { id: 'old-con', groupName: 'Vịt', date: '2026-08-09', updatedAt: 100, measures: [{ unit: 'Con', quantity: 20 }] },
  { id: 'new-con', groupName: 'Vịt', date: '2026-08-10', updatedAt: 300, measures: [{ unit: 'Con', quantity: 15 }] },
  { id: 'kg-snapshot', groupName: 'Vịt', date: '2026-08-10', updatedAt: 200, measures: [{ unit: 'Kg', quantity: 45.7 }] },
  { id: 'future', groupName: 'Vịt', date: '2026-08-11', updatedAt: 400, measures: [{ unit: 'Con', quantity: 99 }] },
  { id: 'zero-duck', groupName: 'Vịt con', date: '2026-08-10', updatedAt: 500, measures: [{ unit: 'Con', quantity: 0 }] }
];
const latestCounts = selectLatestWarehouseStockCountMeasures(countRecords, {
  getGroupKey: item => item.groupName.toLocaleLowerCase('vi'),
  getGroupName: item => item.groupName,
  getDateKey: item => item.date,
  getTimestamp: item => item.updatedAt,
  getMeasures: item => item.measures,
  getUnitKey: measure => measure.unit.toLocaleLowerCase('vi'),
  targetDate: '2026-08-10'
});
const duckSnapshot = latestCounts.get('vịt');
assert.equal(duckSnapshot.measures.find(row => row.unit === 'Con')?.quantity, 15, 'Kiểm lại Con phải thay thế số cũ, không cộng dồn');
assert.equal(duckSnapshot.measures.find(row => row.unit === 'Kg')?.quantity, 45.7, 'Snapshot Kg độc lập phải được giữ lại');
assert.equal(duckSnapshot.measures.some(row => row.quantity === 99), false, 'Không lấy snapshot sau ngày đang xem');
assert.equal(latestCounts.get('vịt con').measures[0].quantity, 0, 'Tồn thực tế bằng 0 phải khác với chưa kiểm');

const previousDayBaseline = selectLatestWarehouseStockCountMeasures(countRecords, {
  getGroupKey: item => item.groupName.toLocaleLowerCase('vi'),
  getGroupName: item => item.groupName,
  getDateKey: item => item.date,
  getTimestamp: item => item.updatedAt,
  getMeasures: item => item.measures,
  getUnitKey: measure => measure.unit.toLocaleLowerCase('vi'),
  targetDate: '2026-08-10',
  excludeTargetDate: true
});
assert.equal(
  previousDayBaseline.get('vịt').measures.find(row => row.unit === 'Con')?.quantity,
  20,
  'Số kiểm của chính ngày đang xem không được dùng làm tồn đầu kỳ và che mất sai lệch'
);
assert.equal(
  previousDayBaseline.get('vịt').measures.some(row => row.unit === 'Kg'),
  false,
  'Đơn vị chỉ mới kiểm trong ngày hiện tại chưa phải là baseline của ngày đó'
);

assert.equal(resolveWarehouseStockCountStatus([
  { unit: 'Con', status: 'uncounted' }
], true), 'uncounted', 'Kiểm Kg không được làm đơn vị Con chưa kiểm trở thành trạng thái ổn');
assert.equal(resolveWarehouseStockCountStatus([
  { unit: 'Con', status: 'ok' }
], true), 'ok');
assert.equal(resolveWarehouseStockCountStatus([
  { unit: 'Con', status: 'loss' },
  { unit: 'Kg', status: 'uncounted' }
], true), 'loss', 'Sai lệch phải được ưu tiên cảnh báo trước trạng thái chưa kiểm');

assert.equal(
  hasRecordedWarehouseStockMeasure({ status: 'uncounted', actual: 0 }),
  false,
  'Dòng chỉ mới tạo để chờ kiểm không được xem là đã kiểm 0'
);
assert.equal(
  resolveWarehouseStockChecklistDisplayValue({ status: 'uncounted', actual: 0 }, 45.7),
  45.7,
  'Chưa kiểm phải hiển thị tồn hệ thống cần đối chiếu'
);
assert.equal(
  resolveWarehouseStockChecklistDisplayValue({ status: 'loss', actual: 0 }, 45.7),
  0,
  'Số 0 đã kiểm phải được giữ nguyên, không thay bằng tồn dự kiến'
);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'App.jsx'), 'utf8');
assert.match(appSource, /buildWarehouseStockChecklistRows\(warehouseStockRows\)/);
assert.doesNotMatch(appSource, /visibleWarehouseStockRows\.slice\(0, 12\)/);
assert.doesNotMatch(appSource, /row\.measureRows\.slice\(0, 3\)/);
assert.match(appSource, /selectLatestWarehouseStockCountMeasures\(dayStockCounts/);
assert.match(appSource, /excludeTargetDate: true/);
assert.match(appSource, /countedMeasures/);
assert.doesNotMatch(appSource, /resolveEntityDateKey\(item, workingDate\)/, 'Không được gán phiếu thiếu ngày vào ngày đang xem');
assert.doesNotMatch(appSource, /resolveEntityDateKey\(item, safeTargetDate\)/, 'Không được gán phiếu thiếu ngày vào ngày tính tồn');

console.log('Warehouse inventory integrity tests passed.');
