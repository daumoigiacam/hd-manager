import assert from 'node:assert/strict';
import readXlsxFile from 'read-excel-file/node';
import {
  CUSTOMER_RECONCILIATION_FILTERS,
  buildCustomerReconciliationExportFileName,
  buildCustomerReconciliationWorkbook,
  filterCustomerReconciliationRows,
  getCustomerReconciliationDirectionLabel,
  getCustomerReconciliationFilterLabel,
  normalizeCustomerReconciliationFilter,
  paginateCustomerReconciliationRows,
  summarizeCustomerReconciliationRows
} from '../src/utils/customerReconciliationExport.js';

const rows = [
  {
    id: 'purchase-1',
    direction: CUSTOMER_RECONCILIATION_FILTERS.COMPANY_PURCHASE,
    title: 'Công ty mua hàng từ khách',
    detail: 'Vịt nguyên liệu',
    reference: 'PN001',
    dateLabel: '12/08/2026',
    amount: 1_500_000,
    amountLabel: 'Cty nợ/mua',
    metrics: { weightKg: 25, pieces: 10, priceLabel: 'Giá 60.000 đ' }
  },
  {
    id: 'order-1',
    direction: CUSTOMER_RECONCILIATION_FILTERS.CUSTOMER_PURCHASE,
    title: 'Hóa đơn bán hàng',
    detail: 'Gà móc sạch & <đối soát>',
    reference: 'HD001',
    dateLabel: '13/08/2026',
    amount: 2_100_000,
    amountLabel: 'Khách mua',
    metrics: { weightKg: 35, pieces: 0, priceLabel: 'Giá 60.000 đ' }
  },
  {
    id: 'payment-1',
    direction: 'payment',
    title: 'Khách thanh toán',
    detail: 'Chuyển khoản',
    reference: 'TT001',
    dateLabel: '13/08/2026',
    amount: 500_000,
    amountLabel: 'Đã thu'
  },
  {
    id: 'pending-1',
    direction: 'pending',
    title: 'Giao dịch chờ đối soát',
    detail: 'Chờ ghép',
    reference: 'GD001',
    dateLabel: '14/08/2026',
    amount: 200_000,
    amountLabel: 'Chờ xử lý'
  }
];

assert.equal(normalizeCustomerReconciliationFilter('unknown'), CUSTOMER_RECONCILIATION_FILTERS.ALL);
assert.equal(getCustomerReconciliationFilterLabel(CUSTOMER_RECONCILIATION_FILTERS.COMPANY_PURCHASE), 'Công ty mua');
assert.equal(getCustomerReconciliationFilterLabel(CUSTOMER_RECONCILIATION_FILTERS.CUSTOMER_PURCHASE), 'Khách mua');
assert.equal(getCustomerReconciliationDirectionLabel('payment'), 'Thanh toán / cấn trừ');

assert.equal(filterCustomerReconciliationRows(rows, CUSTOMER_RECONCILIATION_FILTERS.ALL).length, 4);
assert.deepEqual(
  filterCustomerReconciliationRows(rows, CUSTOMER_RECONCILIATION_FILTERS.COMPANY_PURCHASE).map(row => row.id),
  ['purchase-1']
);
assert.deepEqual(
  filterCustomerReconciliationRows(rows, CUSTOMER_RECONCILIATION_FILTERS.CUSTOMER_PURCHASE).map(row => row.id),
  ['order-1']
);

const summary = summarizeCustomerReconciliationRows(rows);
assert.equal(summary.count, 4);
assert.equal(summary.companyPurchaseAmount, 1_500_000);
assert.equal(summary.customerPurchaseAmount, 2_100_000);
assert.equal(summary.paymentAmount, 500_000);
assert.equal(summary.pendingAmount, 200_000);

const pages = paginateCustomerReconciliationRows(Array.from({ length: 31 }, (_, index) => ({ id: index })), 14);
assert.equal(pages.length, 3);
assert.equal(pages[0].length, 14);
assert.equal(pages[1].length, 14);
assert.equal(pages[2].length, 3);
assert.deepEqual(paginateCustomerReconciliationRows([], 14), []);

const fileName = buildCustomerReconciliationExportFileName({
  customerName: 'Cửa Hàng Bến Tre',
  filter: CUSTOMER_RECONCILIATION_FILTERS.CUSTOMER_PURCHASE,
  extension: 'xlsx',
  dateKey: '2026-08-14'
});
assert.equal(fileName, 'doi-soat-cua-hang-ben-tre-khach-mua-2026-08-14.xlsx');

const workbook = buildCustomerReconciliationWorkbook({
  companyName: 'HD Manager',
  customerName: 'Cửa Hàng Bến Tre',
  filter: CUSTOMER_RECONCILIATION_FILTERS.ALL,
  generatedAt: '14/08/2026 10:30:00',
  rows
});
assert.ok(workbook instanceof Uint8Array);
assert.equal(workbook[0], 0x50);
assert.equal(workbook[1], 0x4B);
assert.ok(workbook.length > 5_000);

const workbookText = new TextDecoder().decode(workbook);
assert.match(workbookText, /\[Content_Types\]\.xml/);
assert.match(workbookText, /xl\/worksheets\/sheet1\.xml/);
assert.match(workbookText, /Cửa Hàng Bến Tre/);
assert.match(workbookText, /Gà móc sạch &amp; &lt;đối soát&gt;/);
assert.match(workbookText, /2100000/);
assert.match(workbookText, /Tổng công ty mua/);

const parsedWorkbook = await readXlsxFile(Buffer.from(workbook));
assert.equal(parsedWorkbook.length, 1);
assert.equal(parsedWorkbook[0].sheet, 'Đối chiếu công nợ');
assert.equal(parsedWorkbook[0].data[0][0], 'BÁO CÁO ĐỐI CHIẾU CÔNG NỢ KHÁCH HÀNG');
assert.equal(parsedWorkbook[0].data[7][3], 'PN001');
assert.equal(parsedWorkbook[0].data[8][8], 2_100_000);

console.log('Customer reconciliation export tests passed.');
