import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';

const baseUrl = process.env.HD_MANAGER_VISUAL_QA_URL || 'http://127.0.0.1:5174/';
const outputDir = process.env.HD_MANAGER_VISUAL_QA_OUTPUT || 'test-results/visual-qa';
const browserPath = process.env.HD_MANAGER_VISUAL_QA_BROWSER_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const viewports = [
  ['mobile-narrow', 360, 800],
  ['mobile-standard', 390, 844],
  ['mobile-wide', 412, 915],
  ['tablet', 768, 1024],
  ['desktop', 1366, 768],
  ['desktop-wide', 1440, 900],
];
const sectionDefinitions = [
  ['Trang chủ', 'home', 'DashboardView / EmployeePersonalHomeView'],
  ['Điều hành', 'executive_dashboard', 'ExecutiveDashboardView'],
  ['Tin nhắn', 'messages', 'MessageCenterView'],
  ['Đơn đặt', 'order_requests', 'OrderRequestView'],
  ['Đơn hàng', 'orders', 'OrderManagementView'],
  ['Khách hàng', 'customers', 'CustomerCRMView'],
  ['Giá cả', 'pricing', 'PricingEngineView / SimplePricingEngineView'],
  ['Báo giá', 'price_quotes', 'PriceQuoteBroadcastView'],
  ['Xuất kho', 'warehouse_dispatch', 'WarehouseDispatchView'],
  ['Nhập Xuất Tồn', 'warehouse_import', 'WarehouseImportView'],
  ['Báo cáo giao hàng', 'delivery_reports', 'DeliveryReportView'],
  ['Bản đồ', 'maps', 'MapManagementView'],
  ['Sổ nợ', 'debt', 'DebtManagementView'],
  ['Thu chi', 'finance', 'FinanceView'],
  ['Ngân hàng', 'bank_payments', 'BankPaymentCenterView'],
  ['Chấm công', 'company_attendance', 'AttendanceView'],
  ['Bảng lương', 'payroll', 'SalaryView'],
  ['Nhân sự', 'employees', 'EmployeeView'],
  ['Đánh giá', 'employee_reviews', 'EmployeeReviewModuleView'],
  ['Tài sản', 'asset_management', 'AssetManagementView'],
  ['Sản phẩm', 'products', 'ProductManagementView'],
  ['Báo cáo', 'report', 'ReportView'],
  ['Cài đặt', 'settings', 'SettingsView'],
  ['Vai trò', 'role_permissions', 'RolePermissionView'],
  ['Gói dịch vụ', 'billing', 'BillingView'],
  ['Thêm', 'more', 'MoreMenu'],
  ['Customer portal', 'portal shell', 'CustomerPortalView'],
  ['Authentication', 'auth shell', 'LoginRegisterView'],
];
const routeDefinitions = sectionDefinitions
  .filter(([section]) => !['Authentication', 'Customer portal'].includes(section))
  .map(([section, route, screen]) => ({ section, route, screen, label: section }));
const PREVIEW_AUTH_TOKEN_PREFIX = 'hd-preview-auth-v1:';
const previewAuthClaims = {
  uid: 'emp_admin',
  identityId: 'emp_admin',
  appUserId: 'emp_admin',
  companyId: 'comp_preview',
  companyName: 'Công ty HD Preview',
  accountType: 'employee',
  role: 'super_admin',
  name: 'Quản trị Demo',
  phone: '0909000001',
};
const previewAuthToken = `${PREVIEW_AUTH_TOKEN_PREFIX}${encodeURIComponent(JSON.stringify(previewAuthClaims))}`;
const previewQaStore = {
  customers: {
    c_preview_01: {
      id: 'c_preview_01',
      companyId: 'comp_preview',
      empId: 'emp_sales_01',
      name: 'Cửa hàng Lan Anh',
      phone: '0911222333',
      address: 'Quận 1, TP.HCM',
      assignedEmployeeId: 'emp_sales_01',
      responsibleEmployeeId: 'emp_sales_01',
      managerName: 'Ngọc Anh',
      managerPhone: '0909000002',
      isArchived: false,
    },
    c_preview_02: {
      id: 'c_preview_02',
      companyId: 'comp_preview',
      empId: 'emp_driver_01',
      assignedEmployeeId: 'emp_driver_01',
      responsibleEmployeeId: 'emp_driver_01',
      name: 'Tạp hóa Hưng Phát',
      phone: '0988666555',
      address: 'Thủ Đức, TP.HCM',
      isArchived: false,
    },
  },
  messages: {
    qa_customer_a_1: {
      id: 'qa_customer_a_1',
      companyId: 'comp_preview',
      customerId: 'c_preview_01',
      conversationId: 'customer_c_preview_01',
      conversationType: 'customer_support',
      assignedEmployeeId: 'emp_sales_01',
      assignmentState: 'assigned',
      senderType: 'customer',
      senderName: 'Cửa hàng Lan Anh',
      text: 'Tin QA từ khách hàng A',
      createdAt: '2026-08-20T08:00:00.000Z',
      isRead: false,
      isArchived: false,
    },
    qa_customer_b_1: {
      id: 'qa_customer_b_1',
      companyId: 'comp_preview',
      customerId: 'c_preview_02',
      conversationId: 'customer_c_preview_02',
      conversationType: 'customer_support',
      assignedEmployeeId: 'emp_driver_01',
      assignmentState: 'assigned',
      senderType: 'customer',
      senderName: 'Tạp hóa Hưng Phát',
      text: 'Tin QA từ khách hàng B',
      createdAt: '2026-08-20T08:01:00.000Z',
      isRead: false,
      isArchived: false,
    },
  },
  notifications: {
    qa_customer_a_notice: {
      id: 'qa_customer_a_notice',
      companyId: 'comp_preview',
      recipientType: 'employee',
      recipientEmpId: 'emp_sales_01',
      title: 'Tin nhắn khách hàng',
      message: 'Khách hàng A vừa gửi tin QA.',
      tab: 'messages',
      createdAt: '2026-08-20T08:00:00.000Z',
      isRead: false,
      isArchived: false,
    },
  },
};

