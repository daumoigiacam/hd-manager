import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { readFile } from 'node:fs/promises';
import {
  WAREHOUSE_WEIGHT_ENTRY_ROW_SIZE,
  ensureWarehouseWeightEntryRows,
  getWarehouseWeightEntryTotal,
  normalizeWarehouseWeightEntries,
  resolveWarehouseWeightEntryChange,
  sanitizeWarehouseWeightEntryValue,
  updateWarehouseWeightEntryRows
} from '../src/utils/warehouseWeightEntries.js';
import { buildWarehouseDispatchProductOptions } from '../src/utils/warehouseDispatchProductOptions.js';

const test = (name, callback) => {
  callback();
  console.log(`PASS ${name}`);
};

test('giữ nguyên chuỗi kg khi nhập tuần tự', () => {
  let value = '';
  for (const character of '12.5') {
    value = sanitizeWarehouseWeightEntryValue(`${value}${character}`);
  }
  assert.equal(value, '12.5');
});

test('hỗ trợ dấu phẩy và chỉ giữ một dấu thập phân', () => {
  assert.equal(sanitizeWarehouseWeightEntryValue('12,5'), '12,5');
  assert.equal(sanitizeWarehouseWeightEntryValue('12,5kg'), '12,5');
  assert.equal(sanitizeWarehouseWeightEntryValue('12,5.7'), '12,57');
});

test('chan chuoi IME bi phat lai tren Android WebView', () => {
  assert.equal(resolveWarehouseWeightEntryChange('12.5', '12.512.5'), '12.5');
  assert.equal(resolveWarehouseWeightEntryChange('12', '1212'), '12');
  assert.equal(resolveWarehouseWeightEntryChange('1', '11'), '11');
  assert.equal(resolveWarehouseWeightEntryChange('121', '1212'), '1212');
});

test('chuẩn hóa và cộng đúng các lần cân', () => {
  assert.deepEqual(normalizeWarehouseWeightEntries(['12.5', '10,25', '', '0']), [12.5, 10.25]);
  assert.equal(getWarehouseWeightEntryTotal(['12.5', '10,25']), 22.75);
  assert.equal(getWarehouseWeightEntryTotal(['10', '13', '30', '', '']), 53);
});

test('mỗi hàng có đúng năm ô và chỉ thêm hàng khi hàng cuối đầy', () => {
  assert.equal(WAREHOUSE_WEIGHT_ENTRY_ROW_SIZE, 5);
  assert.equal(ensureWarehouseWeightEntryRows(['12']).length, 5);
  assert.equal(ensureWarehouseWeightEntryRows(['1', '2', '3', '4', '5'], true).length, 10);
  assert.equal(ensureWarehouseWeightEntryRows(['1', '2', '', '4', '5'], true).length, 5);
});

test('xử lý chuỗi nhập nằm xa dưới ngưỡng 16 ms', () => {
  const iterations = 50000;
  const startedAt = performance.now();
  for (let index = 0; index < iterations; index += 1) {
    sanitizeWarehouseWeightEntryValue(`${index % 999},${index % 100}`);
  }
  const elapsedMs = performance.now() - startedAt;
  const averageMs = elapsedMs / iterations;
  assert.ok(averageMs < 0.05, `Trung bình ${averageMs.toFixed(4)} ms/lần`);
  console.log(`INFO sanitize average ${averageMs.toFixed(4)} ms/input`);
});

test('toan bo chuyen doi state cua mot ky tu nam duoi 16 ms', () => {
  const iterations = 50000;
  let entries = ensureWarehouseWeightEntryRows([]);
  const startedAt = performance.now();
  for (let index = 0; index < iterations; index += 1) {
    entries = updateWarehouseWeightEntryRows(entries, 0, `${index % 999},5`);
  }
  const elapsedMs = performance.now() - startedAt;
  const averageMs = elapsedMs / iterations;
  assert.ok(averageMs < 0.05, `Trung binh ${averageMs.toFixed(4)} ms/lan`);
  console.log(`INFO full input transition average ${averageMs.toFixed(4)} ms/input`);
});

test('khach chua co don dat duoc chon loai hang trong danh muc dang hoat dong', () => {
  const orderedProduct = { id: 'ordered', name: 'Hang da dat' };
  const fixedProduct = { id: 'fixed', name: 'Hang co dinh' };
  const catalogProduct = { id: 'catalog', name: 'Hang trong danh muc' };
  const archivedProduct = { id: 'archived', name: 'Hang da luu tru', isArchived: true };
  const options = buildWarehouseDispatchProductOptions({
    orderedProducts: [orderedProduct],
    fixedProducts: [fixedProduct, orderedProduct],
    catalogProducts: [catalogProduct, archivedProduct, fixedProduct],
    canBrowseCatalog: false,
    canCreateWithoutOrderRequest: true,
  });

  assert.deepEqual(options.map(product => product.id), ['ordered', 'fixed', 'catalog']);
});

