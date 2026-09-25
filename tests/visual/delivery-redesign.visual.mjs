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
const now = new Date();
const today = `${now.getFullYear()}-${`${now.getMonth() + 1}`.padStart(2, '0')}-${`${now.getDate()}`.padStart(2, '0')}`;
const timestampAt = (hour) => new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, 15).toISOString();
const customers = Object.fromEntries([
  ['delivery_01', 'Toàn Mua Lồng Vịt', '0911000001', 'Bình Dương', 'https://www.google.com/maps/search/?api=1&query=10.9804,106.6519'],
  ['delivery_02', 'Thu Tân Tiến', '0911000002', 'Dĩ An', ''],
  ['delivery_03', 'Nga Sang Vịt Sống', '0911000003', 'Bến Cát', ''],
  ['delivery_04', 'Hùng Gà Tân Uyên', '0911000004', 'Tân Uyên', ''],
  ['delivery_05', 'Phương Vịt Thủ Dầu', '0911000005', 'Thủ Dầu Một', ''],
].map(([id, name, phone, address, locationUrl]) => [id, {
  id, companyId: 'comp_preview', empId: 'emp_sales_01', name, phone, address,
  locationUrl, assignedEmployeeId: 'emp_sales_01', responsibleEmployeeId: 'emp_sales_01', isArchived: false,
}]));
const dispatchRows = [
  ['dispatch_01', 'delivery_01', 'Toàn Mua Lồng Vịt', 'Lồng vịt', 112, 9, false],
  ['dispatch_02', 'delivery_02', 'Thu Tân Tiến', 'Vịt sống', 24, 10, true],
  ['dispatch_03', 'delivery_03', 'Nga Sang Vịt Sống', 'Vịt sống', 36, 11, true],
  ['dispatch_04', 'delivery_04', 'Hùng Gà Tân Uyên', 'Gà ta', 18, 13, false],
  ['dispatch_05', 'delivery_05', 'Phương Vịt Thủ Dầu', 'Vịt sống', 42, 15, false],
];
const dispatches = Object.fromEntries(dispatchRows.map(([id, customerId, customerNameSnapshot, productNameSnapshot, weightKg, hour]) => [id, {
  id, companyId: 'comp_preview', date: today, createdAt: timestampAt(hour), customerId,
  customerNameSnapshot, productNameSnapshot, productShortNameSnapshot: productNameSnapshot,
  quantityUnit: 'Con', weightKg, quantity: 0, isArchived: false,
}]));
const reports = Object.fromEntries(dispatchRows.filter((row) => row[6]).map(([id, customerId, , productNameSnapshot, weightKg, hour]) => {
  const dispatchId = id.replace('dispatch', 'dispatch');
  const reportId = `report_${id}`;
  return [reportId, {
    id: reportId, companyId: 'comp_preview', customerId, dispatchId, date: today,
    productNameSnapshot, actualWeightKg: weightKg, actualQuantity: 0,
    collectedAmount: 1200000 + weightKg * 1000, collectedMethod: 'Chuyển khoản',
    createdAt: timestampAt(hour + 1), isArchived: false,
  }];
}));
const previewStore = {
  customers,
  warehouseDispatches: dispatches,
  deliveryReports: reports,
};

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
    { name: 'desktop-1280', width: 1280, height: 800 },
    { name: 'desktop-1366', width: 1366, height: 768 },
    { name: 'desktop-1440', width: 1440, height: 900 },
    { name: 'desktop-1920', width: 1920, height: 1080 },
  ]) {
    const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
    const page = await context.newPage();
    const consoleErrors = [];
    const pageErrors = [];
    const requestFailures = [];
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('requestfailed', (request) => requestFailures.push(`${request.url()}: ${request.failure()?.errorText || 'failed'}`));
    await page.addInitScript(({ token, store }) => {
      window.__initial_auth_token = token;
      window.localStorage.setItem('hd-manager-local-db-v2-clean-preview', JSON.stringify(store));
    }, { token: authToken, store: viewport.width === 320 ? {} : previewStore });
    const response = await page.goto(baseUrl, { waitUntil: 'commit', timeout: 20000 });
    assert.equal(response?.status(), 200, `${viewport.name}: local app must return HTTP 200`);
    try {
      await page.waitForSelector('[data-hd-shell="enterprise"]', { timeout: 20000 });
    } catch (error) {
      await page.screenshot({ path: `${outputDir}/${viewport.name}-boot-error.png`, fullPage: false });
      const bodyText = await page.locator('body').innerText().catch(() => '');
      throw new Error(`${viewport.name}: app shell did not mount; console=${JSON.stringify(consoleErrors)}; pageErrors=${JSON.stringify(pageErrors)}; body=${bodyText.slice(0, 1200)}; cause=${error.message}`);
    }

    if (viewport.width < 600) {
      await page.locator('[data-hd-navigation="bottom"]').getByRole('button', { name: 'Thêm', exact: true }).click();
      assert.equal(await page.getByText('Đang dùng:', { exact: false }).count(), 0, `${viewport.name}: More must not show appearance controls.`);
      assert.equal(await page.getByText('Thông báo chấm công', { exact: true }).count(), 0, `${viewport.name}: More must not show attendance alerts.`);
      await page.getByRole('button', { name: 'Báo cáo giao hàng', exact: true }).click();
    } else if (viewport.width < 1024) {
      const rail = page.locator('[data-hd-navigation="rail"]');
      await rail.getByRole('button', { name: 'Thêm', exact: true }).click();
      assert.equal(await page.getByText('Đang dùng:', { exact: false }).count(), 0, `${viewport.name}: More must not show appearance controls.`);
      assert.equal(await page.getByText('Thông báo chấm công', { exact: true }).count(), 0, `${viewport.name}: More must not show attendance alerts.`);
      await page.getByRole('button', { name: 'Báo cáo giao hàng', exact: true }).click();
    } else {
      const sidebar = page.locator('[data-hd-navigation="sidebar"]');
      await sidebar.getByRole('button', { name: 'Thêm', exact: true }).click();
      assert.equal(await page.getByText('Đang dùng:', { exact: false }).count(), 0, `${viewport.name}: More must not show appearance controls.`);
      assert.equal(await page.getByText('Thông báo chấm công', { exact: true }).count(), 0, `${viewport.name}: More must not show attendance alerts.`);
      await page.getByRole('button', { name: 'Báo cáo giao hàng', exact: true }).click();
    }

    const module = page.locator('[data-hd-module="delivery"]');
    await module.waitFor({ state: 'visible', timeout: 10000 });
    await page.getByRole('button', { name: 'Bắt đầu giao hàng', exact: false }).waitFor({ timeout: 10000 });
    const overviewEmptyState = module.locator('.hd-ds-state--empty');
    if (viewport.width === 320) {
      assert.equal(await overviewEmptyState.getByRole('heading').innerText(), 'Chưa có chuyến giao', `${viewport.name}: an empty delivery overview must use the shared empty-state component.`);
    } else {
      try {
        await page.getByRole('button', { name: /Phương Vịt Thủ Dầu/ }).waitFor({ timeout: 10000 });
      } catch (error) {
        await page.screenshot({ path: `${outputDir}/${viewport.name}-overview-data-error.png`, fullPage: false });
        throw new Error(`${viewport.name}: preview customer fixture was not rendered; module=${(await module.innerText()).slice(0, 1600)}; cause=${error.message}`);
      }
    }

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
        overviewTitleWidth: overviewTitle.getBoundingClientRect().width,
        overviewTitleFontSize: Number.parseFloat(getComputedStyle(overviewTitle).fontSize),
        overviewTitleColor: getComputedStyle(overviewTitle).color,
        overviewTitleFits: overviewTitle.scrollWidth <= overviewTitle.clientWidth,
        overviewHeroBackgroundImage: getComputedStyle(hero).backgroundImage,
        iconButtons,
      };
    });
    await page.screenshot({ path: `${outputDir}/${viewport.name}-overview.png`, fullPage: false });
    assert.ok(geometry.documentWidth <= geometry.viewportWidth + 1, `${viewport.name}: document must not overflow horizontally (${JSON.stringify(geometry)})`);
    assert.equal(geometry.overviewStatsColumns, 3, `${viewport.name}: delivery overview KPIs must remain in three aligned columns (${JSON.stringify(geometry)})`);
    assert.ok(geometry.overviewHeroBackgroundImage.includes('linear-gradient'), `${viewport.name}: overview must use the delivery hero token treatment (${JSON.stringify(geometry)})`);
    assert.ok(geometry.overviewTitleFontSize <= 28 && geometry.overviewTitleHeight <= 36 && geometry.overviewTitleFits, `${viewport.name}: overview headline must fit the delivery hero scale (${JSON.stringify(geometry)})`);
    assert.equal(geometry.overviewTitleColor, 'rgb(255, 255, 255)', `${viewport.name}: delivery hero title must retain white contrast (${JSON.stringify(geometry)})`);
    assert.ok(geometry.iconButtons.length >= 2, `${viewport.name}: overview should expose the delivery icon actions`);
    assert.ok(geometry.iconButtons.every(({ width, height }) => width >= 44 && height >= 44), `${viewport.name}: icon actions must meet the shared 44px touch target (${JSON.stringify(geometry.iconButtons)})`);

    if (viewport.width === 390) {
      const themeBefore = await module.getAttribute('data-hd-theme');
      await page.getByRole('button', { name: 'Thao tác nhanh', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Thao tác nhanh' });
      await dialog.waitFor({ state: 'visible' });
      const toggle = dialog.getByRole('button', { name: /Giao diện/ });
      await toggle.click();
      const expectedTheme = themeBefore === 'dark' ? 'light' : 'dark';
      await page.waitForFunction((theme) => document.querySelector('[data-hd-module="delivery"]')?.dataset.hdTheme === theme, expectedTheme);
      await page.waitForTimeout(200);
      const sheetSurface = await dialog.evaluate((element) => getComputedStyle(element).backgroundColor);
      assert.equal(sheetSurface, expectedTheme === 'dark' ? 'rgb(15, 23, 42)' : 'rgb(255, 255, 255)', 'Quick actions must follow the app-wide theme as it changes.');
      if (expectedTheme === 'dark') {
        const tileSurface = await dialog.getByRole('button', { name: 'Chờ giao', exact: true }).evaluate((element) => ({
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
      await dialog.getByRole('button', { name: 'Đóng thao tác nhanh', exact: true }).click();

      await page.getByRole('button', { name: 'Bắt đầu giao hàng', exact: false }).click();
      await page.screenshot({ path: `${outputDir}/mobile-list.png`, fullPage: false });
      const listIconButtons = await module.locator('.hd-ds-button--icon').evaluateAll((buttons) => buttons.map((button) => {
        const rect = button.getBoundingClientRect();
        return { width: rect.width, height: rect.height, label: button.getAttribute('aria-label') };
      }));
      assert.ok(listIconButtons.length >= 3 && listIconButtons.every(({ width, height }) => width >= 44 && height >= 44), `mobile list: icon controls must preserve 44px targets (${JSON.stringify(listIconButtons)})`);
      await page.getByRole('button', { name: 'Bộ lọc', exact: true }).click();
      const filterDialog = page.getByRole('dialog', { name: 'Bộ lọc giao hàng' });
      await filterDialog.waitFor({ state: 'visible' });
      const filterSurface = await filterDialog.evaluate((element) => getComputedStyle(element).backgroundColor);
      assert.equal(filterSurface, themeBefore === 'dark' ? 'rgb(15, 23, 42)' : 'rgb(255, 255, 255)', 'Delivery filter sheet must follow the shared theme.');
      assert.ok(await filterDialog.locator('label').filter({ hasText: /^Khu vực/ }).isVisible());
      assert.ok(await filterDialog.locator('legend').filter({ hasText: 'Thời gian' }).isVisible());
      assert.ok(await filterDialog.locator('label').filter({ hasText: /^Phương thức thanh toán/ }).isVisible());
      await page.screenshot({ path: `${outputDir}/mobile-list-filter.png`, fullPage: false });
      await filterDialog.getByRole('button', { name: 'Đóng bộ lọc', exact: true }).click();

      await page.getByRole('button', { name: 'Tìm khách hàng...' }).click();
      const searchInput = page.getByPlaceholder('Tìm khách hàng...');
      await searchInput.fill('Toàn Mua');
      await page.waitForTimeout(325);
      assert.equal(await page.getByText('1 kết quả', { exact: true }).count(), 1, 'Debounced search should show the matching customer count.');
      await page.screenshot({ path: `${outputDir}/mobile-search.png`, fullPage: false });
      await page.getByRole('button', { name: 'Quay lại danh sách' }).click();

      await page.getByRole('button', { name: 'Toàn Mua Lồng Vịt' }).click();
      await module.getByRole('heading', { name: 'Chi tiết khách hàng' }).waitFor();
      assert.equal(await module.getByText('VIP', { exact: true }).count(), 0, 'The detail view must not invent customer loyalty tags.');
      await page.screenshot({ path: `${outputDir}/mobile-detail.png`, fullPage: false });
      await page.getByRole('button', { name: 'Chỉ đường' }).click();
      await module.getByTitle('Bản đồ Toàn Mua Lồng Vịt').waitFor({ state: 'visible' });
      await page.waitForFunction(() => [...document.querySelectorAll('iframe[title^="Bản đồ "]')].some((frame) => frame.src.includes('maps.google.com/maps?q=')));
      await page.waitForTimeout(2000);
      const mapFrame = page.frames().find((frame) => frame.url().includes('google.com/maps'));
      assert.ok(mapFrame, `Directions must render the saved customer destination in Google Maps. frames=${JSON.stringify(page.frames().map((frame) => frame.url()))}; requests=${JSON.stringify(requestFailures)}`);
      await mapFrame.waitForLoadState('load', { timeout: 15000 });
      await page.waitForTimeout(1200);
      await page.screenshot({ path: `${outputDir}/mobile-directions.png`, fullPage: false });
      await module.locator('button[title="Quay lại"]').click();
      await page.getByRole('button', { name: 'Xác nhận giao hàng' }).click();
      await page.getByRole('heading', { name: 'Xác nhận giao hàng' }).waitFor();
      await page.screenshot({ path: `${outputDir}/mobile-confirmation.png`, fullPage: false });
      await page.getByRole('button', { name: 'Chuyển khoản', exact: true }).click();
      await page.getByPlaceholder('Số tiền nhận').fill('1200000');
      await page.getByRole('button', { name: 'Hoàn thành', exact: true }).click();
      await page.getByRole('heading', { name: 'Giao hàng thành công!' }).waitFor({ timeout: 15000 });
      await page.screenshot({ path: `${outputDir}/mobile-success.png`, fullPage: false });
      await page.getByRole('button', { name: 'Tiếp tục giao hàng' }).click();
      await page.getByRole('button', { name: 'Lịch sử giao hàng' }).click();
      await module.getByRole('heading', { name: 'Lịch sử giao hàng' }).waitFor();
      await page.screenshot({ path: `${outputDir}/mobile-history.png`, fullPage: false });
      await module.locator('button[title="Quay lại"]').click();
      await module.locator('button[title="Quay lại"]').click();
      await page.getByRole('button', { name: 'Báo cáo nhanh' }).click();
      await module.getByRole('heading', { name: 'Chuyến theo giờ' }).waitFor();
      await page.screenshot({ path: `${outputDir}/mobile-report.png`, fullPage: false });
    }

    assert.deepEqual(consoleErrors, [], `${viewport.name}: browser console must be clean`);
    assert.deepEqual(pageErrors, [], `${viewport.name}: browser must have no uncaught errors`);
    await context.close();
  }
} finally {
  await browser.close();
}

console.log('Delivery design-system visual checks passed on mobile and desktop.');
