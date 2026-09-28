import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';

const baseUrl = process.env.HD_MANAGER_CUSTOMER_DIRECTORY_URL || 'http://127.0.0.1:5216/';
const browserPath = process.env.HD_MANAGER_VISUAL_QA_BROWSER_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const outputDir = process.env.HD_MANAGER_CUSTOMER_DIRECTORY_OUTPUT || 'test-results/customer-supplier-directory';
const claims = {
  uid: 'emp_admin', identityId: 'emp_admin', appUserId: 'emp_admin',
  companyId: 'comp_preview', companyName: 'Công ty HD Preview',
  accountType: 'employee', role: 'super_admin', name: 'Quản trị Demo', phone: '0909000001',
};
const token = `hd-preview-auth-v1:${encodeURIComponent(JSON.stringify(claims))}`;
const supplierFixture = {
  customers: {
    c_supplier_preview: {
      id: 'c_supplier_preview', companyId: 'comp_preview', empId: 'emp_sales_01',
      name: 'Công ty Gạo Minh', phone: '0901234567', address: 'Bình Dương',
      purchaseReconciliationEnabled: true, isArchived: false,
    },
  },
  warehouseImports: {
    imp_supplier_linked: {
      id: 'imp_supplier_linked', companyId: 'comp_preview', supplierCustomerId: 'c_supplier_preview',
      supplier: 'Công ty Gạo Minh', amount: 100000, date: '2026-09-23', createdAt: '2026-09-23T08:00:00.000Z',
    },
    imp_supplier_manual_1: {
      id: 'imp_supplier_manual_1', companyId: 'comp_preview',
      supplier: 'Nông trại Nam', supplierPhone: '0909888777', amount: 200000,
      date: '2026-09-24', createdAt: '2026-09-24T08:00:00.000Z',
    },
    imp_supplier_manual_2: {
      id: 'imp_supplier_manual_2', companyId: 'comp_preview',
      supplier: 'Nông trại Nam', supplierPhone: '0909888777', amount: 150000,
      date: '2026-09-25', createdAt: '2026-09-25T08:00:00.000Z',
    },
  },
};

await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ executablePath: browserPath, headless: true });