const shortText = (value) => `${value || ''}`.replace(/\s+/g, ' ').trim().slice(0, 500);
const escapeRegExp = (value) => `${value}`.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const attachDiagnostics = (page) => {
  const diagnostics = { consoleErrors: [], pageErrors: [], failedRequests: [] };
  page.on('console', (message) => {
    if (message.type() === 'error') diagnostics.consoleErrors.push(shortText(message.text()));
  });
  page.on('pageerror', (error) => diagnostics.pageErrors.push(shortText(error?.message || error)));
  page.on('requestfailed', (request) => {
    diagnostics.failedRequests.push({ url: shortText(request.url()), error: shortText(request.failure()?.errorText) });
  });
  return diagnostics;
};

const installPreviewSession = async (page, token = previewAuthToken, store = previewQaStore) => {
  await page.addInitScript(({ authToken, initialStore }) => {
    window.__initial_auth_token = authToken;
    window.localStorage.setItem('hd-manager-local-db-v2-clean-preview', JSON.stringify(initialStore));
  }, { authToken: token, initialStore: store });
};

const openPreviewSession = async (page, token = previewAuthToken, store = previewQaStore) => {
  await installPreviewSession(page, token, store);
  const response = await page.goto(baseUrl, { waitUntil: 'commit', timeout: 20000 });
  await page.waitForSelector('[data-hd-shell="enterprise"]', { timeout: 20000 });
  await page.waitForTimeout(2200);
  return response;
};

const clickVisibleButton = async (page, label, { first = false } = {}) => {
  const buttons = page.getByRole('button', { name: label, exact: true });
  const indexes = first
    ? [...Array(await buttons.count()).keys()]
    : [...Array(await buttons.count()).keys()].reverse();
  for (const index of indexes) {
    const button = buttons.nth(index);
    if (await button.isVisible()) {
      await button.click();
      return true;
    }
  }
  return false;
};

const inspectLayout = async (page, route = '') => page.evaluate((currentRoute) => {
  const root = document.documentElement;
  const visible = (node) => Boolean(node && node.getBoundingClientRect().width > 0 && node.getBoundingClientRect().height > 0);
  const shell = document.querySelector('[data-hd-shell="enterprise"]');
  const header = document.querySelector('[data-hd-region="header"]');
  const sidebar = document.querySelector('[data-hd-navigation="sidebar"]');
  const bottomNavigation = document.querySelector('[data-hd-navigation="bottom"]');
  const modal = [...document.querySelectorAll('[role="dialog"], .fixed.inset-0')].some(visible);
  return {
    route: currentRoute,
    scrollWidth: root.scrollWidth,
    clientWidth: root.clientWidth,
    scrollHeight: root.scrollHeight,
    clientHeight: root.clientHeight,
    shellVisible: visible(shell),
    headerVisible: visible(header),
    sidebarVisible: visible(sidebar),
    bottomNavigationVisible: visible(bottomNavigation),
    modalVisible: modal,
    title: document.title,
    textPreview: (document.body?.innerText || '').slice(0, 320),
    visibleInputs: [...document.querySelectorAll('input, textarea, select')]
      .filter((node) => visible(node)).length,
  };
}, route);

await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ executablePath: browserPath, headless: true });
const allResults = [];
const interactionResults = [];
const messagingResults = [];
const messagingChecks = [];