test('danh muc chi mo khi co quyen duyet danh muc hoac tao phieu ngoai don', () => {
  const orderedProduct = { id: 'ordered', name: 'Hang da dat' };
  const catalogProduct = { id: 'catalog', name: 'Hang trong danh muc' };
  const withManualBrowse = buildWarehouseDispatchProductOptions({
    orderedProducts: [orderedProduct],
    catalogProducts: [catalogProduct],
    canBrowseCatalog: true,
    canCreateWithoutOrderRequest: false,
  });
  const withCreateOutsidePermission = buildWarehouseDispatchProductOptions({
    orderedProducts: [orderedProduct],
    catalogProducts: [catalogProduct],
    canBrowseCatalog: false,
    canCreateWithoutOrderRequest: true,
  });
  const withoutPermission = buildWarehouseDispatchProductOptions({
    orderedProducts: [],
    catalogProducts: [catalogProduct],
    canBrowseCatalog: false,
    canCreateWithoutOrderRequest: false,
  });

  assert.deepEqual(withManualBrowse.map(product => product.id), ['ordered', 'catalog']);
  assert.deepEqual(withCreateOutsidePermission.map(product => product.id), ['ordered', 'catalog']);
  assert.deepEqual(withoutPermission, []);
});

const appSource = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
const modalStart = appSource.indexOf('const WarehouseWeightEntriesModal = React.memo');
const moduleStart = appSource.indexOf('function WarehouseDispatchView');
assert.ok(modalStart >= 0 && moduleStart > modalStart, 'Không tìm thấy editor kg độc lập');
const modalSource = appSource.slice(modalStart, moduleStart);
const moduleEnd = appSource.indexOf('const OrderRequestSelectableProductCard', moduleStart);
const warehouseModuleSource = appSource.slice(moduleStart, moduleEnd);

test('editor kg dùng state cục bộ và không cập nhật màn hình cha khi gõ', () => {
  assert.match(modalSource, /const \[entries, setEntries\] = useState/);
  assert.doesNotMatch(modalSource, /setDispatchDraft|setDispatchListWeightEditor/);
});

test('không tự chuyển ô trong lúc IME composition', () => {
  assert.match(modalSource, /nativeEvent\?\.isComposing/);
  assert.match(modalSource, /onCompositionStart/);
  assert.match(modalSource, /onCompositionEnd/);
  assert.doesNotMatch(appSource, /shouldAutoAdvanceWeightEntry|weightEntryAutoAdvanceTimerRef/);
});

