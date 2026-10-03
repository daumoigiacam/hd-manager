import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { appFunction } from './helpers/app-source-function.mjs';

const source = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const normalizeEmployeePosition = appFunction('normalizeEmployeePosition', {
  normalizeLookupText: value => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').toLowerCase(),
  LEGACY_POSITION_MAP: {}, WAREHOUSE_EXPORT_POSITION: 'Cân hàng xuất kho', SALES_COLLABORATOR_POSITION: 'Cộng tác viên kinh doanh',
});
const isAccountingPosition = appFunction('isAccountingPosition', { normalizeEmployeePosition });

test('missing profile position cannot inherit accounting access from the display label', () => {
  assert.equal(isAccountingPosition(''), false);
  assert.equal(isAccountingPosition(undefined), false);
  assert.equal(isAccountingPosition('Nhân sự'), true, 'real HR position remains supported');
  assert.match(source, /const isAccounting = isSuperAdmin \|\| isAccountingPosition\(employee\?\.position \|\| ''\)/);
  assert.doesNotMatch(source, /const isAccounting = isSuperAdmin \|\| isAccountingPosition\(position\)/);
});

test('late employee profiles keep personal home; actual accounting and owner retain access', () => {
  for (const position of ['', 'Kinh doanh', 'Tài xế', 'Sản xuất', 'Cân hàng xuất kho']) assert.equal(isAccountingPosition(position), false);
  for (const position of ['Chủ doanh nghiệp', 'Kế toán & nhân sự', 'Kế toán']) assert.equal(isAccountingPosition(position), true);
});