const routeNavigation = {
  home: { label: 'Trang chủ' },
  executive_dashboard: { label: 'Điều hành' },
  messages: { label: 'Tin nhắn' },
  order_requests: { label: 'Đơn đặt' },
  orders: { label: 'Đơn hàng' },
  customers: { label: 'Khách hàng' },
  pricing: { label: 'Giá cả' },
  price_quotes: { label: 'Báo giá' },
  warehouse_dispatch: { label: 'Xuất kho' },
  warehouse_import: { label: 'Nhập Xuất Tồn' },
  delivery_reports: { label: 'Báo cáo', occurrence: 0 },
  maps: { label: 'Bản đồ' },
  debt: { label: 'Sổ nợ' },
  finance: { label: 'Thu chi' },
  bank_payments: { label: 'Ngân hàng' },
  company_attendance: { label: 'Chấm công' },
  payroll: { label: 'Bảng lương' },
  employees: { label: 'Nhân sự' },
  employee_reviews: { label: 'Đánh giá' },
  asset_management: { label: 'Tài sản' },
  products: { label: 'Sản phẩm' },
  report: { label: 'Báo cáo', occurrence: 1 },
  settings: { label: 'Cài đặt' },
  role_permissions: { label: 'Vai trò' },
  billing: { label: 'Gói dịch vụ' },
  more: { label: 'Thêm' },
};

const waitForApplication = async (page) => {
  await page.waitForSelector('[data-hd-shell="enterprise"]', { timeout: 20000 });
  await page.waitForTimeout(550);
};

const navigateRoute = async (page, route) => {
  const target = routeNavigation[route];
  if (!target) throw new Error(`No visual QA navigation mapping for ${route}`);
  const shellSearchPopover = page.locator('.hd-shell-search-popover');
  if (await shellSearchPopover.isVisible().catch(() => false)) {
    await page.getByRole('button', { name: 'Tìm chức năng', exact: true }).click({ force: true });
    await shellSearchPopover.waitFor({ state: 'hidden', timeout: 2000 }).catch(() => {});
  }
  const buttons = page.locator(`[data-hd-navigation="sidebar"] button[aria-label="${target.label}"]`);
  const count = await buttons.count();
  const occurrence = target.occurrence || 0;
  if (!count || occurrence >= count) throw new Error(`Navigation button missing for ${route}: ${target.label}`);
  await buttons.nth(occurrence).click();
  await page.waitForTimeout(450);
};

const mobileMoreLabels = {
  executive_dashboard: 'Điều hành',
  order_requests: 'Lên đơn đặt hàng',
  messages: 'Tin nhắn',
  customers: 'Khách hàng',
  pricing: 'Giá cả',
  price_quotes: 'Báo giá hàng loạt',
  warehouse_dispatch: 'Xuất kho',
  warehouse_import: 'Nhập Xuất Tồn',
  delivery_reports: 'Báo cáo giao hàng',
  maps: 'Bản đồ',
  debt: 'Sổ nợ',
  finance: 'Thu chi',
  bank_payments: 'Ngân hàng',
  company_attendance: 'Chấm công',
  payroll: 'Bảng lương',
  employees: 'Nhân sự',
  employee_reviews: 'Đánh giá',
  asset_management: 'Quản lý tài sản',
  products: 'Kho sản phẩm',
  report: 'Báo cáo',
  settings: 'Cài đặt',
  role_permissions: 'Vai trò',
  billing: 'Gói cước',
};

const navigateMobileRoute = async (page, route) => {
  const bottom = page.locator('[data-hd-navigation="bottom"]');
  const direct = bottom.getByRole('button', { name: routeNavigation[route]?.label || route, exact: true });
  if (route === 'more' || await direct.count()) {
    await bottom.getByRole('button', { name: route === 'more' ? 'Thêm' : routeNavigation[route].label, exact: true }).click();
    await page.waitForTimeout(450);
    return;
  }
  await bottom.getByRole('button', { name: 'Thêm', exact: true }).click();
  await page.waitForTimeout(300);
  const label = mobileMoreLabels[route];
  if (!label) throw new Error(`No mobile More mapping for ${route}`);
  const menuItemClicked = await clickVisibleButton(page, label);
  if (!menuItemClicked) throw new Error(`Visible mobile More item missing for ${route}: ${label}`);
  await page.waitForTimeout(450);
};

const navigateTabletRoute = async (page, route) => {
  const target = routeNavigation[route];
  if (!target) throw new Error(`No visual QA navigation mapping for ${route}`);
  const buttons = page.locator(`[data-hd-navigation="rail"] button[aria-label="${target.label}"]`);
  const count = await buttons.count();
  const occurrence = target.occurrence || 0;
  if (!count || occurrence >= count) throw new Error(`Tablet navigation button missing for ${route}: ${target.label}`);
  await buttons.nth(occurrence).click();
  await page.waitForTimeout(450);
};

const routeGate = (result) => (
  result.httpStatus === 200
  && result.navigationWorked
  && result.layout.shellVisible
  && result.layout.scrollWidth <= result.layout.clientWidth
  && result.layout.scrollHeight >= result.layout.clientHeight
  && result.consoleErrors.length === 0
  && result.pageErrors.length === 0
  && result.failedRequests.length === 0
);

