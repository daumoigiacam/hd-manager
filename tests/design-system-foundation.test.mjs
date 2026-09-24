import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const app = read('src/App.jsx');
const productView = app.slice(app.indexOf('function ProductManagementView('), app.indexOf('function CustomerCRMView('));
const main = read('src/main.jsx');
const shell = read('src/layout/AppShell.jsx');
const themeProvider = read('src/design-system/ThemeProvider.jsx');
const themePreferences = read('src/design-system/themePreferences.js');
const tokens = read('src/design-system/tokens.js');
const foundation = read('src/design-system/foundation.css');
const components = read('src/design-system/components.jsx');
const indexCss = read('src/index.css');

assert(!app.includes('fonts.googleapis.com'), 'UI must not depend on remote Google Fonts');
assert(!main.includes('@fontsource-variable/'), 'The app must use one platform-native system font instead of bundled font families');
assert(main.includes('./design-system/foundation.css'), 'Design System foundation must load globally');
assert(main.includes('<HDThemeProvider>'), 'The full app must be wrapped in the shared theme provider');
assert(shell.includes('useHDTheme()') && shell.includes('preferredTheme'), 'All shared app shells must use the current global theme');
assert(themeProvider.includes('prefers-color-scheme: dark') && themeProvider.includes('root.dataset.hdTheme = theme'), 'System preference must drive a document-wide theme attribute');
assert(themeProvider.includes("event.key === 'hd_manager_theme_preference'"), 'Theme selection must sync across open tabs');
assert(app.includes("{ id: 'light', label: 'Sáng'") && app.includes("{ id: 'dark', label: 'Tối'") && app.includes("{ id: 'system', label: 'Hệ thống'"), 'Users must be able to select Light, Dark, and System themes');
assert(themePreferences.includes("HD_THEME_STORAGE_KEY = 'hd_manager_theme_preference'"), 'Appearance preference must persist locally without changing business data');

assert(shell.includes('data-hd-shell'), 'AppShell must expose its shared shell boundary');
assert(shell.includes('data-hd-theme'), 'AppShell must expose the active theme');
assert((app.match(/<AppShell/g) || []).length >= 3, 'Staff, customer and authentication roots must use AppShell');
assert(app.includes('hd-shell--staff'), 'Staff shell must use semantic presentation');
assert(app.includes('hd-shell--customer'), 'Customer shell must use semantic presentation');
assert(app.includes('hd-shell--auth'), 'Authentication shell must use semantic presentation');

for (const token of ['colors', 'spacing', 'typography', 'radius', 'elevation', 'motion', 'breakpoints']) {
  assert(tokens.includes(token), `Missing Design System token group: ${token}`);
}