test('chỉ lưu dữ liệu sau thao tác xác nhận', () => {
  const changeHandlerStart = modalSource.indexOf('const handleEntryChange');
  const keyHandlerStart = modalSource.indexOf('const handleEntryKeyDown');
  const changeHandlerSource = modalSource.slice(changeHandlerStart, keyHandlerStart);
  assert.equal((changeHandlerSource.match(/setEntries\(/g) || []).length, 1);
  assert.doesNotMatch(changeHandlerSource, /Firestore|saveDataDocument|onEditWarehouseDispatch|fetch\(/);
});

test('danh sách phiếu xuất mở đúng editor theo từng ô', () => {
  assert.match(warehouseModuleSource, /openDispatchCellEditor\(row, 'assignedDriverId', event\)/);
  assert.match(warehouseModuleSource, /openDispatchCellEditor\(row, 'customerId', event\)/);
  assert.match(warehouseModuleSource, /openDispatchCellEditor\(row, 'productId', event\)/);
  assert.match(warehouseModuleSource, /openDispatchCellEditor\(row, 'pieceCount', event\)/);
  assert.match(warehouseModuleSource, /openDispatchListWeightEditor\(row, event\)/);
  assert.match(warehouseModuleSource, /onDelete=\{deleteDispatchCellEditorRow\}/);
});

test('ô người giao thuộc đúng từng dòng phiếu xuất của khách hàng', () => {
  assert.doesNotMatch(warehouseModuleSource, /<td rowSpan=\{driverCellRowSpan\}[^>]*bg-sky-50/);
  assert.match(warehouseModuleSource, /aria-label=\{`Sửa người giao phiếu xuất của \$\{group\.customerName \|\| row\.customerName \|\| 'khách hàng'\}`\}/);
  assert.match(warehouseModuleSource, /<span className="mt-1 block font-medium text-slate-900">\{rowDriverName\}<\/span>/);
});

test('sửa ô kg giữ từng lần cân và tự cộng lại tổng', () => {
  assert.match(warehouseModuleSource, /initialEntries: ensureWarehouseWeightEntryRows\(editableWeightEntries\.map/);
  assert.match(warehouseModuleSource, /const nextSourceWeight = normalizedEntries\.reduce\(\(sum, value\) => sum \+ value, 0\)/);
  assert.match(warehouseModuleSource, /weightEntries: normalizedEntries/);
  assert.doesNotMatch(warehouseModuleSource, /weightEntries: nextValue === '' \? \[\] : \[nextValue\]/);
});

test('picker loai hang dung danh muc du phong khi khach chua co don dat', () => {
  assert.match(warehouseModuleSource, /buildWarehouseDispatchProductOptions\(\{/);
  assert.match(appSource, /canManualSearchDispatchProduct=\{canRoleAction\('warehouse_dispatch', 'manual_search_dispatch_product'\)\}/);
  assert.match(warehouseModuleSource, /canBrowseCatalog: canBrowseDispatchCatalog/);
  assert.match(warehouseModuleSource, /canCreateWithoutOrderRequest: canCreateDispatchWithoutOrderRequest/);
  assert.doesNotMatch(warehouseModuleSource, /hasOrderRequest:/);
});

test('VPS xuất kho chỉ chọn dòng đơn còn chưa xuất và gửi lineage canonical', () => {
  assert.match(appSource, /buildVpsPendingDispatchOrderRows/);
  assert.match(appSource, /orders=\{orders\}/);
  assert.match(warehouseModuleSource, /warehouseId: orderRow\.warehouseId \|\| ''/);
  assert.match(warehouseModuleSource, /unitId: orderRow\.unitId \|\| ''/);
  assert.match(warehouseModuleSource, /orderId: matchedOrderRow\?\.orderId \|\| ''/);
  assert.match(warehouseModuleSource, /orderLineId: matchedOrderRow\?\.orderLineId \|\| ''/);
  assert.match(warehouseModuleSource, /sourceType: isVpsMode/);
  assert.match(warehouseModuleSource, /Đơn nguồn chưa có kho hoặc UOM đã xác định/);
});

test('màn hình xuất kho không hiển thị bộ chọn master kỹ thuật hay bảng chẩn đoán VPS', () => {
  assert.match(appSource, /const SHOW_VPS_READ_DIAGNOSTICS = import\.meta\.env\.VITE_SHOW_VPS_READ_DIAGNOSTICS === 'true';/);
  assert.match(appSource, /if \(!SHOW_VPS_READ_DIAGNOSTICS \|\| !moduleKey \|\| !model\) return null;/);
  assert.doesNotMatch(warehouseModuleSource, /Kho VPS/);
  assert.doesNotMatch(warehouseModuleSource, /Đơn vị tồn VPS/);
});

test('đơn tham chiếu điền mặc định nhưng vẫn gửi giá trị nhân viên chỉnh sửa làm số thực xuất', () => {
  assert.match(warehouseModuleSource, /plannedQuantity: orderDefaults\.pieceCount \|\| ''/);
  assert.match(warehouseModuleSource, /plannedWeightKg: orderDefaults\.weightKg \|\| ''/);
  assert.match(warehouseModuleSource, /placeholder="Số lượng xuất \(có thể sửa\)"/);
  assert.match(warehouseModuleSource, /'Kg thực xuất'/);
  assert.match(warehouseModuleSource, /pieceCount: orderDefaults\.pieceCount \|\| ''/);
  assert.match(warehouseModuleSource, /weightKg: orderDefaults\.weightKg \|\| ''/);
  assert.match(warehouseModuleSource, /pieceCount: pieceCountValue \|\| \(shouldReplaceDraft \? orderDefaults\.pieceCount : baseDraft\.pieceCount\)/);
  assert.match(warehouseModuleSource, /weightKg: weightValue \|\| \(shouldReplaceDraft \? orderDefaults\.weightKg : baseDraft\.weightKg\)/);
  assert.match(warehouseModuleSource, /số đang hiển thị sẽ được lưu là số thực xuất/);
  assert.match(appSource, /actualCount: parseLooseQuantityValue\(dispatchData\?\.pieceCount \?\? dispatchData\?\.quantityCount\)/);
  assert.match(warehouseModuleSource, /WAREHOUSE_DISPATCH_EXCEEDS_ORDER_LINE/);
  assert.match(warehouseModuleSource, /app không tự đổi số trên đơn hoặc số tồn/);
});

test('VPS báo rõ tồn âm thay vì che lỗi bằng thông báo API chung', () => {
  assert.match(warehouseModuleSource, /NEGATIVE_STOCK_NOT_ALLOWED/);
  assert.match(warehouseModuleSource, /Không thể lưu phiếu xuất vì tồn kho của đúng đơn vị chưa đủ/);
  assert.match(warehouseModuleSource, /hệ thống không tự cho phép tồn âm/);
});

test('thanh tim kiem danh sach xuat kho khong ep dong tong so tren mobile', () => {
  assert.match(warehouseModuleSource, /flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center/);
  assert.match(warehouseModuleSource, /w-full min-w-0 text-xs font-bold text-slate-500 sm:flex-1/);
  assert.match(warehouseModuleSource, /flex w-full min-w-0 flex-wrap items-center justify-end gap-2 sm:w-auto sm:shrink-0/);
  assert.match(warehouseModuleSource, /min-w-0 flex-1 items-center gap-2 rounded-full/);
});

console.log('Warehouse dispatch weight input regression suite passed.');