const recordRouteSnapshots = async ({ session, routes, navigate, viewport }) => {
  for (const route of routes) {
    const definition = routeDefinitions.find((item) => item.route === route);
    let navigationWorked = true;
    let navigationError = '';
    try {
      await navigate(session.page, route);
    } catch (error) {
      navigationWorked = false;
      navigationError = shortText(error?.message || error);
    }
    const layout = await inspectLayout(session.page, route);
    const screenshotPath = `${outputDir}/sections/${viewport.name}-${route}.png`;
    await mkdir(`${outputDir}/sections`, { recursive: true });
    await session.page.screenshot({ path: screenshotPath, fullPage: false });
    allResults.push({
      section: definition?.section || route,
      route,
      screen: definition?.screen,
      viewport,
      httpStatus: session.response?.status() || null,
      navigationWorked,
      navigationError,
      screenshotPath,
      layout,
      ...session.diagnostics,
    });
  }
};

const startPage = async ({ width, height, token = previewAuthToken, store = previewQaStore }) => {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const diagnostics = attachDiagnostics(page);
  await installPreviewSession(page, token, store);
  const response = await page.goto(baseUrl, { waitUntil: 'commit', timeout: 20000 });
  await waitForApplication(page);
  return { context, page, response, diagnostics };
};

const authShellResults = [];
for (const [name, width, height] of viewports) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  const diagnostics = attachDiagnostics(page);
  const response = await page.goto(baseUrl, { waitUntil: 'commit', timeout: 20000 });
  await page.waitForSelector('[data-hd-shell="enterprise"]', { timeout: 20000 });
  await page.waitForTimeout(350);
  const layout = await inspectLayout(page, 'auth shell');
  const screenshotPath = `${outputDir}/auth-${name}.png`;
  await page.screenshot({ path: screenshotPath, fullPage: false });
  authShellResults.push({ viewport: { name, width, height }, httpStatus: response?.status() || null, screenshotPath, layout, ...diagnostics });
  await page.close();
}

const desktopSession = await startPage({ width: 1366, height: 768 });
try {
  for (const definition of routeDefinitions) {
    const route = definition.route;
    let navigationWorked = true;
    let navigationError = '';
    try {
      await navigateRoute(desktopSession.page, route);
    } catch (error) {
      navigationWorked = false;
      navigationError = shortText(error?.message || error);
    }
    const layout = await inspectLayout(desktopSession.page, route);
    const screenshotPath = `${outputDir}/sections/desktop-${route}.png`;
    await mkdir(`${outputDir}/sections`, { recursive: true });
    await desktopSession.page.screenshot({ path: screenshotPath, fullPage: false });
    allResults.push({
      section: definition.section,
      route,
      screen: definition.screen,
      viewport: { name: 'desktop', width: 1366, height: 768 },
      httpStatus: desktopSession.response?.status() || null,
      navigationWorked,
      navigationError,
      screenshotPath,
      layout,
      ...desktopSession.diagnostics,
    });
  }

  const searchTrigger = desktopSession.page.getByRole('button', { name: 'Tìm chức năng', exact: true });
  await searchTrigger.click();
  const moduleSearch = desktopSession.page.getByRole('searchbox', { name: 'Tìm module' });
  await moduleSearch.fill('Khách hàng');
  const searchResult = desktopSession.page.getByRole('button', { name: 'Khách hàng', exact: true }).last();
  const searchWorked = await searchResult.isVisible();
  if (searchWorked) await searchResult.click();
  const shellSearchPopover = desktopSession.page.locator('.hd-shell-search-popover');
  if (await shellSearchPopover.isVisible().catch(() => false)) {
    await desktopSession.page.getByRole('button', { name: 'Tìm chức năng', exact: true }).click({ force: true });
  }
  interactionResults.push({ interaction: 'sidebar module search', passed: searchWorked && (await desktopSession.page.getByRole('button', { name: 'Tìm kiếm', exact: true }).count()) >= 0 });

  await navigateRoute(desktopSession.page, 'customers');
  const headerSearch = desktopSession.page.getByRole('button', { name: 'Tìm kiếm', exact: true });
  const headerSearchAvailable = await headerSearch.isVisible().catch(() => false);
  if (headerSearchAvailable) {
    await headerSearch.click();
    const visibleSearchInputs = desktopSession.page.locator('input[type="search"]:visible');
    if (await visibleSearchInputs.count()) {
      await visibleSearchInputs.last().fill('Lan Anh');
      await visibleSearchInputs.last().press('Escape').catch(() => {});
    }
  }
  interactionResults.push({ interaction: 'customer search', passed: headerSearchAvailable });

  await navigateRoute(desktopSession.page, 'more');
  const moreButton = desktopSession.page.getByRole('button', { name: 'Đơn hàng', exact: true }).last();
  const moreWorked = await moreButton.isVisible().catch(() => false);
  if (moreWorked) await moreButton.click();
  interactionResults.push({ interaction: 'more menu navigation', passed: moreWorked });
  await navigateRoute(desktopSession.page, 'home');
  interactionResults.push({ interaction: 'sidebar back navigation', passed: (await desktopSession.page.getByRole('button', { name: 'Trang chủ', exact: true }).count()) > 0 });
} finally {
  await desktopSession.context.close();
}

