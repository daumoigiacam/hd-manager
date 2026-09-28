import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';

const baseUrl = process.env.HD_MANAGER_VISUAL_QA_URL || 'http://127.0.0.1:5216/';
const browserPath = process.env.HD_MANAGER_VISUAL_QA_BROWSER_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const outputDir = 'test-results/android-safe-area';
const claims = {
  uid: 'emp_admin', identityId: 'emp_admin', appUserId: 'emp_admin',
  companyId: 'comp_preview', companyName: 'Công ty HD Preview',
  accountType: 'employee', role: 'super_admin', name: 'Quản trị Demo', phone: '0909000001',
};
const authToken = `hd-preview-auth-v1:${encodeURIComponent(JSON.stringify(claims))}`;

await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ executablePath: browserPath, headless: true });
try {
  for (const width of [390, 480, 540]) {
    const page = await browser.newPage({ viewport: { width, height: 844 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript((token) => {
      window.__initial_auth_token = token;
      localStorage.setItem('hd-manager-local-db-v2-clean-preview', '{}');
    }, authToken);
    await page.goto(baseUrl, { waitUntil: 'commit' });
    await page.locator('.business-report-header').waitFor();
    await page.evaluate(() => {
      const root = document.documentElement;
      root.dataset.hdAndroidNative = 'true';
      root.style.setProperty('--hd-native-safe-top', '28px');
      root.style.setProperty('--hd-native-safe-bottom', '24px');
      root.style.setProperty('--hd-native-safe-left', '0px');
      root.style.setProperty('--hd-native-safe-right', '0px');
    });
    const home = await page.evaluate(() => {
      const shell = document.querySelector('.mobile-app-shell');
      const header = document.querySelector('.business-report-header');
      const title = header.querySelector('strong');
      const footer = document.querySelector('.hd-app-navigation');
      const footerButton = footer.querySelector('button');
      return {
        shell: shell.getBoundingClientRect().toJSON(),
        header: header.getBoundingClientRect().toJSON(),
        title: title.getBoundingClientRect().toJSON(),
        footer: footer.getBoundingClientRect().toJSON(),
        footerButton: footerButton.getBoundingClientRect().toJSON(),
        headerColor: getComputedStyle(header).backgroundColor,
        footerColor: getComputedStyle(footer).backgroundColor,
        documentWidth: document.documentElement.scrollWidth,
      };
    });
    assert.equal(home.shell.width, width, `${width}px: shell should fill the phone width`);
    assert.equal(home.header.top, 0, `${width}px: header must reach the top edge`);
    assert.ok(home.title.top >= 28, `${width}px: title must clear the status bar`);
    assert.equal(home.headerColor, 'rgb(255, 255, 255)', `${width}px: home header must stay white`);
    assert.ok(home.footerButton.bottom <= home.footer.bottom - 24, `${width}px: footer must clear system navigation`);
    assert.ok(home.documentWidth <= width + 1, `${width}px: no horizontal overflow`);
    await page.screenshot({ path: `${outputDir}/home-${width}.png` });

    await page.locator('[data-hd-navigation="bottom"] button').filter({ hasText: 'Đơn hàng' }).click();
    await page.locator('.hd-app-header .hd-header-title').waitFor();
    const detail = await page.evaluate(() => {
      const header = document.querySelector('.hd-app-header');
      const title = header.querySelector('.hd-header-title');
      return {
        header: header.getBoundingClientRect().toJSON(),
        title: title.getBoundingClientRect().toJSON(),
        backgroundImage: getComputedStyle(header).backgroundImage,
        backgroundColor: getComputedStyle(header).backgroundColor,
      };
    });
    assert.equal(detail.header.top, 0, `${width}px: module header must reach the top edge`);
    assert.ok(detail.title.top >= 28, `${width}px: module title must clear the status bar`);
    assert.ok(
      detail.backgroundImage !== 'none' || detail.backgroundColor !== 'rgba(0, 0, 0, 0)',
      `${width}px: module header color must extend behind the status bar`
    );
    assert.deepEqual(errors, [], `${width}px: page errors`);
    await page.screenshot({ path: `${outputDir}/orders-${width}.png` });
    await page.close();
    console.log(`PASS simulated Android safe area ${width}px`);
  }
} finally {
  await browser.close();
}
