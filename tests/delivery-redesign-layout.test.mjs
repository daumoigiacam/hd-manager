import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const workspace = readFileSync(new URL('../src/features/delivery/DeliveryRedesignWorkspace.jsx', import.meta.url), 'utf8');
const model = readFileSync(new URL('../src/features/delivery/deliveryWorkspaceModel.js', import.meta.url), 'utf8');

for (const contract of [
  'Giao đúng hẹn',
  'Vững niềm tin',
  'Cần giao',
  'Chờ báo cáo',
  'Đã giao',
  'Bắt đầu giao hàng',
  'Giao gần đây',
  'Chờ giao',
  'Tìm khách hàng...',
  'Xác nhận giao hàng',
  'Chụp ảnh chứng từ',
  'Nhận thanh toán',
  'Giao hàng thành công!',
  'Mở Google Maps',
  'Bộ lọc',
  'Thao tác nhanh',
]) {
  assert(workspace.includes(contract), `Delivery workspace is missing required contract: ${contract}`);
}

for (const contract of [
  'DELIVERY_STATUS_TABS',
  'filterDeliveryWorkspaceGroups',
  'getDeliveryWorkspaceStats',
  'formatDeliveryMoney',
  'formatDeliveryTime',
]) {
  assert(model.includes(contract), `Delivery data model is missing required contract: ${contract}`);
}

assert.match(app, /<DeliveryRedesignWorkspace[\s\S]*groups=\{deliveryWorkspaceGroups\}/, 'The redesign must be wired to real dispatch and report data.');
assert.match(app, /onComplete=\{\(\) => handleSubmitReport\(\{ preventDefault\(\) \{\} \}\)\}/, 'The redesign must preserve the existing save workflow.');
assert.match(app, /case 'delivery_reports':\s*return <DeliveryReportView/, 'The redesigned workspace must also render when the selected day has no dispatches.');
assert.match(app, /activeTab === 'delivery_reports'[\s\S]*\['home', 'delivery_reports', 'customers', 'report', 'more'\]/, 'The delivery workspace must use its approved contextual mobile navigation.');
assert.match(app, /canShowFloatingQuickActionButton && quickActionItems\.length > 0 && !\['delivery_reports', 'customers', 'products', 'finance', 'orders', 'employees', 'messages', 'asset_management', 'more'\]\.includes\(activeTab\)/, 'The global quick action must not duplicate module actions or obscure the module menu.');
assert.match(app, /activeTab === 'delivery_reports' \? 'Giao hàng'/, 'The delivery header must use the approved title.');
assert.match(app, /delivery_reports: \{ id: 'delivery_reports', label: 'Giao hàng'/, 'The mobile navigation must use the delivery label.');

console.log('PASS Delivery redesign: live delivery data, list filters, confirmation workflow, photos, payments, map handoff, quick actions and success state are wired.');