const mobileRoutes = routeDefinitions.map((definition) => definition.route);
const mobileSession = await startPage({ width: 390, height: 844 });
try {
  for (const route of mobileRoutes) {
    let navigationWorked = true;
    let navigationError = '';
    try {
      await navigateMobileRoute(mobileSession.page, route);
    } catch (error) {
      navigationWorked = false;
      navigationError = shortText(error?.message || error);
    }
    const layout = await inspectLayout(mobileSession.page, route);
    const screenshotPath = `${outputDir}/sections/mobile-${route}.png`;
    await mobileSession.page.screenshot({ path: screenshotPath, fullPage: false });
    allResults.push({
      section: sectionDefinitions.find((item) => item[1] === route)?.[0] || route,
      route,
      viewport: { name: 'mobile-standard', width: 390, height: 844 },
      httpStatus: mobileSession.response?.status() || null,
      navigationWorked,
      navigationError,
      screenshotPath,
      layout,
      ...mobileSession.diagnostics,
    });
  }
} finally {
  await mobileSession.context.close();
}

const desktopWideSession = await startPage({ width: 1440, height: 900 });
try {
  await recordRouteSnapshots({
    session: desktopWideSession,
    routes: routeDefinitions.map((definition) => definition.route),
    navigate: navigateRoute,
    viewport: { name: 'desktop-wide', width: 1440, height: 900 },
  });
} finally {
  await desktopWideSession.context.close();
}

for (const [name, width, height] of [['mobile-narrow', 360, 800], ['mobile-wide', 412, 915]]) {
  const session = await startPage({ width, height });
  try {
    await recordRouteSnapshots({
      session,
      routes: mobileRoutes,
      navigate: navigateMobileRoute,
      viewport: { name, width, height },
    });
  } finally {
    await session.context.close();
  }
}

const tabletSession = await startPage({ width: 768, height: 1024 });
try {
  await recordRouteSnapshots({
    session: tabletSession,
    routes: routeDefinitions.map((definition) => definition.route),
    navigate: navigateTabletRoute,
    viewport: { name: 'tablet', width: 768, height: 1024 },
  });
} finally {
  await tabletSession.context.close();
}

const customerClaims = {
  uid: 'c_preview_01',
  identityId: 'c_preview_01',
  appUserId: 'c_preview_01',
  accountId: 'c_preview_01',
  customerId: 'c_preview_01',
  companyId: 'comp_preview',
  companyName: 'Công ty HD Preview',
  accountType: 'customer',
  role: 'customer',
  name: 'Cửa hàng Lan Anh',
  phone: '0911222333',
};
const customerSession = await startPage({ width: 390, height: 844, token: `${PREVIEW_AUTH_TOKEN_PREFIX}${encodeURIComponent(JSON.stringify(customerClaims))}` });
try {
  const portalLayout = await inspectLayout(customerSession.page, 'portal shell');
  const portalText = await customerSession.page.locator('body').innerText();
  allResults.push({
    section: 'Customer portal',
    route: 'portal shell',
    viewport: { name: 'mobile-standard', width: 390, height: 844 },
    httpStatus: customerSession.response?.status() || null,
    navigationWorked: portalText.includes('Cửa hàng Lan Anh'),
    screenshotPath: `${outputDir}/sections/mobile-portal-shell.png`,
    layout: portalLayout,
    ...customerSession.diagnostics,
  });
  await customerSession.page.screenshot({ path: `${outputDir}/sections/mobile-portal-shell.png`, fullPage: false });
  const moreTab = customerSession.page.getByRole('button', { name: 'Thêm', exact: true }).last();
  if (await moreTab.isVisible().catch(() => false)) {
    await moreTab.click();
    const chatButton = customerSession.page.getByRole('button', { name: 'Nhắn tin', exact: true });
    const chatVisible = await chatButton.isVisible().catch(() => false);
    if (chatVisible) await chatButton.click();
    interactionResults.push({ interaction: 'customer portal chat entry', passed: chatVisible });
  }
} finally {
  await customerSession.context.close();
}

const profileClaims = (employeeId, name, phone) => ({
  uid: employeeId,
  identityId: employeeId,
  appUserId: employeeId,
  companyId: 'comp_preview',
  companyName: 'Công ty HD Preview',
  accountType: 'employee',
  role: 'employee',
  name,
  phone,
});

