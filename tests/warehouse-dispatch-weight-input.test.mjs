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

const appSource = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
const modalStart = appSource.indexOf('const WarehouseWeightEntriesModal = React.memo');
const moduleStart = appSource.indexOf('function WarehouseDispatchView');
assert.ok(modalStart >= 0 && moduleStart > modalStart, 'Không tìm thấy editor kg độc lập');
const modalSource = appSource.slice(modalStart, moduleStart);

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

console.log('Warehouse dispatch weight input regression suite passed.');
