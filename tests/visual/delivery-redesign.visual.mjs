import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';

const baseUrl = process.env.HD_MANAGER_VISUAL_QA_URL || 'http://127.0.0.1:5176/';
const outputDir = process.env.HD_MANAGER_DELIVERY_VISUAL_OUTPUT || 'test-results/delivery-redesign';
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
const authToken = `hd-preview-auth-v1:${encodeURIComponent(JSON.stringify(claims))}`;

await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ executablePath: browserPath, headless: true });

try {
  for (const viewport of [
    { name: 'mobile-320', width: 320, height: 700 },
    { name: 'mobile-360', width: 360, height: 780 },
    { name: 'mobile-390', width: 390, height: 844 },
    { name: 'mobile-430', width: 430, height: 932 },
    { name: 'tablet-768', width: 768, height: 1024 },
    { name: 'desktop-1024', width: 1024, height: 768 },
    { name: 'desktop-1366', width: 1366, height: 768 },
  ]) {
    const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
    const page = await context.newPage();
    const consoleErrors = [];
    const pageErrors = [];
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.addInitScript((token) => { window.__initial_auth_token = token; }, authToken);
    const response = await page.goto(baseUrl, { waitUntil: 'commit', timeout: 20000 });
    assert.equal(response?.status(), 200, `${viewport.name}: local app must return HTTP 200`);
    await page.waitForSelector('[data-hd-shell="enterprise"]', { timeout: 20000 });

    if (viewport.width < 600) {
      await page.locator('[data-hd-navigation="bottom"]').getByRole('button', { name: 'Thêm', exact: true }).click();
      await page.getByRole('button', { name: 'Báo cáo giao hàng', exact: true }).click();
    } else if (viewport.width < 1024) {
      const rail = page.locator('[data-hd-navigation="rail"]');
      await rail.getByRole('button', { name: 'Thêm', exact: true }).click();
      await page.getByRole('button', { name: 'Báo cáo giao hàng', exact: true }).click();
    } else {
      const sidebar = page.locator('[data-hd-navigation="sidebar"]');
      await sidebar.getByRole('button', { name: 'Thêm', exact: true }).click();
      await page.getByRole('button', { name: 'Báo cáo giao hàng', exact: true }).click();
    }

    const module = page.locator('[data-hd-module="delivery"]');
    await module.waitFor({ state: 'visible', timeout: 10000 });
    await page.getByRole('button', { name: 'Bắt đầu giao hàng', exact: false }).waitFor({ timeout: 10000 });
    const overviewEmptyState = module.locator('.hd-ds-state--empty');
    assert.equal(await overviewEmptyState.getByRole('heading').innerText(), 'Chưa có chuyến giao', `${viewport.name}: an empty delivery overview must use the shared empty-state component.`);

    const geometry = await page.evaluate(() => {
      const module = document.querySelector('[data-hd-module="delivery"]');
      const iconButtons = [...module.querySelectorAll('.hd-ds-button--icon')].map((button) => {
        const rect = button.getBoundingClientRect();
        return { width: rect.width, height: rect.height, label: button.getAttribute('aria-label') };
      });
      const statsGrid = module.querySelector('.hd-delivery-overview-stats');
      const hero = module.querySelector('.hd-delivery-overview-hero');
      const overviewTitle = module.querySelector('.hd-delivery-overview-title');
      const bounds = module.getBoundingClientRect();
      return {
        viewportWidth: window.innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        moduleLeft: bounds.left,
        moduleRight: bounds.right,
        overviewStatsColumns: getComputedStyle(statsGrid).gridTemplateColumns.split(' ').length,
        overviewTitleHeight: overviewTitle.getBoundingClientRect().height,
        overviewTitleFontSize: Number.parseFloat(getComputedStyle(overviewTitle).fontSize),
        overviewTitleFits: overviewTitle.scrollWidth <= overviewTitle.clientWidth,
        overviewHeroBackgroundImage: getComputedStyle(hero).backgroundImage,
        iconButtons,
      };
    });
    assert.ok(geometry.documentWidth <= geometry.viewportWidth + 1, `${viewport.name}: document must not overflow horizontally (${JSON.stringify(geometry)})`);
    assert.equal(geometry.overviewStatsColumns, 3, `${viewport.name}: delivery overview KPIs must remain in three aligned columns (${JSON.stringify(geometry)})`);
    assert.equal(geometry.overviewHeroBackgroundImage, 'none', `${viewport.name}: overview must use the shared surface rather than a module-specific gradient (${JSON.stringify(geometry)})`);
    assert.ok(geometry.overviewTitleFontSize <= 20 && geometry.overviewTitleHeight <= 32 && geometry.overviewTitleFits, `${viewport.name}: overview headline must follow the shared title scale without wrapping or clipping (${JSON.stringify(geometry)})`);
    assert.ok(geometry.iconButtons.length >= 2, `${viewport.name}: overview should expose the delivery icon actions`);
    assert.ok(geometry.iconButtons.every(({ width, height }) => width >= 44 && height >= 44), `${viewport.name}: icon actions must meet the shared 44px touch target (${JSON.stringify(geometry.iconButtons)})`);
    await page.screenshot({ path: `${outputDir}/${viewport.name}-overview.png`, fullPage: false });

    if (viewport.width === 390) {
      const themeBefore = await module.getAttribute('data-hd-theme');
      await page.getByRole('button', { name: 'Thao tác nhanh', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Thao tác nhanh' });
      await dialog.waitFor({ state: 'visible' });
      const toggle = dialog.getByRole('button', { name: /Dùng giao diện/ });
      await toggle.click();
      const expectedTheme = themeBefore === 'dark' ? 'light' : 'dark';
      await page.waitForFunction((theme) => document.querySelector('[data-hd-module="delivery"]')?.dataset.hdTheme === theme, expectedTheme);
      await page.waitForTimeout(200);
      const sheetSurface = await dialog.locator(':scope > div').evaluate((element) => getComputedStyle(element).backgroundColor);
      assert.equal(sheetSurface, expectedTheme === 'dark' ? 'rgb(15, 23, 42)' : 'rgb(255, 255, 255)', 'Quick actions must follow the app-wide theme as it changes.');
      if (expectedTheme === 'dark') {
        const tileSurface = await dialog.getByRole('button', { name: 'Quét khách', exact: true }).evaluate((element) => ({
          background: getComputedStyle(element).backgroundColor,
          className: element.className,
          disabled: element.disabled,
          theme: document.documentElement.dataset.hdTheme,
        }));
        assert.equal(tileSurface.background, 'rgb(30, 41, 59)', `Quick action tiles must use dark surfaces in dark mode (${JSON.stringify(tileSurface)}).`);
      }
      await page.screenshot({ path: `${outputDir}/mobile-quick-actions-${expectedTheme}.png`, fullPage: false });
      await toggle.click();
      await page.waitForFunction((theme) => document.querySelector('[data-hd-module="delivery"]')?.dataset.hdTheme === theme, themeBefore);
      await page.getByRole('button', { name: 'Đóng thao tác nhanh', exact: true }).click();

      await page.getByRole('button', { name: 'Bắt đầu giao hàng', exact: false }).click();
      const listEmptyState = module.locator('.hd-ds-state--empty');
      assert.equal(await listEmptyState.getByRole('heading').innerText(), 'Chưa có chuyến giao', 'The delivery list must use the shared empty-state component when there are no groups.');
      await page.screenshot({ path: `${outputDir}/mobile-list-empty.png`, fullPage: false });
      const listIconButtons = await module.locator('.hd-ds-button--icon').evaluateAll((buttons) => buttons.map((button) => {
        const rect = button.getBoundingClientRect();
        return { width: rect.width, height: rect.height, label: button.getAttribute('aria-label') };
      }));
      assert.ok(listIconButtons.length >= 3 && listIconButtons.every(({ width, height }) => width >= 44 && height >= 44), `mobile list: icon controls must preserve 44px targets (${JSON.stringify(listIconButtons)})`);
      await page.getByRole('button', { name: 'Bộ lọc', exact: true }).click();
      const filterDialog = page.getByRole('dialog', { name: 'Bộ lọc giao hàng' });
      await filterDialog.waitFor({ state: 'visible' });
      const filterSurface = await filterDialog.locator(':scope > div').evaluate((element) => getComputedStyle(element).backgroundColor);
      assert.equal(filterSurface, themeBefore === 'dark' ? 'rgb(15, 23, 42)' : 'rgb(255, 255, 255)', 'Delivery filter sheet must follow the shared theme.');
      await page.screenshot({ path: `${outputDir}/mobile-list-filter-${themeBefore}.png`, fullPage: false });
      await filterDialog.getByRole('button', { name: 'Đóng bộ lọc', exact: true }).click();
    }

    assert.deepEqual(consoleErrors, [], `${viewport.name}: browser console must be clean`);
    assert.deepEqual(pageErrors, [], `${viewport.name}: browser must have no uncaught errors`);
    await context.close();
  }
} finally {
  await browser.close();
}

console.log('Delivery design-system visual checks passed on mobile and desktop.');