const inspectEmployeeMessages = async (employeeId, name, phone, expectedText, forbiddenText) => {
  const session = await startPage({ width: 1366, height: 768, token: `${PREVIEW_AUTH_TOKEN_PREFIX}${encodeURIComponent(JSON.stringify(profileClaims(employeeId, name, phone)))}` });
  try {
    await navigateRoute(session.page, 'messages');
    const bodyText = await session.page.locator('body').innerText();
    const result = {
      employeeId,
      seesAssignedConversation: bodyText.includes(expectedText),
      hidesUnassignedConversation: !bodyText.includes(forbiddenText),
      notificationVisible: employeeId === 'emp_sales_01' ? bodyText.includes('Tin nhắn khách hàng') || bodyText.includes('1') : true,
      ...session.diagnostics,
    };
    messagingResults.push(result);
  } finally {
    await session.context.close();
  }
};

const clonePreviewStore = (store) => JSON.parse(JSON.stringify(store));
const readPreviewStore = async (page) => page.evaluate(() => {
  const raw = window.localStorage.getItem('hd-manager-local-db-v2-clean-preview');
  return raw ? JSON.parse(raw) : {};
});

const clickConversationByText = async (page, customerName, messageText = '') => {
  let candidates = page.locator('button').filter({ hasText: customerName });
  if (messageText) candidates = candidates.filter({ hasText: messageText });
  for (let index = 0; index < await candidates.count(); index += 1) {
    const candidate = candidates.nth(index);
    if (await candidate.isVisible()) {
      await candidate.click();
      return true;
    }
  }
  return false;
};

const openEmployeeMessages = async ({ employeeId, name, phone, store = previewQaStore }) => {
  const session = await startPage({
    width: 1366,
    height: 768,
    token: `${PREVIEW_AUTH_TOKEN_PREFIX}${encodeURIComponent(JSON.stringify(profileClaims(employeeId, name, phone)))}`,
    store
  });
  await navigateRoute(session.page, 'messages');
  return session;
};

const sendEmployeeReply = async ({ employeeId, name, phone, store, customerName, messageText, text }) => {
  const session = await openEmployeeMessages({ employeeId, name, phone, store });
  try {
    const conversationOpened = await clickConversationByText(session.page, customerName, messageText);
    const composer = session.page.locator('input[placeholder="Nhập nội dung..."]');
    const composerVisible = await composer.isVisible().catch(() => false);
    if (conversationOpened && composerVisible) {
      await composer.fill(text);
      await composer.press('Enter');
      await session.page.getByText('Đã gửi và đồng bộ tin nhắn.', { exact: true }).waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
    }
    const nextStore = await readPreviewStore(session.page);
    const savedMessage = Object.values(nextStore.messages || {}).find(message => (
      message?.text === text && message?.senderEmpId === employeeId && message?.customerId === 'c_preview_01'
    ));
    messagingChecks.push({
      check: 'employee reply reaches local message store',
      passed: conversationOpened && composerVisible && Boolean(savedMessage),
      employeeId,
      conversationOpened,
      composerVisible,
      savedMessageId: savedMessage?.id || '',
      ...session.diagnostics
    });
    return { store: nextStore, savedMessage, diagnostics: session.diagnostics };
  } finally {
    await session.context.close();
  }
};

const openCustomerPortalChat = async (store) => {
  const session = await startPage({
    width: 390,
    height: 844,
    token: `${PREVIEW_AUTH_TOKEN_PREFIX}${encodeURIComponent(JSON.stringify(customerClaims))}`,
    store
  });
  const moreTab = session.page.getByRole('button', { name: 'Thêm', exact: true }).last();
  if (await moreTab.isVisible().catch(() => false)) await moreTab.click();
  await session.page.waitForTimeout(300);
  const chatButton = session.page.getByRole('button', { name: 'Nhắn tin', exact: true });
  const chatVisible = await chatButton.isVisible().catch(() => false);
  if (chatVisible) await chatButton.click();
  await session.page.waitForTimeout(450);
  return { session, chatVisible };
};

const sendCustomerReply = async ({ store, text, expectedVisibleText = '' }) => {
  const { session, chatVisible } = await openCustomerPortalChat(store);
  try {
    const composer = session.page.locator('textarea[placeholder="Nhập nội dung cần trao đổi..."]');
    let composerVisible = await composer.isVisible().catch(() => false);
    const conversationOpened = composerVisible || await clickConversationByText(session.page, 'Ngọc Anh');
    const portalBodyText = await session.page.locator('body').innerText();
    const portalMessageVisible = expectedVisibleText ? portalBodyText.includes(expectedVisibleText) : true;
    if (!composerVisible) composerVisible = await composer.isVisible().catch(() => false);
    if (conversationOpened && composerVisible) {
      await composer.fill(text);
      await composer.press('Enter');
      await session.page.getByText('Đã gửi tin nhắn cho nhân viên phụ trách.', { exact: true }).waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
    }
    const nextStore = await readPreviewStore(session.page);
    const savedMessage = Object.values(nextStore.messages || {}).find(message => (
      message?.text === text && message?.senderType === 'customer' && message?.customerId === 'c_preview_01'
    ));
    messagingChecks.push({
      check: 'customer reply reaches local message store',
      passed: chatVisible && conversationOpened && portalMessageVisible && composerVisible && Boolean(savedMessage),
      chatVisible,
      conversationOpened,
      portalMessageVisible,
      composerVisible,
      savedMessageId: savedMessage?.id || '',
      ...session.diagnostics
    });
    return { store: nextStore, savedMessage, diagnostics: session.diagnostics };
  } finally {
    await session.context.close();
  }
};

