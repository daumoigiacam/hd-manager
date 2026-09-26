import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';

const baseUrl = process.env.HD_MANAGER_VISUAL_QA_URL || 'http://127.0.0.1:5204/';
const outputDir = process.env.HD_MANAGER_BUSINESS_REPORT_OUTPUT || 'test-results/business-report';
const browserPath = process.env.HD_MANAGER_VISUAL_QA_BROWSER_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const claims = { uid: 'emp_admin', identityId: 'emp_admin', appUserId: 'emp_admin', companyId: 'comp_preview', companyName: 'Công ty HD Preview', accountType: 'employee', role: 'super_admin', name: 'Quản trị Demo', phone: '0909000001' };
const authToken = `hd-preview-auth-v1:${encodeURIComponent(JSON.stringify(claims))}`;
const dateKey = (offset) => {
  const date = new Date();
  date.setDate(date.getDate() - offset);
  return `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, '0')}-${`${date.getDate()}`.padStart(2, '0')}`;
};
const products = {
  report_product_chicken: { id: 'report_product_chicken', companyId: 'comp_preview', name: 'Gà ta', shortName: 'Gà ta', price: 65000, cost: 48000, stock: 500 },
  report_product_duck: { id: 'report_product_duck', companyId: 'comp_preview', name: 'Vịt sống', shortName: 'Vịt sống', price: 58000, cost: 42000, stock: 340 },
  report_product_spice: { id: 'report_product_spice', companyId: 'comp_preview', name: 'Gia vị', shortName: 'Gia vị', price: 85000, cost: 61000, stock: 200 },
};
const orders = Object.fromEntries(Array.from({ length: 7 }, (_, index) => {
  const id = `report_order_${index}`;
  const quantity = 20 + index * 5;
  const productId = index % 3 === 0 ? 'report_product_chicken' : index % 3 === 1 ? 'report_product_duck' : 'report_product_spice';
  const product = products[productId];
  return [id, { id, companyId: 'comp_preview', customerId: index % 2 ? 'c_preview_01' : 'c_preview_02', customerName: index % 2 ? 'Cửa hàng Lan Anh' : 'Tạp hóa Hưng Phát', date: dateKey(index), amount: quantity * product.price, total: quantity * product.price, items: [{ productId, productName: product.name, quantity, unitPrice: product.price, costPrice: product.cost, total: quantity * product.price }], status: 'completed' }];
}));
const expenses = Object.fromEntries(Array.from({ length: 6 }, (_, index) => {
  const id = `report_expense_${index}`;
  return [id, { id, companyId: 'comp_preview', date: dateKey(index), category: index % 2 ? 'Xăng dầu' : 'Điện nước', amount: 150000 + index * 25000, status: 'paid' }];
}));
const store = { products, orders, expenses };

