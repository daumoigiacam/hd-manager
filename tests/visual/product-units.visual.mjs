import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
const url = process.env.HD_MANAGER_PRODUCT_EDITOR_URL || 'http://127.0.0.1:5226/';
assert.equal(new URL(url).hostname, '127.0.0.1');
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
await mkdir('test-results/product-units', { recursive: true });
try {
  for (const width of [320, 390, 1366]) {
    const page = await browser.newPage({ viewport: { width, height: 844 } });
    await page.addInitScript(() => {
      window.__initial_auth_token = `hd-preview-auth-v1:${encodeURIComponent(JSON.stringify({ uid: 'emp_admin', identityId: 'emp_admin', appUserId: 'emp_admin', companyId: 'comp_preview', accountType: 'employee', role: 'super_admin', name: 'Preview' }))}`;
    });
    await page.goto(url);
    if (width < 600) {
      await page.locator('[data-hd-navigation="bottom"]').getByRole('button', { name: 'Thêm', exact: true }).click();
      await page.getByRole('button', { name: 'Kho sản phẩm', exact: true }).click();
    } else await page.locator('[data-hd-navigation="sidebar"]').getByRole('button', { name: 'Sản phẩm', exact: true }).click();
    await page.locator('main').getByRole('button', { name: 'Thêm sản phẩm', exact: true }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Tạo sản phẩm', exact: true });
    await dialog.waitFor();
    assert.equal(await dialog.getByLabel('Mã vạch / SKU', { exact: true }).count(), 0);
    assert.equal(await dialog.getByRole('button', { name: 'Quét mã từ ảnh hoặc QR' }).count(), 0);
    await dialog.getByLabel('Tên sản phẩm', { exact: true }).fill('Sản phẩm thử đơn vị');
    await dialog.getByLabel('Đơn vị nhập', { exact: true }).fill('Con');
    await dialog.getByLabel('Đơn vị bán', { exact: true }).fill('Kg');
    await dialog.getByLabel('Đơn vị tồn', { exact: true }).fill('Con');
    assert.equal(await dialog.getByLabel('Đơn vị nhập', { exact: true }).inputValue(), 'Con');
    assert.equal(await dialog.getByLabel('Đơn vị bán', { exact: true }).inputValue(), 'Kg');
    assert(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth));
    await dialog.evaluate(async el => {
      await Promise.all(el.getAnimations({ subtree: true }).map(animation => animation.finished.catch(() => {})));
      el.querySelector('.hd-product-editor__body').scrollTop = 0;
    });
    await page.screenshot({ path: `test-results/product-units/${width}.png` });
    await dialog.getByLabel('Nhóm hàng', { exact: true }).fill('Nhóm thử');
    await dialog.getByLabel('Giá bán', { exact: true }).fill('60000');
    await dialog.getByLabel('Tồn đầu', { exact: true }).fill('12');
    await dialog.getByRole('button', { name: 'Lưu', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    await page.locator('.hd-product-list__primary').filter({ hasText: 'Sản Phẩm Thử Đơn Vị' }).first().click();
    const edit = page.getByRole('dialog', { name: 'Sửa sản phẩm', exact: true });
    await edit.waitFor();
    assert.equal(await edit.getByLabel('Đơn vị nhập', { exact: true }).inputValue(), 'Con');
    assert.equal(await edit.getByLabel('Đơn vị bán', { exact: true }).inputValue(), 'Kg');
    assert.equal(await edit.getByLabel('Đơn vị tồn', { exact: true }).inputValue(), 'Con');
    assert.equal(await edit.getByLabel('Tồn đầu', { exact: true }).inputValue(), '12');
    await page.close();
  }
  console.log('PASS product units form at 320, 390, 1366');
} finally { await browser.close(); }
