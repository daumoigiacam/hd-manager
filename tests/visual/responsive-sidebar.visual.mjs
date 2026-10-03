import assert from 'node:assert/strict';
import { build, preview } from 'vite';
import { chromium } from 'playwright-core';
const deadline = setTimeout(() => { console.error('Sidebar verification timeout'); process.exit(1); }, 180000);
Object.assign(process.env, { VITE_DATA_MODE: 'preview', VITE_ALLOW_PREVIEW_BUILD: 'true' });
const outDir = 'test-results/responsive-sidebar';
await build({ build: { outDir }, logLevel: 'error' });
const server = await preview({ build: { outDir }, preview: { host: '127.0.0.1', port: 0 } });
const url = `http://127.0.0.1:${server.httpServer.address().port}/`;
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => route.request().url().startsWith(url) || route.request().url().startsWith('data:') ? route.continue() : route.abort());
  await page.addInitScript(() => {
    window.__initial_auth_token = `hd-preview-auth-v1:${encodeURIComponent(JSON.stringify({ uid: 'emp_admin', identityId: 'emp_admin', appUserId: 'emp_admin', companyId: 'comp_preview', accountType: 'employee', role: 'super_admin', name: 'Preview' }))}`;
  });
  await page.goto(url);
  await page.locator('[data-hd-shell="enterprise"]').waitFor();
  for (const width of [390, 767, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const navigation = page.locator(`[data-hd-navigation="${width >= 768 ? 'sidebar' : 'bottom'}"]`);
    await navigation.waitFor({ state: 'visible' });
    await navigation.getByRole('button', { name: 'Thêm', exact: true }).click();
    await page.locator('.hd-more-menu').waitFor();
    const main = await page.locator('main').boundingBox();
    const nav = await navigation.boundingBox();
    if (width >= 768) assert.ok(nav.x + nav.width <= main.x + 1, 'Sidebar must not overlap content');
    assert.ok(main.x + main.width <= width + 1, 'Content fits viewport');
    await page.screenshot({ path: `${outDir}/${width}.png`, animations: 'disabled' });
    await navigation.getByRole('button', { name: 'Trang chủ', exact: true }).click();
    await page.locator('.business-report-workspace').waitFor({ state: 'visible' });
    if (width >= 768) {
      await navigation.getByRole('button', { name: 'Thu gọn thanh điều hướng' }).click();
      assert.ok((await navigation.boundingBox()).width < 100);
      await navigation.getByRole('button', { name: 'Mở rộng thanh điều hướng' }).click();
    }
    console.log(`${width}: navigation, content bounds, home and collapse PASS`);
    await navigation.getByRole('button', { name: width >= 768 ? 'Đơn đặt' : 'Đặt hàng', exact: true }).click();
    const toolbar = page.locator('.hd-request-toolbar');
    await toolbar.waitFor();
    const boxes = await toolbar.locator(':scope > *').evaluateAll(elements => elements.map(el => {
      const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right };
    }));
    assert.equal(boxes.length, 3);
    assert.ok(boxes.every(box => Math.abs(box.y - boxes[0].y) < 2));
    assert.ok(boxes[0].right <= boxes[1].x && boxes[1].right <= boxes[2].x);
    assert.equal(await page.getByText('TỔNG ĐƠN ĐẶT HÀNG', { exact: true }).count(), 0);
    await page.screenshot({ path: `${outDir}/${width}-requests.png`, animations: 'disabled' });
  }
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  await new Promise(resolve => server.httpServer.close(resolve));
  clearTimeout(deadline);
}