await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ executablePath: browserPath, headless: true });
try {
  for (const width of [320, 360, 375, 390, 414, 430, 768, 1280]) {
    const page = await browser.newPage({ viewport: { width, height: width < 600 ? 844 : 900 }, deviceScaleFactor: 1 });
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.addInitScript(({ token, data }) => {
      window.__initial_auth_token = token;
      localStorage.setItem('hd-manager-local-db-v2-clean-preview', JSON.stringify(data));
    }, { token: authToken, data: store });
    const response = await page.goto(baseUrl, { waitUntil: 'commit', timeout: 30000 });
    assert.equal(response?.status(), 200);
    await page.locator('[data-hd-shell="enterprise"]').waitFor({ timeout: 30000 });
    if (width >= 1024) {
      await page.locator('.hd-premium-dashboard').waitFor({ timeout: 15000 });
      await page.screenshot({ path: `${outputDir}/desktop-${width}.png` });
      await page.close();
      continue;
    }
    const report = page.locator('.business-report-workspace');
    await report.waitFor({ timeout: 15000 });
    await report.locator('.business-report-header > strong').waitFor();
    assert.equal(await report.locator('.business-report-header > strong').innerText(), 'Công ty HD Preview');
    assert.equal(await report.locator('.business-report-kpi').count(), 4, 'Home shows exactly four totals');
    assert.equal(await report.locator('.business-report-section').count(), 1, 'Home shows only the insights section below totals');
    await report.getByRole('heading', { name: 'Nhận định & gợi ý' }).waitFor();
    assert.equal(await report.locator('.business-report-hero, .business-report-greeting, .business-report-assistant-fab').count(), 0, 'Home hides other secondary sections');
    await report.locator('.business-report-date-button').waitFor();
    const geometry = await page.evaluate(() => ({
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: innerWidth,
      kpiColumns: getComputedStyle(document.querySelector('.business-report-kpi-grid')).gridTemplateColumns.split(' ').length,
      cardOverflow: [...document.querySelectorAll('.business-report-kpi')].some((card) => card.scrollWidth > card.clientWidth + 1),
      metricRowsAligned: [...document.querySelectorAll('.business-report-kpi__metric-row')].every((row) => {
        const value = row.querySelector('.business-report-kpi__value').getBoundingClientRect();
        const comparison = row.lastElementChild.getBoundingClientRect();
        const bounds = row.getBoundingClientRect();
        return Math.abs(value.bottom - comparison.bottom) < 7 && comparison.right <= bounds.right + 1 && value.right < comparison.left;
      }),
      footerTop: document.querySelector('.mobile-footer-nav')?.getBoundingClientRect().top,
      cardsBottom: document.querySelector('.business-report-kpi-grid')?.getBoundingClientRect().bottom,
      insightsTop: document.querySelector('.business-report-insights, .business-report-empty')?.closest('.business-report-section')?.getBoundingClientRect().top,
    }));
    assert.ok(geometry.documentWidth <= geometry.viewportWidth + 1, `${width}px: horizontal overflow ${JSON.stringify(geometry)}`);
    assert.equal(geometry.kpiColumns, 2, `${width}px: KPI grid must have two columns`);
    assert.equal(geometry.cardOverflow, false, `${width}px: KPI cards must not overflow`);
    assert.equal(geometry.metricRowsAligned, true, `${width}px: amounts and changes must share a row`);
    assert.ok(geometry.insightsTop >= geometry.cardsBottom, `${width}px: insights must follow the four totals`);
    if (width < 600) {
      assert.ok(geometry.cardsBottom < geometry.footerTop, `${width}px: totals must not be hidden by the footer`);
    }
    assert.deepEqual(pageErrors, [], `${width}px: page errors`);
    await page.screenshot({ path: `${outputDir}/home-${width}.png` });
    if (width < 600) {
      await page.locator('main.hd-app-content').evaluate((element) => { element.scrollTop = element.scrollHeight; });
      const bottomBounds = await page.evaluate(() => ({
        contentBottom: document.querySelector('.business-report-content')?.lastElementChild?.getBoundingClientRect().bottom,
        footerTop: document.querySelector('.mobile-footer-nav')?.getBoundingClientRect().top,
      }));
      assert.ok(bottomBounds.contentBottom < bottomBounds.footerTop, `${width}px: last report section must clear footer ${JSON.stringify(bottomBounds)}`);
      await page.locator('main.hd-app-content').evaluate((element) => { element.scrollTop = 0; });
    }
    if (width === 390) {
      const homeDebtLabel = await report.locator('.business-report-kpi--receivables').getAttribute('title');
      const todayRevenue = await report.locator('.business-report-kpi--revenue').getAttribute('title');
      const dateDialog = report.getByRole('dialog', { name: 'Chọn thời gian báo cáo' });
      for (const label of ['Tuần', 'Tháng', 'Quý', 'Năm']) {
        await report.locator('.business-report-date-button').click();
        await dateDialog.getByRole('button', { name: label, exact: true }).click();
        assert.match(await report.locator('.business-report-date-button').innerText(), new RegExp(label));
      }
      assert.notEqual(await report.locator('.business-report-kpi--revenue').getAttribute('title'), todayRevenue, 'Home totals follow the chosen period');
      await report.locator('.business-report-date-button').click();
      await dateDialog.getByLabel('Từ ngày').fill(dateKey(1));
      await dateDialog.getByLabel('Đến ngày').fill(dateKey(0));
      await dateDialog.getByRole('button', { name: 'Áp dụng' }).click();
      assert.match(await report.locator('.business-report-date-button').innerText(), /–/);
      await report.locator('.business-report-kpi--revenue').click();
      await report.getByRole('heading', { name: 'Báo cáo chi tiết' }).waitFor();
      await report.getByRole('heading', { name: 'Top sản phẩm' }).waitFor();
      await report.getByRole('button', { name: 'Mở Trợ lý AI' }).click();
      await page.getByRole('dialog', { name: 'Trợ lý AI' }).waitFor();
      await page.screenshot({ path: `${outputDir}/assistant-${width}.png` });
      await page.getByRole('button', { name: 'Đóng trợ lý AI' }).click();
      await page.screenshot({ path: `${outputDir}/detail-${width}.png` });
      await report.getByRole('button', { name: /Xem tất cả/ }).first().click();
      await report.getByRole('heading', { name: 'Sản phẩm', exact: true }).waitFor();
      await page.screenshot({ path: `${outputDir}/products-${width}.png` });
      await report.getByRole('tab', { name: 'Tồn kho', exact: true }).click();
      await report.getByRole('heading', { name: 'Tồn theo hồ sơ sản phẩm' }).waitFor();
      await report.getByRole('tab', { name: 'Doanh thu', exact: true }).click();
      await report.locator('.business-report-ranked-row').first().click();
      await report.getByRole('heading', { name: 'Chi tiết sản phẩm' }).waitFor();
      await page.screenshot({ path: `${outputDir}/product-detail-${width}.png` });
      await report.locator('.business-report-subheader button').click();
      await report.locator('.business-report-subheader button').click();
      assert.equal(await report.locator('.business-report-kpi').count(), 4);
      assert.match(await report.locator('.business-report-date-button').innerText(), /–/, 'Filter persists after returning home');
      await report.locator('.business-report-date-button').click();
      await dateDialog.getByRole('button', { name: 'Hôm nay', exact: true }).click();
      await report.locator('.business-report-kpi--profit').click();
      await report.getByRole('heading', { name: 'Lợi nhuận', exact: true }).first().waitFor();
      await page.screenshot({ path: `${outputDir}/profit-${width}.png` });
      await report.locator('.business-report-subheader button').click();
      await report.locator('.business-report-kpi--expense').click();
      await report.getByRole('heading', { name: 'Chi phí', exact: true }).waitFor();
      await page.screenshot({ path: `${outputDir}/costs-${width}.png` });
      await report.getByRole('tab', { name: 'Chi tiết', exact: true }).click();
      await report.getByRole('heading', { name: 'Chi phí theo thời gian' }).waitFor();
      await report.getByRole('tab', { name: 'Theo khoản', exact: true }).click();
      await report.getByRole('heading', { name: 'Top chi phí tháng' }).waitFor();
      await report.locator('.business-report-subheader button').click();
      await report.locator('.business-report-kpi--receivables').click();
      await report.getByRole('heading', { name: 'Công nợ', exact: true }).waitFor();
      await page.screenshot({ path: `${outputDir}/debt-${width}.png` });
      await report.getByRole('button', { name: 'Mở sổ nợ' }).click();
      const debtSummary = page.locator('.premium-debt-module > div:first-child > div:first-child p').first();
      await debtSummary.waitFor();
      assert.ok(homeDebtLabel?.includes(await debtSummary.innerText()), 'Home receivables must match Sổ nợ total');
    }
    await page.close();
    console.log(`PASS business report ${width}px`);
  }
} finally {
  await browser.close();
}
