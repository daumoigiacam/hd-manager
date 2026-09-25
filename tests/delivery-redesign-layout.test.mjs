import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  filterDeliveryWorkspaceGroups,
  formatDeliveryCompactMoney,
  formatDeliveryTime,
  getDeliveryActivityByHour,
} from '../src/features/delivery/deliveryWorkspaceModel.js';

const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const workspace = readFileSync(new URL('../src/features/delivery/DeliveryRedesignWorkspace.jsx', import.meta.url), 'utf8');
const model = readFileSync(new URL('../src/features/delivery/deliveryWorkspaceModel.js', import.meta.url), 'utf8');

assert.match(workspace, /import \{ HDButton, HDEmptyState, HDIconButton \} from '\.\.\/\.\.\/design-system\/index\.js'/, 'Delivery actions and empty states must use the shared design-system controls.');
assert.match(workspace, /title="Chưa có chuyến giao"[\s\S]*?description="Chuyến giao sẽ hiện tại đây\."/, 'The delivery overview must present a concise shared empty state when there are no recent groups.');
assert.match(workspace, /title=\{normalizedGroups\.length > 0 \? 'Không có chuyến phù hợp' : 'Chưa có chuyến giao'\}[\s\S]*?resetListFilters[\s\S]*?Xóa bộ lọc/, 'An empty filtered delivery list must provide a working filter reset.');
assert.match(workspace, /import \{ useHDTheme \} from '\.\.\/\.\.\/design-system\/ThemeProvider\.jsx'/, 'Delivery appearance must follow the app theme provider.');
assert.match(workspace, /data-hd-module="delivery" data-hd-screen=\{screen\} data-hd-theme=\{theme\}/, 'Delivery must expose its active screen and app theme to visual checks.');
assert.match(workspace, /setPreference\(isDark \? 'light' : 'dark'\)/, 'The delivery theme toggle must update the app-wide theme preference.');

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
assert.match(app, /activeTab === 'delivery_reports'[\s\S]*\['home', 'delivery_reports', 'customers', 'orders', 'more'\]/, 'The delivery workspace must keep a five-item contextual navigation without the retired report module.');
assert.match(app, /const showFloatingQuickActionButton = canShowFloatingQuickActionButton\s*&& quickActionItems\.length > 0\s*&& !\['delivery_reports', 'customers', 'products', 'finance', 'orders', 'employees', 'messages', 'asset_management', 'more'\]\.includes\(activeTab\)/, 'The global quick action must not duplicate module actions or obscure the module menu.');
assert.match(app, /activeTab === 'delivery_reports' \? 'Giao hàng'/, 'The delivery header must use the approved title.');
assert.match(app, /delivery_reports: \{ id: 'delivery_reports', label: 'Giao hàng'/, 'The mobile navigation must use the delivery label.');
assert.match(workspace, /setTimeout\(\(\) => setSearchTerm\(searchValue\.trim\(\)\), 275\)/, 'Customer search must debounce input before filtering.');
assert.match(workspace, /data-hd-screen=\{screen\}/, 'Delivery screen state must be exposed for view-level visual testing.');
assert.match(workspace, /Lịch sử giao hàng/, 'The completed delivery history must be reachable from the list.');
assert.match(workspace, /maps\.google\.com\/maps\?q=/, 'Directions must use a real saved destination, not a fabricated map route.');
assert.doesNotMatch(workspace, /Thân thiết|>VIP<|Không có ghi chú|Chưa rõ|Mở Google Maps để điều hướng/, 'Customer detail and map must not render invented values or decorative map copy.');

const timestamp = (hour, day = 25) => new Date(2026, 8, day, hour, 15).getTime();
const deliveryFixtures = [
  {
    key: 'done-today', customerName: 'Mỹ Tâm Đồng Xoài', phone: '0900000001', area: 'Bình Dương',
    collectedMethod: 'Chuyển khoản', latestTimestamp: timestamp(10), pendingCount: 0, reportCount: 2,
  },
  {
    key: 'pending-today', customerName: 'Tạp hóa An Phú', area: 'Đồng Xoài',
    collectedMethod: '', latestTimestamp: timestamp(8), pendingCount: 1, reportCount: 0,
  },
  {
    key: 'done-older', customerName: 'Cửa hàng cũ', area: 'Bình Dương',
    collectedMethod: 'Tiền mặt', latestTimestamp: timestamp(12, 20), pendingCount: 0, reportCount: 1,
  },
];
assert.deepEqual(filterDeliveryWorkspaceGroups(deliveryFixtures, { keyword: 'my tam dong xoai', tab: 'all' }).map(({ key }) => key), ['done-today'], 'Search should match Vietnamese names without accents.');
assert.deepEqual(filterDeliveryWorkspaceGroups(deliveryFixtures, { area: 'binh duong', tab: 'all' }).map(({ key }) => key), ['done-today', 'done-older'], 'Area filters should match accented Vietnamese text.');
assert.deepEqual(filterDeliveryWorkspaceGroups(deliveryFixtures, { paymentMethod: 'Chuyển khoản', tab: 'all' }).map(({ key }) => key), ['done-today'], 'Payment filter should only return records with a recorded method.');
assert.deepEqual(filterDeliveryWorkspaceGroups(deliveryFixtures, { period: 'today', referenceDate: '2026-09-25', tab: 'all' }).map(({ key }) => key), ['done-today', 'pending-today'], 'Today filter should exclude records from prior dates.');
assert.deepEqual(filterDeliveryWorkspaceGroups(deliveryFixtures, { period: 'range', fromDate: '2026-09-25', toDate: '2026-09-25', referenceDate: '2026-09-25', tab: 'all' }).map(({ key }) => key), ['done-today', 'pending-today'], 'Inclusive date ranges should include both boundaries.');
assert.equal(getDeliveryActivityByHour(deliveryFixtures, '2026-09-25').find(({ label }) => label === '9h')?.count, 2, 'Hourly chart should derive values from actual timestamps and delivered dispatch counts.');
assert.equal(getDeliveryActivityByHour(deliveryFixtures, '2026-09-25').find(({ label }) => label === '12h')?.count, 0, 'Hourly chart should not inject sample values into empty buckets.');
assert.equal(formatDeliveryTime(0), '', 'Missing timestamps should not render a placeholder time.');
assert.equal(formatDeliveryCompactMoney(3_660_000), '3,7 Tr', 'The report revenue KPI should stay compact enough for narrow screens.');
assert.equal(formatDeliveryCompactMoney(1_200_000_000), '1,2 Tỷ', 'Large report revenue should use compact Vietnamese units.');

console.log('PASS Delivery workspace: real data mapping, normalized search, complete filters, date ranges, activity chart, history, map handoff, confirmation, payments, and success state.');
