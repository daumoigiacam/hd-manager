import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const workspace = readFileSync(new URL('../src/features/assets/AssetManagementWorkspace.jsx', import.meta.url), 'utf8');
const model = readFileSync(new URL('../src/features/assets/assetManagementModel.js', import.meta.url), 'utf8');

assert.match(workspace, /import \{ HDButton, HDEmptyState \} from '\.\.\/\.\.\/design-system\/index\.js'/, 'Asset list empty states and reset actions must use shared design-system components.');
assert.match(workspace, /title=\{assets\.length > 0 \? 'Không tìm thấy tài sản phù hợp' : 'Chưa có tài sản'\}[\s\S]*?resetAssetFilters[\s\S]*?Xóa bộ lọc/, 'An asset filter result with no matches must distinguish it from a first-run empty list and offer a reset.');

for (const contract of [
  'data-asset-list-screen="true"',
  'data-asset-detail-screen="true"',
  'Tìm kiếm tài sản, biển số, mã, người phụ trách...',
  'useDeferredValue',
  'Tổng tài sản',
  'Cần chú ý',
  'Đang hoạt động',
  'Tổng quan',
  'Chi phí',
  'Bảo trì',
  'Giấy tờ',
  'Lịch sử',
  'Lịch bảo trì',
  'Lịch sử bảo trì',
  'Thêm giấy tờ',
  'Xem thêm'
]) {
  assert(workspace.includes(contract), `Asset workspace is missing required contract: ${contract}`);
}

for (const contract of [
  'ASSET_FILTERS',
  'EXTRA_ASSET_FILTERS',
  'assetMatchesSearch',
  'getAssetDocumentRows',
  'getAssetMaintenanceRows',
  'createAssetTimelineRows',
  'assetCostLogs',
  'maintenanceSchedule',
  'assetDocuments',
  'inspectionExpiry',
  'registrationNumber'
]) {
  assert(model.includes(contract), `Asset data model is missing required contract: ${contract}`);
}

assert.match(model, /if \(vehicleSignal\) return 'truck';/, 'Legacy vehicle records must keep a useful type without data migration.');
assert.match(app, /<AssetManagementWorkspace[\s\S]*assets=\{assets\}[\s\S]*assetCostLogs=\{assetCostLogs\}/, 'Workspace must use existing live asset and cost-log data.');
assert.match(app, /activeTab === 'asset_management' \? 'Tài sản'/, 'The asset header must use the approved title.');
assert.match(app, /activeTab === 'asset_management' \? 'from-blue-600 to-sky-500'/, 'The asset header must retain the HD blue treatment.');

console.log('PASS Asset management redesign: list, live data adapters, detail tabs, maintenance, documents and history are wired.');
