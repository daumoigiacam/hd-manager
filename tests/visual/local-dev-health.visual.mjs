import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';

const baseUrl = 'http://127.0.0.1:5213/';
const deadline = setTimeout(() => { console.error('Local dev health timeout'); process.exit(1); }, 60000);
const output = 'test-results/local-dev-health';
let browser;
try {
  await mkdir(output, { recursive: true });
  for (const path of ['src/main.jsx', 'src/App.jsx']) {
    const response = await fetch(new URL(path, baseUrl), { signal: AbortSignal.timeout(15000) });
    assert.equal(response.status, 200, `${path} must compile, not just index.html`);
    assert.ok(!String(await response.text()).includes('The service is no longer running'));
  }
  browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  for (const width of [390, 1366]) {
    const page = await browser.newPage({ viewport: { width, height: 844 } });
    const pageErrors = [];
    const failedModules = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    page.on('response', response => {
      if (response.url().startsWith(baseUrl) && response.status() >= 400
        && ['script', 'stylesheet'].includes(response.request().resourceType())) {
        failedModules.push({ url: response.url(), status: response.status() });
      }
    });
    // No authentication or company data writes during this render-only check.
    await page.route('**/*', route => route.request().url().startsWith(baseUrl)
      || route.request().url().startsWith('data:') ? route.continue() : route.abort());
    for (let attempt = 0; attempt < 2; attempt++) {
      if (attempt === 0) await page.goto(baseUrl, { waitUntil: 'commit', timeout: 20000 });
      else await page.reload({ waitUntil: 'commit', timeout: 20000 });
      await page.getByPlaceholder('S\u1ed1 \u0111i\u1ec7n tho\u1ea1i', { exact: true }).waitFor({ timeout: 20000 });
      assert.equal(await page.locator('vite-error-overlay').count(), 0);
      assert.equal(await page.getByText('App \u0111ang g\u1eb7p l\u1ed7i l\u00fac hi\u1ec3n th\u1ecb', { exact: true }).count(), 0);
      assert.deepEqual(pageErrors, []);
      assert.deepEqual(failedModules, []);
    }
    await page.screenshot({ path: `${output}/login-${width}.png` });
    console.log(JSON.stringify({ width, attempts: 2, appRendered: true, pageErrors, failedModules }));
    await page.close();
  }
  console.log('PASS local dev modules, actual login render and reload on mobile/desktop');
} finally {
  await browser?.close();
  clearTimeout(deadline);
}
