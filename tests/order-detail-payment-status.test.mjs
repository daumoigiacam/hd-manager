import assert from 'node:assert/strict';
import { readApplicationSource } from '../scripts/helpers/application-source.cjs';

const appSource = readApplicationSource();
const detailStart = appSource.indexOf('{selectedOrder && (() => {');
const detailEnd = appSource.indexOf('{zaloPreviewOrder &&', detailStart);
assert.ok(detailStart >= 0 && detailEnd > detailStart, 'sales invoice detail section should be present');

const invoiceDetail = appSource.slice(detailStart, detailEnd);
assert.doesNotMatch(invoiceDetail, /getOrderReviewMeta\(selectedOrder\)|reviewMeta\.label/, 'review status is hidden from invoice detail');
assert.doesNotMatch(invoiceDetail, /approveOrderZaloSend\(selectedOrder\)|selectedOrderZaloActionLabel/, 'Zalo approval action is hidden from invoice detail');
assert.doesNotMatch(invoiceDetail, /Khách này chưa có link nhóm Zalo|Bấm để cập nhật link nhóm trong hồ sơ khách/, 'missing customer Zalo link warning is hidden');

const paymentRowStart = invoiceDetail.indexOf('aria-label="Trạng thái thanh toán"');
const paymentRowEnd = invoiceDetail.indexOf('</div>', paymentRowStart);
assert.ok(paymentRowStart >= 0 && paymentRowEnd > paymentRowStart, 'payment status row should be present');
const paymentRow = invoiceDetail.slice(paymentRowStart, paymentRowEnd);
assert.match(paymentRow, /Hết nợ/);
assert.match(paymentRow, /ĐÃ THANH TOÁN/);

console.log('Sales invoice detail payment status layout tests: PASS');
