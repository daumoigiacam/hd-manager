import assert from 'node:assert/strict';
import { build, preview } from 'vite';
import { chromium } from 'playwright-core';

const deadline = setTimeout(() => { console.error('Weight viewport timeout'); process.exit(1); }, 180000);
Object.assign(process.env, { VITE_DATA_MODE: 'preview', VITE_ALLOW_PREVIEW_BUILD: 'true' });
const outDir = 'test-results/weight-viewport-preview';
await build({ build: { outDir }, logLevel: 'error' });
const server = await preview({ build: { outDir }, preview: { host: '127.0.0.1', port: 0 } });
const url = `http://127.0.0.1:${server.httpServer.address().port}/`;
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
try {
  for (const width of [390, 768]) {
    const page = await browser.newPage({ viewport: { width, height: 844 }, hasTouch: true });
    page.setDefaultTimeout(15000);
    await page.route('**/*', route => route.request().url().startsWith(url) || route.request().url().startsWith('data:') ? route.continue() : route.abort());
    await page.addInitScript(() => {
      window.__initial_auth_token = `hd-preview-auth-v1:${encodeURIComponent(JSON.stringify({ uid: 'emp_admin', identityId: 'emp_admin', appUserId: 'emp_admin', companyId: 'comp_preview', accountType: 'employee', role: 'super_admin' }))}`;
      const now = new Date();
      const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      localStorage.setItem('hd-manager-local-db-v2-clean-preview', JSON.stringify({
        warehouseDispatches: Object.fromEntries(Array.from({ length: 31 }, (_, i) => [`qa_${i}`, {
          id: `qa_${i}`, companyId: 'comp_preview', date, customerId: `qa_customer_${i}`,
          customerNameSnapshot: `Test Customer ${i}`, productId: 'prod_preview_01',
          productNameSnapshot: 'Product', quantity: 2, quantityUnit: 'Con', weightKg: 3,
        }]))
      }));
      navigator.canShare = () => true;
      navigator.share = async ({ files }) => { window.__sharedFiles = files.map(file => ({ name: file.name, size: file.size })); };
    });
    await page.goto(url, { waitUntil: 'commit' });
    await page.getByRole('button', { name: 'Xuất kho', exact: true }).filter({ visible: true }).first().click();
    assert.equal(await page.getByText('Đơn Thiếu', { exact: true }).count(), 0);
    const driver = page.getByRole('combobox', { name: 'Chọn nhân sự giao hàng', exact: true });
    const reset = page.getByRole('button', { name: 'Làm mới', exact: true });
    await driver.scrollIntoViewIfNeeded();
    const driverBounds = await driver.boundingBox();
    const resetBounds = await reset.boundingBox();
    assert(Math.abs(driverBounds.y - resetBounds.y) < 2);
    assert(driverBounds.x + driverBounds.width <= resetBounds.x);
    assert.equal(await page.getByRole('button', { name: 'Lưu lại', exact: true }).count(), 1);
    await page.screenshot({ path: `test-results/dispatch-driver-actions-${width}.png` });
    assert.equal(await page.getByText('DS xuất kho - Ngày', { exact: true }).count(), 0);
    const search = page.getByRole('searchbox', { name: 'Tìm kiếm phiếu xuất kho trong ngày', exact: true });
    await search.click();
    assert.equal(await page.getByRole('dialog').count(), 0);
    await search.fill('Test');
    assert.equal(await search.evaluate(el => getComputedStyle(el).borderTopWidth), '0px');
    await page.getByRole('button', { name: 'Chia sẻ', exact: true }).first().click();
    await page.waitForFunction(() => window.__sharedFiles?.length >= 3);
    assert((await page.evaluate(() => window.__sharedFiles)).every(file => file.size > 0));
    assert.equal(await page.getByText('Da mo bang chia se phieu xuat kho.', { exact: true }).count(), 0);
    assert.equal(await page.getByRole('alert').count(), 0);
    await page.getByRole('button', { name: 'Nhập các lần cân kg', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Nhập các lần cân', exact: true });
    await dialog.waitFor();
    await dialog.getByRole('textbox', { name: 'Lần cân 1', exact: true }).fill('30');
    await dialog.getByRole('textbox', { name: 'Lần cân 2', exact: true }).fill('40,5');
    // Emulate the geometry supplied by the shared visualViewport adapter on iOS.
    for (const height of [400, 280]) {
      await page.evaluate(height => {
        Object.defineProperty(window.visualViewport, 'height', { configurable: true, get: () => height });
        Object.defineProperty(window.visualViewport, 'offsetTop', { configurable: true, get: () => 40 });
        window.visualViewport.dispatchEvent(new Event('resize'));
      }, height);
      await page.waitForTimeout(100);
      const bounds = await dialog.locator('.hd-weight-modal-panel').boundingBox();
      console.log({ width, height, bounds, layer: await dialog.boundingBox() });
      assert(bounds.y >= 40 && bounds.y + bounds.height <= 40 + height + 1);
      if (width < 768) assert(Math.abs(bounds.y + bounds.height - (40 + height)) < 1);
      await dialog.getByRole('button', { name: 'Cập nhật', exact: true }).scrollIntoViewIfNeeded();
      const button = await dialog.getByRole('button', { name: 'Cập nhật', exact: true }).boundingBox();
      assert(button.y >= 40 && button.y + button.height <= 40 + height + 1);
    }
    await page.screenshot({ path: `test-results/weight-viewport-${width}.png` });
    await dialog.getByRole('button', { name: 'Cập nhật', exact: true }).click();
    await dialog.waitFor({ state: 'detached' });
    assert.match(await page.getByRole('button', { name: 'Nhập các lần cân kg', exact: true }).innerText(), /70,5/);
    await page.close();
  }
  console.log('PASS weight viewport, scrollable confirmation, sum and removed shortage heading');
} finally {
  await browser.close();
  await new Promise(resolve => server.httpServer.close(resolve));
  clearTimeout(deadline);
}
