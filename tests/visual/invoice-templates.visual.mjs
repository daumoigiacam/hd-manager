import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';

const baseUrl = process.env.HD_MANAGER_INVOICE_QA_URL || 'http://127.0.0.1:5207/tests/visual/invoice-harness.html';
const outputDir = process.env.HD_MANAGER_INVOICE_QA_OUTPUT || 'test-results/invoice-templates';
const browserPath = process.env.HD_MANAGER_VISUAL_QA_BROWSER_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const cases = ['base', 'discount', 'promotion', 'fee', 'combined', 'old-debt', 'partial', 'paid'];
await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ executablePath: browserPath, headless: true });
try {
  for (let number = 1; number <= 10; number += 1) {
    const templateId = `template-${`${number}`.padStart(2, '0')}`;
    for (const width of [320, 360, 375, 390, 414, 768, 1024]) {
      const page = await browser.newPage({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      const response = await page.goto(`${baseUrl}?template=${templateId}`, { waitUntil: 'domcontentloaded' });
      assert.equal(response?.status(), 200);
      const invoice = page.locator('.invoice-document');
      await invoice.waitFor();
      assert.equal(await invoice.getAttribute('data-invoice-template'), templateId);
      assert.equal(await invoice.locator('.invoice-bank__qr img').count(), 1, 'QR present');
      if (width === 390) {
        const productImage = invoice.locator('.invoice-product-image img').first();
        assert.ok(await productImage.evaluate(async (image) => {
          await image.decode();
          return image.naturalWidth > 0;
        }), `${templateId} product image loaded`);
      }
      const bounds = await page.evaluate(() => ({ viewport: innerWidth, scroll: document.documentElement.scrollWidth, invoice: document.querySelector('.invoice-document').getBoundingClientRect().width }));
      assert.ok(bounds.scroll <= bounds.viewport + 2, `${templateId} ${width}px horizontal overflow: ${JSON.stringify(bounds)}`);
      assert.deepEqual(errors, [], `${templateId} ${width}px runtime errors`);
      if ([320, 390, 768, 1024].includes(width)) await page.screenshot({ path: `${outputDir}/${templateId}-${width}.png`, fullPage: true });
      if (width === 390) {
        const exports = await page.evaluate(async () => {
          const { invoiceNodeToPngBlob, invoiceNodeToPdfBlob, renderInvoiceImageBlob } = await import('/src/features/invoice-templates/InvoiceTemplateWorkspace.jsx');
          const node = document.querySelector('.invoice-document');
          const png = await invoiceNodeToPngBlob(node);
          const a4 = await invoiceNodeToPdfBlob(node, 'a4');
          const a5 = await invoiceNodeToPdfBlob(node, 'a5');
          const share = await renderInvoiceImageBlob(window.__invoiceModel, window.__invoiceModel.templateId);
          return [png.size, a4.size, a5.size, share.size];
        });
        assert.ok(exports.every((size) => size > 5000), `${templateId} PNG/A4/A5/share export: ${exports}`);
        if (number === 6) {
          const printed = await page.pdf({ path: `${outputDir}/template-06-a5-print.pdf`, format: 'A5', printBackground: true });
          assert.ok(printed.length > 5000, 'A5 browser print must not be blank');
        }
      }
      await page.close();
    }
    for (const scenario of cases) {
      const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
      await page.goto(`${baseUrl}?template=${templateId}&scenario=${scenario}`, { waitUntil: 'domcontentloaded' });
      const pricing = page.locator('.invoice-pricing');
      await pricing.waitFor();
      assert.match(await pricing.innerText(), /Tổng cộng/);
      assert.match(await pricing.innerText(), /Còn phải thu|Tổng phải thu/);
      if (['discount', 'combined'].includes(scenario)) assert.match(await pricing.innerText(), /Giảm giá/);
      if (['promotion', 'combined'].includes(scenario)) assert.match(await pricing.innerText(), /Khuyến mãi/);
      if (['fee', 'combined'].includes(scenario)) assert.match(await pricing.innerText(), /Phí giao hàng/);
      if (scenario === 'combined') assert.match(await pricing.innerText(), /1\.398\.000/);
      if (scenario === 'paid') assert.match(await page.locator('.invoice-document').innerText(), /ĐÃ THANH TOÁN/);
      await page.close();
    }
  }
  console.log('Invoice visual QA: 10 templates, 7 widths, 8 financial cases passed.');
} finally {
  await browser.close();
}
