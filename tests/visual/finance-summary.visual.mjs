import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';

const baseUrl = process.env.HD_MANAGER_VISUAL_QA_URL || 'http://127.0.0.1:5206/';
const outputDir = process.env.HD_MANAGER_FINANCE_OUTPUT || 'test-results/finance-summary';
const browserPath = process.env.HD_MANAGER_VISUAL_QA_BROWSER_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const claims = {
  uid: 'emp_admin', identityId: 'emp_admin', appUserId: 'emp_admin', companyId: 'comp_preview',
  companyName: 'Công ty HD Preview', accountType: 'employee', role: 'super_admin',
  name: 'Quản trị Demo', phone: '0909000001'
};
const authToken = `hd-preview-auth-v1:${encodeURIComponent(JSON.stringify(claims))}`;
const date = new Date();
const today = `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, '0')}-${`${date.getDate()}`.padStart(2, '0')}`;
const expenses = Object.fromEntries(Array.from({ length: 4 }, (_, index) => {
  const id = `finance_visual_expense_${index}`;
  return [id, {
    id, companyId: 'comp_preview', date: today, category: 'Chi xăng dầu',
    note: `Kiểm tra bố cục ${index + 1}`, amount: index === 0 ? 1234567890 : 150000 + index * 10000,
    empId: 'emp_admin', status: 'paid'
  }];
}));

await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ executablePath: browserPath, headless: true });
try {
  for (const width of [320, 360, 390, 430, 768, 1280]) {
    const page = await browser.newPage({ viewport: { width, height: width >= 1024 ? 900 : 844 }, deviceScaleFactor: 1 });
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    await page.addInitScript(({ token, data }) => {
      window.__initial_auth_token = token;
      localStorage.setItem('hd-manager-local-db-v2-clean-preview', JSON.stringify(data));
    }, { token: authToken, data: { expenses } });
    const response = await page.goto(baseUrl, { waitUntil: 'commit', timeout: 30000 });
    assert.equal(response?.status(), 200);
    try {
      await page.locator('[data-hd-shell="enterprise"]').waitFor({ timeout: 60000 });
    } catch (error) {
      throw new Error(`${width}px: app shell unavailable; page errors: ${pageErrors.join(' | ')}; body: ${(await page.locator('body').innerText()).slice(0, 500)}`, { cause: error });
    }
    const navigation = page.locator(`[data-hd-navigation="${width >= 1024 ? 'sidebar' : width >= 600 ? 'rail' : 'bottom'}"]`);
    const directFinance = navigation.getByRole('button', { name: 'Thu chi', exact: true });
    if (await directFinance.isVisible().catch(() => false)) {
      await directFinance.click();
    } else {
      await navigation.getByRole('button', { name: 'Thêm', exact: true }).click();
      await page.getByRole('button', { name: 'Thu chi', exact: true }).click();
    }
    await page.locator('.hd-header-title').getByText('Tổng kết ngày', { exact: true }).waitFor();

    const summary = page.locator('main.hd-app-content .grid.grid-cols-3.divide-x').first();
    await summary.waitFor();
    assert.deepEqual(await summary.locator('span').allTextContents(), ['Tổng thu', 'Tổng chi', 'Lợi nhuận']);
    await page.getByRole('heading', { name: 'Danh sách thu chi' }).waitFor();
    await page.getByText('Kiểm tra bố cục 1', { exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Khoản chi', exact: true }).count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Khoản thu', exact: true }).count(), 0);
    if (width >= 768) {
      assert.equal(await page.getByRole('button', { name: 'Mở thao tác thu chi' }).count(), 1);
      assert.equal(await page.getByRole('button', { name: 'Mở thao tác nhanh' }).count(), 0);
      assert.equal(await page.getByRole('button', { name: 'Phím tắt nhanh' }).count(), 0);
    } else {
      assert.equal(await page.getByRole('button', { name: 'Mở thao tác thu chi' }).count(), 0);
      assert.equal(await page.getByRole('button', { name: 'Mở thao tác nhanh' }).count(), 1);
    }

    const geometry = await page.evaluate(() => {
      const summary = document.querySelector('main.hd-app-content .grid.grid-cols-3.divide-x');
      const footer = document.querySelector('.mobile-footer-nav');
      const add = document.querySelector('button[aria-label="Mở thao tác nhanh"]');
      return {
        viewportWidth: innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        summaryOverflow: [...summary.children].some(child => child.scrollWidth > child.clientWidth + 1),
        footerTop: footer?.getBoundingClientRect().top,
        addBottom: add?.getBoundingClientRect().bottom,
        addWidth: add?.getBoundingClientRect().width
      };
    });
    assert.ok(geometry.documentWidth <= geometry.viewportWidth + 1, `${width}px: horizontal overflow ${JSON.stringify(geometry)}`);
    assert.equal(geometry.summaryOverflow, false, `${width}px: summary value overflow ${JSON.stringify(geometry)}`);
    if (width < 600) {
      assert.ok(geometry.addBottom < geometry.footerTop, `${width}px: add button overlaps footer ${JSON.stringify(geometry)}`);
      assert.ok(geometry.addWidth < 60, `${width}px: add button must not occupy the full dock`);
    }
    assert.deepEqual(pageErrors, [], `${width}px: page errors`);
    await page.screenshot({ path: `${outputDir}/finance-${width}.png` });

    if (width === 390 || width === 768 || width === 1280) {
      await page.getByRole('button', { name: width === 390 ? 'Mở thao tác nhanh' : 'Mở thao tác thu chi' }).click();
      const incomeAction = width === 390 ? page.getByRole('menuitem', { name: 'Khoản thu', exact: true }) : page.getByRole('button', { name: 'Khoản thu', exact: true });
      const expenseAction = width === 390 ? page.getByRole('menuitem', { name: 'Khoản chi', exact: true }) : page.getByRole('button', { name: 'Khoản chi', exact: true });
      await incomeAction.waitFor();
      await expenseAction.waitFor();
      await page.screenshot({ path: `${outputDir}/finance-menu-${width}.png` });
      await expenseAction.click();
      await page.getByRole('heading', { name: 'Tạo khoản chi' }).waitFor();
      await page.getByRole('button', { name: 'Hủy', exact: true }).click();
      await page.getByRole('button', { name: width === 390 ? 'Mở thao tác nhanh' : 'Mở thao tác thu chi' }).click();
      await incomeAction.click();
      await page.getByRole('heading', { name: 'Ghi nhận khoản thu' }).waitFor();
    }
    await page.close();
  }
  console.log(`Finance visual test passed: ${outputDir}`);
} finally {
  await browser.close();
}
