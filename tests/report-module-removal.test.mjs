import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const visualQa = readFileSync(new URL('./visual/hd-manager-visual-qa.mjs', import.meta.url), 'utf8');

const between = (start, end) => {
  const from = app.indexOf(start);
  const to = app.indexOf(end, from + start.length);
  assert(from >= 0 && to > from, `Missing source boundary: ${start}`);
  return app.slice(from, to);
};

assert.doesNotMatch(between('const ROLE_PERMISSION_MODULES = [', 'const buildPermissionSet'), /id: 'report'/);
assert.doesNotMatch(between('const APP_NAV_ITEM_MAP = {', 'const NOTIFICATION_CONTEXT_ALIASES'), /\breport:\s*\{/);
assert.doesNotMatch(between('function MoreMenu(', 'function DashboardView('), /id: 'report'/);
assert.doesNotMatch(app, /function ReportView\(|case 'report':|tabPermissions\.report|setActiveTab\('report'\)/);
assert.match(app, /const normalizeAppTab = \(tab\) => tab === 'report' \? 'home'/);
assert.match(app, /useState\(normalizeAppTab\(persistedSession\.activeTab\)\)/);
assert.match(app, /nextTab === 'report'/);
assert.match(app, /\['home', 'delivery_reports', 'customers', 'orders', 'more'\]/);
assert.match(app, /case 'delivery_reports':\s*return <DeliveryReportView/);
assert.doesNotMatch(visualQa, /\['Báo cáo', 'report', 'ReportView'\]|report: \{ label: 'Báo cáo' \}|report: 'Báo cáo'/);

console.log('PASS: General report module removed from permissions, navigation, UI, and visual QA; delivery reports remain.');
