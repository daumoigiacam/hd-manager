import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { BinaryBitmap, HybridBinarizer, QRCodeReader, RGBLuminanceSource } from '@zxing/library';

const browserPath = process.env.HD_MANAGER_VISUAL_QA_BROWSER_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const baseUrl = process.env.HD_MANAGER_INVOICE_APP_URL || 'http://127.0.0.1:5207/';
const claims = { uid: 'emp_admin', identityId: 'emp_admin', appUserId: 'emp_admin', companyId: 'comp_preview', companyName: 'Công ty HD Preview', accountType: 'employee', role: 'super_admin', name: 'Quản trị Demo', phone: '0909000001' };
const token = `hd-preview-auth-v1:${encodeURIComponent(JSON.stringify(claims))}`;
const store = {
  companies: { comp_preview: { id: 'comp_preview', name: 'Công ty HD Preview', ownerPhone: '0909000001', bankId: 'STB', bankName: 'Sacombank', bankAccountName: 'HOANG VAN DUC', bankAccountNumber: '050086470672', invoiceTemplateId: 'template-07' } },
  customers: { c_invoice: { id: 'c_invoice', companyId: 'comp_preview', name: 'Khách kiểm thử hóa đơn', phone: '0909123456', address: 'Bình Dương', isArchived: false } },
  products: { p_invoice: { id: 'p_invoice', companyId: 'comp_preview', name: 'Gà Móc Sạch Cắt Chân', price: 60000, image: '/invoice/white-chicken-farm.webp', isArchived: false } },
  orders: { o_invoice: { id: 'o_invoice', companyId: 'comp_preview', customerId: 'c_invoice', date: '2026-09-27', createdAt: '2026-09-27T09:00:00+07:00', amount: 1818000, discount: 0, customerExtraExpense: 0, status: 'unpaid', reviewStatus: 'approved', isArchived: false, items: [{ productId: 'p_invoice', description: 'Gà Móc Sạch Cắt Chân', quantity: 30.3, quantityUnit: 'Kg', unitPrice: 60000, amount: 1818000 }] } },
};
const browser = await chromium.launch({ executablePath: browserPath, headless: true });
try {
  await mkdir('test-results/invoice-templates', { recursive: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, acceptDownloads: true });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(({ initialToken, initialStore }) => {
    window.__initial_auth_token = initialToken;
    localStorage.setItem('hd_performance_monitor', 'true');
    window.__invoiceShareCalls = [];
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: ({ files }) => Boolean(files?.length) });
    Object.defineProperty(navigator, 'share', { configurable: true, value: async ({ files = [] }) => {
      window.__invoiceShareCalledAt = performance.now();
      window.__invoiceShareCalls.push(await Promise.all(files.map(async (file) => ({
        name: file.name,
        size: file.size,
        mime: file.type,
        signature: Array.from(new Uint8Array(await file.slice(0, 8).arrayBuffer()))
      }))));
    } });
    if (!localStorage.getItem('hd-manager-local-db-v2-clean-preview')) {
      localStorage.setItem('hd-manager-local-db-v2-clean-preview', JSON.stringify(initialStore));
    }
  }, { initialToken: token, initialStore: store });
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-hd-shell="enterprise"]').waitFor({ timeout: 30000 });
  await page.locator('[data-hd-navigation="bottom"]').getByRole('button', { name: 'Thêm', exact: true }).click();
  await page.getByRole('button', { name: 'Cài đặt', exact: true }).last().click();
  assert.equal(await page.getByRole('button', { name: /Mẫu hóa đơn/ }).count(), 0);
  assert.equal(await page.locator('.invoice-settings').count(), 0);
  await page.screenshot({ path: 'test-results/invoice-templates/settings-mobile.png', fullPage: true });

  await page.locator('[data-hd-navigation="bottom"]').getByRole('button', { name: 'Đơn hàng', exact: true }).click();
  await page.getByRole('button', { name: /Khách kiểm thử hóa đơn/ }).first().click();
  await page.locator('.hd-order-detail-layer').waitFor();
  await page.waitForFunction(() => Boolean(document.elementFromPoint(80, 20)?.closest('.hd-order-detail-layer')));
  assert.equal(await page.locator('.hd-order-detail-header h2').evaluate((node) => getComputedStyle(node).color), 'rgb(255, 255, 255)');
  assert.equal(await page.locator('.hd-order-detail-content .invoice-document').count(), 0);
  assert.equal(await page.getByRole('button', { name: 'Mẫu hóa đơn', exact: true }).count(), 0);
  assert.equal(await page.getByRole('button', { name: 'Xem hóa đơn', exact: true }).count(), 0);
  assert.equal(await page.getByText('Chi tiết và thao tác').count(), 0);
  assert.equal(await page.locator('.hd-order-detail-content section[aria-label="Thao tác hóa đơn"]').count(), 1);
  assert.equal(await page.locator('[aria-label="Thông tin hóa đơn"] h3').first().innerText(), 'Khách kiểm thử hóa đơn');
  assert.equal(await page.locator('.hd-order-detail-content button[title="Sửa số lượng"]').count(), 1);
  assert.ok(await page.locator('.hd-order-detail-content button[title="Sửa số lượng"]').isVisible());
  await page.screenshot({ path: 'test-results/invoice-templates/order-detail-mobile.png' });
  await page.locator('.hd-order-detail-content button[title="Sửa số lượng"]').click();
  await page.getByLabel('Số lượng').fill('31.3');
  const editStartedAt = Date.now();
  await page.getByRole('button', { name: 'Lưu thay đổi' }).click();
  await page.getByText('Đã lưu tạm thay đổi hóa đơn, đang đồng bộ.', { exact: true }).waitFor({ timeout: 30000 });
  await page.locator('.hd-order-detail-content').getByText(/1\.878\.000/).first().waitFor({ timeout: 15000 });
  await page.evaluate(() => { window.__invoiceCacheRecords = []; window.__invoiceCacheReading = false; });
  await page.waitForFunction((startedAt) => {
    const ready = window.__invoiceCacheRecords.some(record => record.scope === 'sales_order_invoice'
      && record.entityId === 'o_invoice' && record.createdAt >= startedAt
      && record.sourceKey.includes('1878000') && record.payload?.blob?.size > 5000);
    if (ready || window.__invoiceCacheReading) return ready;
    window.__invoiceCacheReading = true;
    const request = indexedDB.open('hd-manager-share-image-cache');
    request.onerror = () => { window.__invoiceCacheReading = false; };
    request.onsuccess = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('assets')) { db.close(); window.__invoiceCacheReading = false; return; }
      const records = db.transaction('assets', 'readonly').objectStore('assets').getAll();
      records.onerror = () => { db.close(); window.__invoiceCacheReading = false; };
      records.onsuccess = () => {
        window.__invoiceCacheRecords = records.result;
        window.__invoiceCacheReading = false;
        db.close();
      };
    };
    return false;
  }, editStartedAt, { timeout: 5000 }).catch(async error => {
    console.log(JSON.stringify(await page.evaluate(() => ({
      startup: window.__HD_STARTUP_TIMING__, events: window.hdPerformanceMonitor?.events(),
      records: window.__invoiceCacheRecords.map(record => ({ sourceKey: record.sourceKey, scope: record.scope, entityId: record.entityId })),
    }))));
    throw error;
  });
  const cacheWarmMs = Date.now() - editStartedAt;
  const updatedShareCache = await page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open('hd-manager-share-image-cache');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const records = request.result.transaction('assets', 'readonly').objectStore('assets').getAll();
      records.onerror = () => reject(records.error);
      records.onsuccess = () => resolve(records.result
        .filter((record) => record.scope === 'sales_order_invoice' && record.entityId === 'o_invoice')
        .map((record) => ({ createdAt: record.createdAt, sourceKey: record.sourceKey, bytes: record.payload?.blob?.size || 0 })));
    };
  }));
  assert.ok(updatedShareCache.some((record) => record.createdAt >= editStartedAt && record.sourceKey.includes('classic-v1') && record.bytes > 5000), `Background preparation must persist the updated invoice, not the previous version: ${JSON.stringify(updatedShareCache)}`);
  const pngDataUrl = await page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open('hd-manager-share-image-cache');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const records = request.result.transaction('assets', 'readonly').objectStore('assets').getAll();
      records.onerror = () => reject(records.error);
      records.onsuccess = () => {
        const record = records.result
          .filter((item) => item.scope === 'sales_order_invoice' && item.entityId === 'o_invoice' && item.sourceKey.includes('classic-v1'))
          .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0))[0];
        if (!record?.payload?.blob) return reject(new Error('Missing classic invoice PNG'));
        const reader = new FileReader();
        reader.onerror = () => reject(reader.error);
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(record.payload.blob);
      };
    };
  }));
  await writeFile('test-results/invoice-templates/classic-share-invoice.png', Buffer.from(pngDataUrl.split(',')[1], 'base64'));
  const qrPixels = await page.evaluate(async (invoiceDataUrl) => {
    const image = new Image();
    image.src = invoiceDataUrl;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = 190;
    canvas.height = 190;
    canvas.getContext('2d').drawImage(image, 90, 595, 190, 190, 0, 0, 190, 190);
    const pixels = canvas.getContext('2d').getImageData(0, 0, 190, 190).data;
    return Array.from({ length: 190 * 190 }, (_, index) => {
      const offset = index * 4;
      return (pixels[offset] + 2 * pixels[offset + 1] + pixels[offset + 2]) / 4;
    });
  }, pngDataUrl);
  const qrPayload = new QRCodeReader().decode(new BinaryBitmap(new HybridBinarizer(
    new RGBLuminanceSource(Uint8ClampedArray.from(qrPixels), 190, 190)
  ))).getText();
  assert.ok(qrPayload.includes('970403') && qrPayload.includes('050086470672') && qrPayload.includes('1878000') && qrPayload.includes('TT HDNVOICE'), `The refreshed invoice QR must encode the printed bank account, edited amount and transfer memo: ${qrPayload}`);
  const shareClickStartedAt = await page.evaluate(() => performance.now());
  await page.getByRole('button', { name: 'Chia sẻ hóa đơn' }).click();
  await page.waitForFunction(() => window.__invoiceShareCalls.length > 0, null, { timeout: 30000 });
  const shareOpenMs = await page.evaluate((startedAt) => window.__invoiceShareCalledAt - startedAt, shareClickStartedAt);
  assert.ok(shareOpenMs < 1500, `Cached invoice share should open promptly, observed ${Math.round(shareOpenMs)}ms.`);
  const sharedFile = (await page.evaluate(() => window.__invoiceShareCalls.at(-1)))[0];
  assert.match(sharedFile.name, /hoa-don-ban-hang\.png$/);
  assert.equal(sharedFile.mime, 'image/png');
  assert.ok(sharedFile.size > 5000);
  assert.deepEqual(sharedFile.signature, [137, 80, 78, 71, 13, 10, 26, 10]);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('[data-hd-shell="enterprise"]').waitFor({ timeout: 30000 });
  await page.waitForFunction(() => {
    const visible = node => node && node.getBoundingClientRect().height > 0;
    return visible(document.querySelector('.hd-order-detail-content'))
      || visible(document.querySelector('[data-hd-navigation="bottom"]'));
  }, null, { timeout: 15000 }).catch(async error => {
    await page.screenshot({ path: 'test-results/invoice-templates/reload-failure.png' });
    console.log(JSON.stringify(await page.evaluate(() => ({
      text: document.body.innerText.slice(0, 4000), startup: window.__HD_STARTUP_TIMING__,
    })).catch(() => ({ errors }))));
    throw error;
  });
  if (!await page.locator('.hd-order-detail-content').count()) {
    await page.locator('[data-hd-navigation="bottom"]').getByRole('button', { name: 'Đơn hàng', exact: true }).click();
    await page.getByRole('button', { name: /Khách kiểm thử hóa đơn/ }).first().click();
  }
  assert.equal(await page.locator('.hd-order-detail-content .invoice-document').count(), 0);
  assert.match(await page.locator('.hd-order-detail-content').innerText(), /1\.878\.000/);
  const reloadShareStartedAt = await page.evaluate(() => performance.now());
  await page.getByRole('button', { name: 'Chia sẻ hóa đơn' }).click();
  await page.waitForFunction(() => window.__invoiceShareCalls.length > 0, null, { timeout: 30000 });
  const reloadShareOpenMs = await page.evaluate((startedAt) => window.__invoiceShareCalledAt - startedAt, reloadShareStartedAt);
  assert.ok(reloadShareOpenMs < 1500, `Persisted invoice share should open promptly after reload, observed ${Math.round(reloadShareOpenMs)}ms.`);
  assert.deepEqual(errors, []);
  console.log(`Invoice settings integration: classic share/cache, QR decode, compact order detail and reload passed; cache prepared in ${cacheWarmMs}ms; share opened in ${Math.round(shareOpenMs)}ms from memory and ${Math.round(reloadShareOpenMs)}ms after reload.`);
} finally { await browser.close(); }
