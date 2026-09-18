import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';

const baseUrl = process.env.HD_MANAGER_VISUAL_QA_URL || 'http://127.0.0.1:5176/';
const outputDir = process.env.HD_MANAGER_VISUAL_QA_OUTPUT || 'test-results/warehouse-dispatch-grouping-visual';
const browserPath = process.env.HD_MANAGER_VISUAL_QA_BROWSER_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const today = new Date().toISOString().slice(0, 10);
const previewAuthToken = `hd-preview-auth-v1:${encodeURIComponent(JSON.stringify({
  uid: 'emp_admin',
  identityId: 'emp_admin',
  appUserId: 'emp_admin',
  companyId: 'comp_preview',
  companyName: 'Công ty HD Preview',
  accountType: 'employee',
  role: 'super_admin',
  name: 'Quản trị Demo',
  phone: '0909000001',
}))}`;

const warehouseDispatches = {
  qa_dispatch_1: {
    id: 'qa_dispatch_1', companyId: 'comp_preview', date: today, shipmentId: 'qa_shipment_same',
    customerId: 'c_preview_01', customerNameSnapshot: 'Cửa hàng Lan Anh', productId: 'prod_preview_01',
    productNameSnapshot: 'Nước giặt HD', assignedDriverId: 'emp_driver_01', assignedDriverNameSnapshot: 'Minh Tài',
    quantity: 4, quantityUnit: 'Can', weightKg: 0, isArchived: false,
  },
  qa_dispatch_2: {
    id: 'qa_dispatch_2', companyId: 'comp_preview', date: today, shipmentId: 'qa_shipment_same',
    customerId: 'c_preview_01', customerNameSnapshot: 'Cửa hàng Lan Anh', productId: 'prod_preview_02',
    productNameSnapshot: 'Khăn giấy Soft', assignedDriverId: 'emp_driver_01', assignedDriverNameSnapshot: 'Minh Tài',
    quantity: 2, quantityUnit: 'Thùng', weightKg: 0, isArchived: false,
  },
  qa_dispatch_3: {
    id: 'qa_dispatch_3', companyId: 'comp_preview', date: today, shipmentId: 'qa_shipment_same',
    customerId: 'c_preview_01', customerNameSnapshot: 'Cửa hàng Lan Anh', productId: 'prod_preview_03',
    productNameSnapshot: 'Bao bì HD', assignedDriverId: 'emp_driver_01', assignedDriverNameSnapshot: 'Minh Tài',
    quantity: 1, quantityUnit: 'Bao', weightKg: 0, isArchived: false,
  },
  qa_dispatch_other: {
    id: 'qa_dispatch_other', companyId: 'comp_preview', date: today, shipmentId: 'qa_shipment_other',
    customerId: 'c_preview_01', customerNameSnapshot: 'Cửa hàng Lan Anh', productId: 'prod_preview_01',
    productNameSnapshot: 'Nước giặt HD', assignedDriverId: 'emp_driver_01', assignedDriverNameSnapshot: 'Minh Tài',
    quantity: 1, quantityUnit: 'Can', weightKg: 0, isArchived: false,
  },
};

const previewStore = {
  products: {
    prod_preview_03: {
      id: 'prod_preview_03', companyId: 'comp_preview', name: 'Bao bì HD', category: 'Phụ kiện', unit: 'Bao', price: 12000, isArchived: false,
    },
  },
  warehouseDispatches,
};

const openDispatchTable = async (page) => {
  await page.addInitScript(({ authToken, initialStore }) => {
    window.__initial_auth_token = authToken;
    window.localStorage.setItem('hd-manager-local-db-v2-clean-preview', JSON.stringify(initialStore));
  }, { authToken: previewAuthToken, initialStore: previewStore });

  await page.goto(baseUrl, { waitUntil: 'commit', timeout: 20000 });
  try {
    await page.waitForSelector('[data-hd-shell="enterprise"]', { timeout: 30000 });
  } catch (error) {
    const bodyText = await page.locator('body').innerText().catch(() => '');
    throw new Error(`Preview shell did not load: ${bodyText.slice(0, 400)}`, { cause: error });
  }
  await page.getByRole('button', { name: 'Xuất kho', exact: true }).click();
  await page.getByRole('columnheader', { name: 'Người giao', exact: true }).waitFor({ timeout: 10000 });
  await page.getByText('Nước giặt HD', { exact: true }).first().waitFor({ timeout: 10000 });
};

const inspectTable = async (page) => page.locator('table').evaluate((table) => ({
  tableScrollWidth: table.scrollWidth,
  viewportWidth: window.innerWidth,
  productRows: [...table.querySelectorAll('tbody tr')].filter((row) => row.innerText.trim()).length,
  groupedDriverCells: [...table.querySelectorAll('tbody td[rowspan="3"]')]
    .filter((cell) => cell.innerText.includes('Minh Tài')).length,
  groupedCustomerCells: [...table.querySelectorAll('tbody td[rowspan="3"]')]
    .filter((cell) => cell.innerText.includes('Cửa hàng Lan Anh')).length,
  mergedGroupText: [...table.querySelectorAll('tbody td[rowspan="3"]')]
    .find((cell) => cell.innerText.includes('Minh Tài'))?.innerText || '',
  productLabels: [...table.querySelectorAll('tbody tr')].map((row) => row.innerText),
}));

await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ executablePath: browserPath, headless: true });

try {
  for (const [name, width, height] of [['desktop', 1366, 768], ['mobile', 390, 844]]) {
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    const diagnostics = { consoleErrors: [], pageErrors: [] };
    page.on('console', (message) => {
      if (message.type() === 'error') diagnostics.consoleErrors.push(message.text());
    });
    page.on('pageerror', (error) => diagnostics.pageErrors.push(error.message));

    await openDispatchTable(page);
    const table = await inspectTable(page);
    await page.screenshot({ path: `${outputDir}/${name}.png`, fullPage: false });
    await page.locator('table').screenshot({ path: `${outputDir}/${name}-table.png` });

    assert.equal(table.productRows, 4, `${name}: every dispatch product must keep its own row`);
    assert.equal(table.groupedDriverCells, 1, `${name}: only the three-product shipment driver cell may merge`);
    assert.equal(table.groupedCustomerCells, 1, `${name}: only the three-product shipment customer cell may merge`);
    assert.ok(table.mergedGroupText.includes('Chưa giao'), `${name}: the merged group must show delivery status`);
    assert.ok(table.productLabels.some((text) => text.includes('Nước giặt HD')));
    assert.ok(table.productLabels.some((text) => text.includes('Khăn giấy Soft')));
    assert.ok(table.productLabels.some((text) => text.includes('Bao bì HD')));
    assert.ok(table.tableScrollWidth <= table.viewportWidth, `${name}: table must not overflow the viewport`);
    assert.deepEqual(diagnostics.consoleErrors, [], `${name}: browser console must be clean`);
    assert.deepEqual(diagnostics.pageErrors, [], `${name}: browser must have no page errors`);

    await context.close();
  }
} finally {
  await browser.close();
}

console.log('Warehouse dispatch grouping visual checks passed on desktop and mobile.');
