import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';

const baseUrl = process.env.HD_MANAGER_GLOBAL_SEARCH_URL || 'http://127.0.0.1:5181/';
const outputDir = process.env.HD_MANAGER_GLOBAL_SEARCH_OUTPUT || 'test-results/visual-qa-unified-state';
const browserPath = process.env.HD_MANAGER_VISUAL_QA_BROWSER_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const claims = {
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
const previewToken = `hd-preview-auth-v1:${encodeURIComponent(JSON.stringify(claims))}`;
const deadline = setTimeout(() => { console.error('Search QA timeout 120s'); process.exit(1); }, 120000);
const browser = await chromium.launch({ headless: true, executablePath: browserPath });
const viewportRuns = [
  { width: 320, height: 720 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1366, height: 768 },
];
const results = [];

try {
  for (const viewport of viewportRuns) {
    const context = await browser.newContext({ viewport, isMobile: viewport.width < 600, hasTouch: viewport.width < 600 });
    await context.route('**/*', route => new URL(route.request().url()).origin === new URL(baseUrl).origin ? route.continue() : route.abort());
    context.setDefaultTimeout(10000);
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    await page.addInitScript(token => { window.__initial_auth_token = token; }, previewToken);
    const response = await page.goto(baseUrl, { waitUntil: 'commit', timeout: 20000 });
    assert.equal(response?.status(), 200, `HTTP response at ${viewport.width}px`);
    await page.waitForSelector('[data-hd-shell="enterprise"]', { timeout: 20000 });
    await page.waitForTimeout(900);

    assert.equal(await page.locator('.hd-header-global-search-button, .hd-shell-search-trigger').count(), 0);
    await page.keyboard.press('Control+k');
    await page.keyboard.press('Meta+k');
    assert.equal(await page.locator('.hd-shell-search-overlay').count(), 0);
    await page.getByRole('button', { name: 'Thêm', exact: true }).filter({ visible: true }).first().click();
    await page.locator('main').getByRole('button', { name: 'Khách hàng', exact: true }).click();
    await page.getByRole('button', { name: 'Tìm kiếm', exact: true }).filter({ visible: true }).first().click();
    const input = page.getByPlaceholder('Tìm khách hàng, nhà cung cấp...');
    await input.fill('Demo');
    assert.equal(await input.inputValue(), 'Demo');
    assert.equal(await page.locator('.hd-header-global-search-button, .hd-shell-search-popover').count(), 0);
    await mkdir(outputDir, { recursive: true });
    await page.screenshot({ path: `${outputDir}/module-search-${viewport.width}.png` });
    assert.deepEqual(pageErrors, [], `no uncaught page errors at ${viewport.width}px`);
    results.push({ viewport, globalSearchRemoved: true, moduleSearchWorks: true });
    await context.close();
  }
} finally {
  await browser.close();
  clearTimeout(deadline);
}
console.log(`PASS global search removal QA: ${JSON.stringify(results)}`);
