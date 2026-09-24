import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';

const baseUrl = process.env.HD_MANAGER_GLOBAL_SEARCH_URL || 'http://127.0.0.1:5181/';
const outputDir = process.env.HD_MANAGER_GLOBAL_SEARCH_OUTPUT || 'test-results/visual-qa-unified-state';
const browserPath = process.env.HD_MANAGER_VISUAL_QA_BROWSER_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const claims = {
  uid: 'emp_admin',
  identityId: 'emp_admin',
  appUserId: 'emp_admin',
  companyId: 'comp_preview',
  companyName: 'Công ty HD Preview',
  accountType: 'employee',
  role: 'super_admin',
  name: 'Quản trị Demo',
  phone: '0909000001',
};
const previewToken = `hd-preview-auth-v1:${encodeURIComponent(JSON.stringify(claims))}`;
const browser = await chromium.launch({ headless: true, executablePath: browserPath });
const viewportRuns = [
  { width: 320, height: 720 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1366, height: 768 },
];
const results = [];

try {
  for (const viewport of viewportRuns) {
    const context = await browser.newContext({ viewport, isMobile: viewport.width < 600, hasTouch: viewport.width < 600 });
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    await page.addInitScript(token => { window.__initial_auth_token = token; }, previewToken);
    const response = await page.goto(baseUrl, { waitUntil: 'commit', timeout: 20000 });
    assert.equal(response?.status(), 200, `HTTP response at ${viewport.width}px`);
    await page.waitForSelector('[data-hd-shell="enterprise"]', { timeout: 20000 });
    await page.waitForTimeout(900);

    const trigger = page.locator('.hd-header-global-search-button:visible').first();
    assert.ok(await trigger.count(), `global search trigger is visible at ${viewport.width}px`);
    await trigger.click();
    const dialog = page.locator('.hd-shell-search-popover');
    const input = dialog.locator('.hd-shell-search-input-wrap input');
    await input.waitFor({ state: 'visible' });
    await page.waitForFunction(() => document.activeElement?.matches('.hd-shell-search-input-wrap input'));

    const initialMetrics = await page.evaluate(() => {
      const box = selector => {
        const rect = document.querySelector(selector)?.getBoundingClientRect();
        return rect ? { width: rect.width, height: rect.height } : null;
      };
      return {
        viewportWidth: window.innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        close: box('.hd-shell-search-dialog-header button'),
        inputWrap: box('.hd-shell-search-input-wrap'),
        results: [...document.querySelectorAll('.hd-shell-search-results button[data-global-search-result]')]
          .map(button => button.getBoundingClientRect().height),
        pointerOutline: `${getComputedStyle(document.querySelector('.hd-shell-search-input-wrap')).outlineWidth} ${getComputedStyle(document.querySelector('.hd-shell-search-input-wrap')).outlineStyle}`,
        focusMode: document.querySelector('.hd-shell-search-input-wrap input')?.closest('.hd-enterprise-app-shell')?.dataset.hdInputFocusMode || '',
        inputSearchMarker: document.querySelector('.hd-shell-search-input-wrap input')?.getAttribute('data-hd-search-input'),
        inputFocusVisible: document.querySelector('.hd-shell-search-input-wrap input')?.matches(':focus-visible') || false,
        inputOutline: `${getComputedStyle(document.querySelector('.hd-shell-search-input-wrap input')).outlineWidth} ${getComputedStyle(document.querySelector('.hd-shell-search-input-wrap input')).outlineStyle}`,
        wrapOutline: `${getComputedStyle(document.querySelector('.hd-shell-search-input-wrap')).outlineWidth} ${getComputedStyle(document.querySelector('.hd-shell-search-input-wrap')).outlineStyle}`,
      };
    });
    assert.ok(initialMetrics.close.height >= 44, `close target >=44px at ${viewport.width}px`);
    assert.ok(initialMetrics.inputWrap.height >= 48, `search field >=48px at ${viewport.width}px`);
    assert.ok(initialMetrics.results.length >= 2, `quick access results exist at ${viewport.width}px`);
    assert.ok(initialMetrics.results.every(height => height >= 44), `result targets >=44px at ${viewport.width}px`);
    assert.equal(initialMetrics.documentWidth, initialMetrics.viewportWidth, `no horizontal overflow at ${viewport.width}px`);
    assert.match(initialMetrics.pointerOutline, /none$/, `pointer focus does not add an extra frame at ${viewport.width}px: ${JSON.stringify(initialMetrics)}`);

    if (viewport.width === 390) {
      await mkdir(outputDir, { recursive: true });
      await page.screenshot({ path: `${outputDir}/global-search-mobile-390.png` });
    }

    await input.press('Shift+Tab');
    await page.keyboard.press('Tab');
    const keyboardOutline = await page.locator('.hd-shell-search-input-wrap').evaluate(element => getComputedStyle(element).outlineWidth);
    assert.equal(keyboardOutline, '2px', 'keyboard focus uses the shared visible focus indicator');

    await input.press('ArrowDown');
    const resultButtons = dialog.locator('[data-global-search-result]:not([disabled])');
    const resultCount = await resultButtons.count();
    assert.ok(resultCount >= 2);
    const activeResult = async () => page.evaluate(() => document.activeElement?.getAttribute('data-global-search-result') === 'true');
    assert.equal(await activeResult(), true, 'ArrowDown moves from input into results');
    await page.keyboard.press('ArrowDown');
    const secondResultFocused = await resultButtons.nth(1).evaluate(button => button === document.activeElement);
    assert.equal(secondResultFocused, true, 'ArrowDown moves to the next result');
    await page.keyboard.press('ArrowUp');
    const firstResultFocused = await resultButtons.first().evaluate(button => button === document.activeElement);
    assert.equal(firstResultFocused, true, 'ArrowUp returns to the prior result');
    await page.keyboard.press('ArrowUp');
    const wrappedToLast = await resultButtons.last().evaluate(button => button === document.activeElement);
    assert.equal(wrappedToLast, true, 'ArrowUp wraps from the first to the last result');

    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'detached' });
    const focusReturned = await page.evaluate(() => document.activeElement?.matches('.hd-header-global-search-button'));
    assert.equal(focusReturned, true, 'Escape returns focus to the opener');
    assert.deepEqual(pageErrors, [], `no uncaught page errors at ${viewport.width}px`);
    results.push({ viewport, ...initialMetrics, keyboardOutline, focusReturned });
    await context.close();
  }
} finally {
  await browser.close();
}

console.log(`PASS global search keyboard/mobile QA: ${JSON.stringify(results)}`);
