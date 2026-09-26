import assert from 'node:assert/strict';
import { mkdir, stat } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { PNG } from 'pngjs';
import { BinaryBitmap, HybridBinarizer, QRCodeReader, RGBLuminanceSource } from '@zxing/library';

const decodeQr = (dataUrl) => {
  const image = PNG.sync.read(Buffer.from(dataUrl.split(',')[1], 'base64'));
  const luminance = new Uint8ClampedArray(image.width * image.height);
  for (let index = 0; index < luminance.length; index += 1) {
    const pixel = index * 4;
    luminance[index] = (image.data[pixel] + image.data[pixel + 1] * 2 + image.data[pixel + 2]) / 4;
  }
  return new QRCodeReader().decode(new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(luminance, image.width, image.height)))).getText();
};

const browserPath = process.env.HD_MANAGER_VISUAL_QA_BROWSER_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const baseUrl = process.env.HD_MANAGER_INVOICE_APP_URL || 'http://127.0.0.1:5207/';
const claims = { uid: 'emp_admin', identityId: 'emp_admin', appUserId: 'emp_admin', companyId: 'comp_preview', companyName: 'Công ty HD Preview', accountType: 'employee', role: 'super_admin', name: 'Quản trị Demo', phone: '0909000001' };
const token = `hd-preview-auth-v1:${encodeURIComponent(JSON.stringify(claims))}`;
const store = {
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
    if (!localStorage.getItem('hd-manager-local-db-v2-clean-preview')) {
      localStorage.setItem('hd-manager-local-db-v2-clean-preview', JSON.stringify(initialStore));
    }
  }, { initialToken: token, initialStore: store });
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-hd-shell="enterprise"]').waitFor({ timeout: 30000 });
  await page.locator('[data-hd-navigation="bottom"]').getByRole('button', { name: 'Thêm', exact: true }).click();
  await page.getByRole('button', { name: 'Cài đặt', exact: true }).last().click();
  const settings = page.locator('.invoice-settings');
  await page.getByRole('button', { name: /Mẫu hóa đơn.*10 mẫu/ }).click();
  await settings.waitFor({ timeout: 15000 });
  assert.equal(await settings.locator('.invoice-settings__option').count(), 10);
  await page.screenshot({ path: 'test-results/invoice-templates/settings-mobile.png', fullPage: true });
  for (let number = 1; number <= 10; number += 1) {
    const id = `template-${String(number).padStart(2, '0')}`;
    await settings.getByRole('button', { name: new RegExp(`Mẫu ${String(number).padStart(2, '0')}`) }).click();
    if (number > 1) {
      await settings.getByRole('button', { name: 'Áp dụng' }).click();
      await settings.getByText('Đã áp dụng mẫu cho hóa đơn của công ty.').waitFor({ timeout: 15000 });
    }
    await settings.getByRole('button', { name: /Xem trước/ }).click();
    const selectedPreview = page.getByRole('dialog');
    await selectedPreview.waitFor();
    assert.equal(await selectedPreview.locator('.invoice-document').getAttribute('data-invoice-template'), id);
    await selectedPreview.getByRole('button', { name: 'Đóng xem trước' }).click();
  }
  await settings.getByRole('button', { name: /Mẫu 07/ }).click();
  await settings.getByRole('button', { name: 'Áp dụng' }).click();
  await settings.getByText('Đã áp dụng mẫu cho hóa đơn của công ty.').waitFor({ timeout: 15000 });
  await settings.getByRole('button', { name: /Xem trước/ }).click();
  const dialog = page.getByRole('dialog', { name: /Premium Sang trọng/ });
  await dialog.waitFor();
  assert.equal(await dialog.locator('.invoice-document').getAttribute('data-invoice-template'), 'template-07');
  assert.equal(await dialog.locator('.invoice-bank__qr img').count(), 1);
  const baseQr = decodeQr(await dialog.locator('.invoice-bank__qr img').getAttribute('src'));
  assert.match(baseQr, /970403/);
  assert.match(baseQr, /050086470672/);
  assert.match(baseQr, /1818000/);
  await page.screenshot({ path: 'test-results/invoice-templates/preview-mobile.png' });
  for (const [buttonName, extension] of [['PDF', '.pdf'], ['Ảnh', '.png']]) {
    const downloadPromise = page.waitForEvent('download', { timeout: 30000 });
    await dialog.getByRole('button', { name: buttonName, exact: true }).click();
    const download = await downloadPromise;
    assert.ok(download.suggestedFilename().endsWith(extension));
    assert.ok((await stat(await download.path())).size > 5000);
  }
  await dialog.getByRole('button', { name: 'Đóng xem trước' }).click();
  await settings.getByLabel('Trường hợp xem trước').selectOption('combined');
  await settings.getByRole('button', { name: /Xem trước/ }).click();
  const adjustedDialog = page.getByRole('dialog', { name: /Premium Sang trọng/ });
  await adjustedDialog.locator('.invoice-bank__qr img').waitFor();
  const adjustedQr = decodeQr(await adjustedDialog.locator('.invoice-bank__qr img').getAttribute('src'));
  assert.notEqual(adjustedQr, baseQr);
  assert.match(adjustedQr, /1398000/);
  assert.match(await adjustedDialog.locator('.invoice-pricing').innerText(), /1\.698\.000/);
  await adjustedDialog.getByRole('button', { name: 'Đóng xem trước' }).click();

  await page.locator('[data-hd-navigation="bottom"]').getByRole('button', { name: 'Đơn hàng', exact: true }).click();
  await page.getByRole('button', { name: /Khách kiểm thử hóa đơn/ }).first().click();
  await page.locator('.hd-order-detail-layer').waitFor();
  await page.locator('.hd-order-detail-layer > .hd-order-detail-content .invoice-document').waitFor({ timeout: 15000 });
  assert.equal(await page.locator('.hd-order-detail-content .invoice-document').getAttribute('data-invoice-template'), 'template-07');
  assert.match(decodeQr(await page.locator('.hd-order-detail-content .invoice-bank__qr img').getAttribute('src')), /1818000/);
  await page.screenshot({ path: 'test-results/invoice-templates/order-detail-mobile.png' });
  await page.getByRole('button', { name: 'Mẫu hóa đơn', exact: true }).click();
  await page.getByRole('menuitem', { name: /03 · Thanh toán nhanh/ }).click();
  await page.getByText('Đã lưu mẫu riêng cho hóa đơn.').waitFor({ timeout: 15000 });
  await page.locator('.hd-order-detail-content .invoice-document[data-invoice-template="template-03"]').waitFor({ timeout: 15000 });
  await page.getByRole('button', { name: 'Xem hóa đơn' }).click();
  const orderDialog = page.getByRole('dialog', { name: 'Hóa đơn bán hàng' });
  await orderDialog.waitFor();
  assert.equal(await orderDialog.locator('.invoice-document').getAttribute('data-invoice-template'), 'template-03');
  await orderDialog.getByRole('button', { name: 'Đóng xem trước' }).click();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.evaluate(async (authToken) => {
    const { getAuth, signInWithCustomToken } = await import('/src/mocks/firebase-auth.js');
    await signInWithCustomToken(getAuth(), authToken);
  }, token);
  await page.locator('[data-hd-shell="enterprise"]').waitFor({ timeout: 30000 });
  await page.locator('.hd-order-detail-content .invoice-document, [data-hd-navigation="bottom"] button').first().waitFor({ timeout: 15000 });
  if (!await page.locator('.hd-order-detail-content .invoice-document').count()) {
    await page.locator('[data-hd-navigation="bottom"]').getByRole('button', { name: 'Đơn hàng', exact: true }).click();
    await page.getByRole('button', { name: /Khách kiểm thử hóa đơn/ }).first().click();
  }
  await page.locator('.hd-order-detail-content .invoice-document[data-invoice-template="template-03"]').waitFor({ timeout: 15000 });
  await page.getByRole('button', { name: 'Mẫu hóa đơn', exact: true }).click();
  await page.getByRole('menuitem', { name: /Mặc định công ty/ }).click();
  await page.locator('.hd-order-detail-content .invoice-document[data-invoice-template="template-07"]').waitFor({ timeout: 15000 });
  assert.deepEqual(errors, []);
  console.log('Invoice settings integration: 10 defaults, preview, override, reload and fallback passed.');
} finally { await browser.close(); }