try {
  for (const viewport of [
    { width: 320, height: 700 },
    { width: 390, height: 844 },
    { width: 768, height: 1024 },
    { width: 1366, height: 768 },
  ]) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(({ authToken, fixture }) => {
      window.__initial_auth_token = authToken;
      window.localStorage.setItem('hd-manager-local-db-v2-clean-preview', JSON.stringify(fixture));
    }, { authToken: token, fixture: supplierFixture });
    const response = await page.goto(baseUrl, { waitUntil: 'commit' });
    assert.equal(response?.status(), 200);
    await page.locator('[data-hd-shell="enterprise"]').waitFor();
    if (viewport.width < 600) {
      await page.locator('[data-hd-navigation="bottom"]').getByRole('button', { name: 'Thêm', exact: true }).click();
      await page.getByRole('button', { name: 'Khách hàng', exact: true }).click();
    } else if (viewport.width < 1024) {
      await page.locator('[data-hd-navigation="rail"]').getByRole('button', { name: 'Khách hàng', exact: true }).click();
    } else {
      await page.locator('[data-hd-navigation="sidebar"]').getByRole('button', { name: 'Khách hàng', exact: true }).click();
    }
    await page.locator('.premium-customer-module').waitFor();
    const tabs = page.locator('.hd-customer-directory-tabs');
    const customersTab = tabs.getByRole('tab', { name: 'Khách hàng' });
    const suppliersTab = tabs.getByRole('tab', { name: 'Nhà cung cấp' });
    assert.equal(await customersTab.getAttribute('aria-selected'), 'true');
    assert.equal(await suppliersTab.getAttribute('aria-selected'), 'false');
    const summary = page.locator('[data-customer-summary="true"]');
    const layout = await summary.evaluate(element => {
      const cards = [...element.querySelectorAll('.hd-ds-card--kpi')];
      const bounds = cards.map(card => card.getBoundingClientRect());
      return {
        count: cards.length,
        sameRow: bounds.every(rect => Math.abs(rect.top - bounds[0].top) <= 1),
        valuesFit: cards.every(card => {
          const value = card.querySelector('.hd-ds-card__value');
          return value.scrollWidth <= value.clientWidth + 1;
        }),
      };
    });
    assert.deepEqual(layout, { count: 3, sameRow: true, valuesFit: true }, `${viewport.width}px: customer KPIs must fit on one row`);
    const cardStatsFit = await page.locator('[data-customer-card="true"]').first().evaluate(card => {
      const stats = card.querySelector('.hd-customer-card__stats-row');
      const cells = [...stats.children];
      return cells.length === 3 && cells.every(cell => {
        const value = cell.querySelector('p:last-child');
        return value.scrollWidth <= value.clientWidth + 1;
      });
    });
    assert(cardStatsFit, `${viewport.width}px: customer card statistics must stay in three fitting cells`);
    await page.screenshot({ path: `${outputDir}/customers-${viewport.width}.png` });

    await suppliersTab.click();
    await page.getByRole('tabpanel', { name: 'Nhà cung cấp' }).waitFor();
    await page.waitForFunction(() => getComputedStyle(document.querySelector('.hd-customer-directory-tabs button[aria-selected="true"]')).backgroundColor === 'rgb(255, 255, 255)');
    assert.equal(await suppliersTab.getAttribute('aria-selected'), 'true');
    assert.equal(await customersTab.getAttribute('aria-selected'), 'false');
    const selectedTabBackground = await suppliersTab.evaluate(element => getComputedStyle(element).backgroundColor);
    assert.equal(selectedTabBackground, 'rgb(255, 255, 255)', `${viewport.width}px: supplier tab must have the selected surface`);
    assert.equal(await summary.count(), 0);
    assert.equal(await page.locator('[data-customer-card="true"]').count(), 0);
    assert.equal(await page.locator('.hd-customer-supplier-count').textContent(), '2 nhà cung cấp');
    assert.equal(await page.locator('[data-supplier-card="true"]').count(), 2, 'repeated supplier imports must produce one supplier row');
    assert.match(await page.locator('[data-supplier-card="true"]').first().textContent(), /Nông trại Nam.*Phiếu nhập2.*350\.000 đ/s);
    await page.screenshot({ path: `${outputDir}/suppliers-${viewport.width}.png` });

    await page.locator('.hd-app-header').getByRole('button', { name: 'Bộ lọc', exact: true }).click();
    const supplierFilters = page.getByRole('dialog', { name: 'Sắp xếp nhà cung cấp' });
    await supplierFilters.waitFor();
    await supplierFilters.getByRole('button', { name: 'Tên A-Z' }).click();
    await supplierFilters.getByRole('button', { name: 'Áp dụng' }).click();
    assert.match(await page.locator('[data-supplier-card="true"]').first().textContent(), /Công Ty Gạo Minh/i);

    await page.locator('.hd-app-header').getByRole('button', { name: 'Tìm kiếm', exact: true }).click();
    await page.locator('.hd-header-search-input').fill('Nông trại');
    await page.waitForFunction(() => document.querySelectorAll('[data-supplier-card="true"]').length === 1);
    assert.match(await page.locator('[data-supplier-card="true"]').textContent(), /Nông trại Nam/);
    await page.locator('.hd-app-header').getByRole('button', { name: 'Xóa tìm kiếm', exact: true }).click();
    await page.waitForFunction(() => document.querySelectorAll('[data-supplier-card="true"]').length === 2);
    await page.locator('[data-supplier-card="true"]').filter({ hasText: /Công Ty Gạo Minh/i }).click();
    await page.locator('.premium-customer-detail').waitFor();
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('hd-manager-screen-back', { cancelable: true, detail: { handled: false } })));
    await page.getByRole('tabpanel', { name: 'Nhà cung cấp' }).waitFor();
    assert.equal(await suppliersTab.getAttribute('aria-selected'), 'true', 'returning from a linked supplier must preserve the supplier tab');

    await customersTab.click();
    await summary.waitFor();
    assert.equal(await customersTab.getAttribute('aria-selected'), 'true');
    const documentWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    assert(documentWidth <= viewport.width + 1, `${viewport.width}px: directory must not overflow horizontally`);
    assert.deepEqual(errors, [], `${viewport.width}px: no page errors`);
    await context.close();
  }
} finally {
  await browser.close();
}

console.log('Customer/supplier directory visual checks passed.');