assert(tokens.includes("primary: Object.freeze({ 50: '#eff6ff'"), 'Primary brand palette must be HD Blue');
assert(tokens.includes("500: '#2563eb'"), 'Primary 500 must use the specified HD blue');
assert(tokens.includes("fontSans: 'system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, sans-serif'"), 'Typography must use platform-native fonts');
for (const token of ['kpiLarge', 'kpiMedium', 'kpiSmall', 'pageTitle', 'sectionTitle', 'cardTitle', 'bodyStrong', 'micro']) {
  assert(tokens.includes(`${token}: Object.freeze`), `Missing semantic typography token: ${token}`);
}
assert(tokens.includes("secondary: Object.freeze({ 50: '#ecfeff'"), 'Secondary brand palette must be HD Cyan');
assert(foundation.includes('--hd-control-height: 3rem'), 'Standard fields and controls must be 48px high');
assert(foundation.includes('--hd-type-body-strong: 14px'), 'Body strong text must share the standard 14px body scale');
assert(foundation.includes('--hd-font-weight-regular: 400') && foundation.includes('--hd-font-weight-bold: 700'), 'Foundation font weights must use the shared 400-700 scale');
assert(foundation.includes('.hd-enterprise-header.hd-app-header') && foundation.includes('background-color: var(--hd-primary) !important'), 'Business app headers must use the shared primary brand color');
assert(!foundation.includes('font-family: "Times New Roman"'), 'Business screens must not introduce a second display font');
assert(!foundation.includes('font-size: clamp('), 'Typography scale must not grow with viewport width');
assert(!/font-size\s*:\s*clamp\(/i.test(indexCss), 'App typography must use fixed sizes instead of viewport-scaled font sizes');
assert.match(indexCss, /html\s*\{[^}]*font-size:\s*16px/s, 'Root font size must remain fixed across viewport widths');
assert.match(indexCss, /\.mobile-app-shell\s*\{[^}]*font-size:\s*var\(--hd-type-body,\s*14px\)/s, 'Mobile shell must use the shared fixed body text size');
assert.match(indexCss, /input:not\(\[type="checkbox"\]\):not\(\[type="radio"\]\),\s*select,\s*textarea\s*\{\s*font-size:\s*var\(--hd-type-body,\s*14px\)/s, 'Form controls must use the shared 14px body size by default');
assert.match(indexCss, /data-hd-ios-input-zoom-guard="true"[\s\S]*?font-size:\s*max\(16px,\s*var\(--hd-type-body,\s*14px\)\)/, 'iOS form controls must retain a 16px minimum to prevent focus zoom');
assert.match(main, /const isIosInputZoomGuard = platform === 'ios' \|\| isIosWeb;[\s\S]*root\.dataset\.hdIosInputZoomGuard = isIosInputZoomGuard \? 'true' : 'false';/, 'Runtime must enable the input zoom guard only on iOS');
assert(foundation.includes('.hd-customer-create-view__header h3') && foundation.includes('font-size: var(--hd-type-h1)'), 'Customer create title must use the shared page title scale');
for (const token of ['--hd-type-kpi-lg: 24px', '--hd-type-kpi-md: 20px', '--hd-type-kpi-sm: 16px', '--hd-type-h1: 20px', '--hd-type-section-title: 16px', '--hd-type-card-title: 14px']) {
  assert(foundation.includes(token), `Missing CSS typography token: ${token}`);
}
assert(foundation.includes('--hd-gradient: linear-gradient(120deg'), 'Brand gradient must be defined in the shared foundation');
assert(foundation.includes('.hd-dashboard-kpi[data-tone="good"]') && foundation.includes('var(--hd-color-success-surface)'), 'Positive dashboard tone must keep semantic success colors');
assert(foundation.includes('.premium-data-module :where(table thead th)'), 'Operational tables must use the shared data-surface language');
assert.match(
  foundation,
  /\.hd-shell--staff \.premium-data-summary\s*\{[^}]*border-color:[^}]*border-radius:[^}]*box-shadow:[^}]*\}/s,
  'Staff shell must preserve each summary card background instead of forcing white over colored KPI cards',
);
assert.doesNotMatch(
  foundation.match(/\.hd-shell--staff \.premium-data-summary\s*\{[^}]*\}/s)?.[0] ?? '',
  /background\s*:/,
  'Shared summary card styling must not override module-specific backgrounds',
);
assert(foundation.includes('[class~="bg-emerald-600"]'), 'Legacy command buttons must be mapped to the shared brand treatment');
assert(foundation.includes('2026 quiet workspace refresh'), 'Staff shell must include the flat phone-first visual refresh');
assert(foundation.includes('.hd-product-editor__actions'), 'Product editor must keep its actions reachable in the shared visual system');
assert(app.includes('hd-product-editor__body'), 'Product creation must use the structured mobile editor layout');
assert(app.includes('premium-products-module'), 'Product lists must opt into the shared operational surface language');
assert(components.includes('icon = <Inbox size={24} aria-hidden="true" />'), 'Shared empty state must have a useful default icon');
assert(components.includes('role={status === \'error\' ? \'alert\' : status === \'loading\' ? \'status\' : undefined}'), 'Empty state must not force a live status role on its action button');
assert(components.includes('aria-live={status === \'loading\' ? \'polite\' : status === \'error\' ? \'assertive\' : undefined}'), 'Only loading/error states should announce status changes automatically');
assert(components.includes('<span className="hd-ds-state__visual" aria-hidden="true">{icon}</span>'), 'Status state must render decorative icons without duplicating them to assistive technology');
assert(foundation.includes('.hd-ds-state__visual > svg'), 'Shared state visuals must size their icon consistently');
assert.match(app, /function ReportEmptyState[\s\S]*?<HDEmptyState/, 'Report empty views must use the shared empty-state component');
assert.match(app, /function CustomerEmptyState\(\{ text \}\)[\s\S]*?<HDEmptyState description=\{text\}/, 'Customer portal empty views must use the shared empty-state component');
assert.match(app, /title=\{hasOrderListFilters \? 'Không tìm thấy đơn phù hợp' : 'Chưa có đơn hàng'\}[\s\S]*?canCreateAnyOrder[\s\S]*?Tạo đơn hàng/, 'Order empty view must provide a permission-aware action or filter reset');
assert.match(productView, /title=\{hasProductFilters[\s\S]*?Không tìm thấy sản phẩm phù hợp[\s\S]*?Chưa có sản phẩm còn tồn kho[\s\S]*?Thêm sản phẩm/, 'Product list and inventory must distinguish empty/filter states and offer contextual recovery actions');
assert(indexCss.includes('--hd-breakpoint-desktop: 1024px'), 'Desktop shell must start at the specified 1024px breakpoint');
assert(indexCss.includes('@media (min-width: 1024px)'), 'Desktop navigation and content must activate at 1024px');
assert(indexCss.includes('@media (min-width: 600px) and (max-width: 1023px)'), 'Tablet rail and capped layout must stop before desktop width');
assert(!indexCss.includes('max-width: 1099px'), 'Legacy 1100px breakpoint must not leave 1024px layouts in tablet mode');

for (const selector of [
  '[data-hd-theme="dark"]',
  '[data-hd-theme="dark"] :is(.bg-white',
  '[data-hd-theme="dark"] :is(.bg-gray-50',
  '[data-hd-theme="dark"] :is(.text-gray-500',
  '--hd-color-success-surface: #052e1b',
  '--hd-color-warning-surface: #422006',
  '--hd-color-danger-surface: #450a0a',
  '@media (prefers-reduced-motion: reduce)',
  'env(safe-area-inset-top',
  '--hd-space-4',
  '--hd-shadow-md',
  '--hd-type-title',
  '--hd-color-success-surface',
  '--hd-radius-control',
  '--hd-elevation-floating',
  '--hd-glass-blur',
  '--hd-primary:',
  '--hd-primary-hover:',
  '--hd-primary-active:',
  '--hd-secondary:',
  '--hd-cyan:',
  '--hd-gradient:',
  '--hd-surface:',
  '--hd-background:',
  '--hd-text:',
  '--hd-text-secondary:',
  '--hd-border:',
  '.hd-ds-card',
  '.hd-ds-button',
  '.hd-ds-field',
  '.hd-ds-page-header',
  '.hd-ds-searchbar',
  '.hd-ds-filterbar',
  '.hd-ds-fab',
  '.hd-ds-stepper',
  '.hd-ds-accordion',
  '.hd-ds-dialog',
  '.hd-ds-state',
]) {
  assert(foundation.includes(selector), `Missing foundation rule: ${selector}`);
}

for (const component of ['HDCard', 'HDButton', 'HDPageHeader', 'HDSearchBar', 'HDFilterBar', 'HDFilterChip', 'HDFAB', 'HDStepper', 'HDAccordion', 'HDWidgetCustomizer', 'HDField', 'HDDialog', 'HDStatusState']) {
  assert(components.includes(`function ${component}`), `Missing shared primitive: ${component}`);
}

for (const component of [
  'HDIconButton',
  'HDInput',
  'HDNumberInput',
  'HDCurrencyInput',
  'HDDateInput',
  'HDPasswordInput',
  'HDSearchInput',
  'HDSelect',
  'HDBadge',
  'HDTable',
  'HDToast',
  'HDSkeleton',
  'HDProgress',
  'HDKpiCard',
  'HDSummaryCard',
  'HDStatisticCard',
  'HDCustomerCard',
  'HDProductCard',
]) {
  assert(components.includes(component), `Missing Phase 2.4 component: ${component}`);
}

for (const selector of [
  '.hd-ds-badge',
  '.hd-ds-table',
  '.hd-ds-toast',
  '.hd-ds-skeleton',
  '.hd-ds-progress',
  '.hd-ds-button__spinner',
]) {
  assert(foundation.includes(selector), `Missing Phase 2.4 foundation rule: ${selector}`);
}

for (const selector of [
  '.premium-data-toolbar',
  '.premium-data-list > *',
  '.premium-status-badge',
  '.hd-dashboard-kpi',
  'prefers-reduced-motion',
]) {
  assert(foundation.includes(selector), `Missing Phase 2.5 visual polish rule: ${selector}`);
}

assert.match(
  app,
  /hd-header-search-field flex h-11/,
  'Compact header search must use a single 44px surface',
);
for (const selector of [
  '.hd-header-search-field',
  '.hd-header-search-field:focus-within',
  '.hd-header-search-input:focus-visible',
  '.hd-header-search-input::-webkit-search-cancel-button',
]) {
  assert(indexCss.includes(selector), `Missing compact header search rule: ${selector}`);
}

assert(app.includes('const PayrollCompactMetric = React.memo'), 'Payroll summary metrics must use one shared compact component');
assert.match(
  app,
  /data-payroll-compact-metrics="true" className="mt-3 grid grid-cols-3/,
  'Employee payroll summaries must use a compact three-column grid on mobile',
);
assert.match(
  app,
  /data-payroll-compact-metric="true"[\s\S]{0,180}flex h-16/,
  'Payroll summary metric cards must have one equal compact height',
);
assert.match(
  app,
  /data-payroll-compact-action="true"[\s\S]{0,180}flex h-16/,
  'Payroll advance action must share the compact metric height instead of adding another row',
);

console.log('PASS Design System foundation: AppShell, tokens, themes, shared primitives and Phase 2.5 visual polish.');