const inspectEmployeeMessageAccess = async ({ employeeId, name, phone, store, expectedText = '', forbiddenText = '' }) => {
  const session = await openEmployeeMessages({ employeeId, name, phone, store });
  try {
    const bodyText = await session.page.locator('body').innerText();
    const result = {
      employeeId,
      expectedText,
      forbiddenText,
      seesExpected: expectedText ? bodyText.includes(expectedText) : true,
      hidesForbidden: forbiddenText ? !bodyText.includes(forbiddenText) : true,
      ...session.diagnostics
    };
    return result;
  } finally {
    await session.context.close();
  }
};

await inspectEmployeeMessages('emp_sales_01', 'Ngọc Anh', '0909000002', 'Tin QA từ khách hàng A', 'Tin QA từ khách hàng B');
await inspectEmployeeMessages('emp_driver_01', 'Minh Tài', '0909000003', 'Tin QA từ khách hàng B', 'Tin QA từ khách hàng A');

const employeeReplyText = 'QA phản hồi từ nhân viên A';
const customerReplyText = 'QA xác nhận từ khách hàng A';
const employeeReplyResult = await sendEmployeeReply({
  employeeId: 'emp_sales_01',
  name: 'Ngọc Anh',
  phone: '0909000002',
  store: clonePreviewStore(previewQaStore),
  customerName: 'Cửa hàng Lan Anh',
  messageText: 'Tin QA từ khách hàng A',
  text: employeeReplyText
});
const customerReplyResult = await sendCustomerReply({
  store: employeeReplyResult.store,
  text: customerReplyText,
  expectedVisibleText: employeeReplyText
});
const customerReplyVisibleToEmployee = await inspectEmployeeMessageAccess({
  employeeId: 'emp_sales_01',
  name: 'Ngọc Anh',
  phone: '0909000002',
  store: customerReplyResult.store,
  expectedText: customerReplyText,
});
messagingChecks.push({
  check: 'customer reply is visible to assigned employee',
  passed: customerReplyVisibleToEmployee.seesExpected,
  ...customerReplyVisibleToEmployee
});
const reassignedStore = clonePreviewStore(customerReplyResult.store);
reassignedStore.customers.c_preview_01 = {
  ...reassignedStore.customers.c_preview_01,
  empId: 'emp_driver_01',
  assignedEmployeeId: 'emp_driver_01',
  responsibleEmployeeId: 'emp_driver_01',
  managerName: 'Minh Tài',
  managerPhone: '0909000003'
};
const formerEmployeeAccess = await inspectEmployeeMessageAccess({
  employeeId: 'emp_sales_01',
  name: 'Ngọc Anh',
  phone: '0909000002',
  store: reassignedStore,
  expectedText: '',
  forbiddenText: 'Tin QA từ khách hàng A'
});
const newEmployeeAccess = await inspectEmployeeMessageAccess({
  employeeId: 'emp_driver_01',
  name: 'Minh Tài',
  phone: '0909000003',
  store: reassignedStore,
  expectedText: 'Tin QA từ khách hàng A',
  forbiddenText: ''
});
messagingChecks.push({
  check: 'assignment change revokes former employee history access',
  passed: formerEmployeeAccess.hidesForbidden,
  ...formerEmployeeAccess
});
messagingChecks.push({
  check: 'assignment change grants new employee history access',
  passed: newEmployeeAccess.seesExpected,
  ...newEmployeeAccess
});

