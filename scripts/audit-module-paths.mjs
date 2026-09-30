import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { parse } from '@babel/parser';

const source = await readFile('src/App.jsx', 'utf8');
const tree = parse(source, { sourceType: 'module', plugins: ['jsx'] });
const named = new Map();
function walk(node, visit) {
  if (!node || typeof node !== 'object') return;
  visit(node);
  for (const [key, value] of Object.entries(node)) {
    if (['loc', 'start', 'end', 'extra', 'comments'].includes(key)) continue;
    if (Array.isArray(value)) value.forEach(child => walk(child, visit));
    else if (value?.type) walk(value, visit);
  }
}
walk(tree, node => {
  const name = node.type === 'FunctionDeclaration' ? node.id?.name
    : node.type === 'VariableDeclarator' ? node.id?.name : null;
  if (name && !named.has(name)) named.set(name, node.init || node);
});

const catalog = [
  ['home', 'ExecutiveDashboardView', 'handleLoadPayrollPeriodSnapshots'],
  ['order_requests', 'OrderRequestView', 'handleAddOrderRequest', 'handleEditOrderRequest'],
  ['orders', 'OrderManagementView', 'handleAddOrder', 'handleEditOrder'],
  ['warehouse_dispatch', 'WarehouseDispatchView', 'handleAddWarehouseDispatch', 'handleEditWarehouseDispatch'],
  ['delivery_reports', 'DeliveryReportView', 'handleAddDeliveryReport', 'handleUpdateDeliveryReport'],
  ['warehouse_import', 'WarehouseImportView', 'handleAddWarehouseImport', 'handleEditWarehouseImport', 'handleAddWarehouseStockCount'],
  ['customers', 'CustomerCRMView', 'handleAddCustomer', 'handleEditCustomer'],
  ['debt', 'DebtManagementView', 'handleAddPayment', 'handleDeletePayment'],
  ['finance', 'FinanceView', 'handleAddExpense', 'handleEditExpense', 'handleAddPayment', 'handleEditPayment'],
  ['bank_payments', 'BankPaymentCenterView'],
  ['messages', 'MessageCenterView', 'handleAddMessage'],
  ['pricing', 'SimplePricingEngineView', 'handleAddPricingInput', 'handleSavePricingRules'],
  ['company_attendance', 'AttendanceView', 'handleEditAttendance'],
  ['employee_reviews', 'EmployeeReviewModuleView', 'handleAddEmployeeReview'],
  ['asset_management', 'AssetManagementView', 'handleAddAsset', 'handleAddAssetCostLog'],
  ['payroll', 'SalaryView', 'handleLockPayrollPeriod', 'handleAdjustLockedPayroll'],
  ['employees', 'EmployeeView', 'handleAddEmployee', 'handleEditEmployee'],
  ['products', 'ProductManagementView', 'handleAddProduct', 'handleEditProduct'],
  ['price_quotes', 'PriceQuoteBroadcastView'],
  ['settings', 'SettingsView', 'handleUpdateCompanySettings'],
  ['role_permissions', 'RolePermissionView', 'handleUpdateCompanySettings'],
  ['billing', 'BillingView'],
];
const navigation = named.get('APP_NAV_ITEM_MAP').properties.map(item => item.key.name || item.key.value);
assert.deepEqual(new Set(catalog.map(([key]) => key)), new Set(navigation.filter(key => !['executive_dashboard', 'more'].includes(key))));
assert.equal(catalog.length, 22);
const foregroundDeclaration = named.get('FOREGROUND_REALTIME_COLLECTIONS_BY_TAB');
const foreground = foregroundDeclaration.type === 'CallExpression' ? foregroundDeclaration.arguments[0] : foregroundDeclaration;
const callName = node => node?.name || (node?.property ? `${callName(node.object)}.${callName(node.property)}` : 'expression');
function inspect(name) {
  const node = named.get(name);
  assert.ok(node, `Missing source path ${name}`);
  const awaits = [];
  const children = [];
  walk(node, child => {
    if (child.type === 'AwaitExpression') awaits.push({ line: child.loc.start.line, expression: source.slice(child.argument.start, child.argument.end).split('\n')[0].slice(0, 160) });
    if (child.type === 'JSXOpeningElement' && /^[A-Z]/.test(child.name?.name || '')) children.push(child.name.name);
  });
  const calls = new Map();
  walk(node, child => {
    if (child.type !== 'CallExpression') return;
    const name = callName(child.callee);
    if (/useMemo|useEffect|fetch|setDoc|updateDoc|runTransaction|saveDataDocument|saveAtomicDocuments|onAdd|onEdit|onSave|share|Share|reload|setInterval/.test(name)) calls.set(name, (calls.get(name) || 0) + 1);
  });
  return { name, line: node.loc.start.line, lines: node.loc.end.line - node.loc.start.line + 1, awaits, calls: Object.fromEntries(calls), childComponents: [...new Set(children)] };
}
const modules = catalog.map(([key, component, ...handlers]) => ({
  key, aliases: key === 'home' ? ['executive_dashboard'] : [],
  foregroundCollections: foreground.properties.find(item => (item.key.name || item.key.value) === key)?.value.elements?.map(item => item.value) || [],
  component: inspect(component), handlers: handlers.map(inspect),
  browserAcceptance: 'Not assessed by static inventory; see interaction audit results',
}));
const report = { scope: 'Static source inventory, NOT runtime timing or full behavioral acceptance. Shared home/detail routes counted once; More is navigation, not a business module.', modules };
await mkdir('test-results', { recursive: true });
await writeFile('test-results/module-source-inventory.json', JSON.stringify(report, null, 2));
console.log(modules.map(module => `${module.key}: ${module.component.name}:${module.component.line}, ${module.component.awaits.length} await sites, ${module.foregroundCollections.length} foreground sources; handlers: ${module.handlers.map(handler => handler.name).join(', ') || 'in component'}`).join('\n'));