const unclassifiedStore = clonePreviewStore(previewQaStore);
unclassifiedStore.customers.c_preview_03 = {
  id: 'c_preview_03',
  companyId: 'comp_preview',
  name: 'Khách chưa phân loại',
  phone: '0977000000',
  isArchived: false
};
unclassifiedStore.messages.qa_customer_unclassified_1 = {
  id: 'qa_customer_unclassified_1',
  companyId: 'comp_preview',
  customerId: 'c_preview_03',
  conversationId: 'customer_c_preview_03',
  conversationType: 'customer_support',
  assignmentState: 'unclassified',
  senderType: 'customer',
  senderName: 'Khách chưa phân loại',
  text: 'Tin QA chưa phân loại',
  createdAt: '2026-08-20T08:02:00.000Z',
  isRead: false,
  isArchived: false
};
const unclassifiedSalesAccess = await inspectEmployeeMessageAccess({
  employeeId: 'emp_sales_01',
  name: 'Ngọc Anh',
  phone: '0909000002',
  store: unclassifiedStore,
  forbiddenText: 'Tin QA chưa phân loại'
});
const unclassifiedDriverAccess = await inspectEmployeeMessageAccess({
  employeeId: 'emp_driver_01',
  name: 'Minh Tài',
  phone: '0909000003',
  store: unclassifiedStore,
  forbiddenText: 'Tin QA chưa phân loại'
});
messagingChecks.push({
  check: 'unclassified customer is hidden from employee A',
  passed: unclassifiedSalesAccess.hidesForbidden,
  ...unclassifiedSalesAccess
});
messagingChecks.push({
  check: 'unclassified customer is hidden from employee B',
  passed: unclassifiedDriverAccess.hidesForbidden,
  ...unclassifiedDriverAccess
});

const visualFailures = allResults.filter((result) => !routeGate(result));
const authFailures = authShellResults.filter((result) => (
  result.httpStatus !== 200
  || !result.layout.shellVisible
  || result.layout.scrollWidth > result.layout.clientWidth
  || result.consoleErrors.length > 0
  || result.pageErrors.length > 0
  || result.failedRequests.length > 0
));
const expectedRouteViewports = ['desktop', 'desktop-wide', 'mobile-narrow', 'mobile-standard', 'mobile-wide', 'tablet'];
const routeCoverageFailures = routeDefinitions.flatMap(({ route }) => expectedRouteViewports
  .filter((viewportName) => !allResults.some((result) => result.route === route && result.viewport.name === viewportName))
  .map((viewportName) => `${route}:${viewportName}`));
const messagingPass = messagingResults.length === 2 && messagingResults.every((result) => (
  result.seesAssignedConversation
  && result.hidesUnassignedConversation
  && result.consoleErrors.length === 0
  && result.pageErrors.length === 0
  && result.failedRequests.length === 0
)) && messagingChecks.length === 7 && messagingChecks.every((result) => (
  result.passed
  && result.consoleErrors?.length === 0
  && result.pageErrors?.length === 0
  && result.failedRequests?.length === 0
));
const report = {
  status: visualFailures.length === 0 && authFailures.length === 0 && routeCoverageFailures.length === 0 && messagingPass && interactionResults.every((item) => item.passed) ? 'PASS' : 'FAIL',
  baseUrl,
  browserPath,
  authenticatedSections: 'PREVIEW AUTH — isolated mock claims for employees/customers in comp_preview; production auth untouched',
  nativeAndroidStatusBar: 'NOT VERIFIED — no Android emulator/device available',
  routeCoverageFailures,
  sectionMapping: sectionDefinitions.map(([section, route, screen]) => {
    const routeResults = allResults.filter((result) => result.route === route);
    const desktopResults = routeResults.filter((result) => ['desktop', 'desktop-wide'].includes(result.viewport.name));
    const responsiveResults = routeResults.filter((result) => ['mobile-narrow', 'mobile-standard', 'mobile-wide'].includes(result.viewport.name));
    const tabletResults = routeResults.filter((result) => result.viewport.name === 'tablet');
    const isAuth = section === 'Authentication';
    const isPortal = section === 'Customer portal';
    const authDesktop = authShellResults.filter((result) => ['desktop', 'desktop-wide'].includes(result.viewport.name));
    const authResponsive = authShellResults.filter((result) => ['mobile-narrow', 'mobile-standard', 'mobile-wide'].includes(result.viewport.name));
    return {
      section,
      route,
      screen,
      desktop: isAuth ? authDesktop.length === 2 && authDesktop.every((result) => !authFailures.includes(result)) : isPortal ? false : desktopResults.length === 2 && desktopResults.every(routeGate),
      mobile: isAuth ? authResponsive.length === 3 && authResponsive.every((result) => !authFailures.includes(result)) : isPortal ? routeResults.length === 1 && routeResults.every(routeGate) : responsiveResults.length === 3 && responsiveResults.every(routeGate),
      tablet: isAuth || isPortal ? true : tabletResults.length === 1 && tabletResults.every(routeGate),
      testStatus: isAuth ? (authFailures.length === 0 ? 'PASS' : 'FAIL') : isPortal ? (routeResults.length === 1 && routeResults.every(routeGate) ? 'PASS' : 'FAIL') : (routeResults.length >= expectedRouteViewports.length && routeResults.every(routeGate) ? 'PASS' : 'FAIL'),
      screenshots: routeResults.map((result) => result.screenshotPath),
    };
  }),
  authShellResults,
  routeResults: allResults,
  interactionResults,
  messagingResults,
  messagingChecks,
};

await writeFile(`${outputDir}/report.json`, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));
await browser.close();
assert.equal(report.status, 'PASS', 'Visual, interaction, auth, or employee-scoped messaging QA found a regression.');
