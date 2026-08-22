import { chromium } from 'playwright-core';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const BLOCKED_HOSTS = new Set([
  'app.hdconnect.net',
  'api.hdconnect.net',
]);

const ALLOWED_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  'staging-app.hdconnect.net',
  'staging-api.hdconnect.net',
]);

const FIREBASE_MARKERS = [
  'firebaseio.com',
  'firestore.googleapis.com',
  'firebasestorage.googleapis.com',
  'firebasestorage.app',
  'cloudfunctions.net',
  'identitytoolkit.googleapis.com',
  'securetoken.googleapis.com',
  'firebaseapp.com',
];

const stringValue = (value) => `${value ?? ''}`.trim();

export const validateSmokeTarget = (rawValue, label) => {
  const value = stringValue(rawValue);
  if (!value) throw new Error(`${label} is required.`);

  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error(`${label} must use HTTP(S).`);
  }
  if (BLOCKED_HOSTS.has(url.hostname)) {
    throw new Error(`${label} points to production, which is forbidden by this harness.`);
  }
  if (FIREBASE_MARKERS.some((marker) => url.hostname.endsWith(marker))) {
    throw new Error(`${label} points to Firebase, which is forbidden by this harness.`);
  }
  if (!ALLOWED_HOSTS.has(url.hostname)) {
    throw new Error(`${label} must point to localhost or an approved staging host.`);
  }
  return url;
};

export const collectFirebaseRequests = (urls = []) => urls.filter((value) => {
  const normalized = stringValue(value).toLowerCase();
  try {
    const hostname = new URL(normalized).hostname;
    return FIREBASE_MARKERS.some((marker) => hostname === marker || hostname.endsWith(`.${marker}`));
  } catch {
    return false;
  }
});

const getConfig = (env = process.env) => ({
  appUrl: stringValue(env.HD_MANAGER_E2E_APP_URL),
  apiUrl: stringValue(env.HD_MANAGER_E2E_API_URL),
  browserPath: stringValue(env.HD_MANAGER_E2E_BROWSER_PATH),
  email: stringValue(env.HD_MANAGER_E2E_EMAIL),
  password: stringValue(env.HD_MANAGER_E2E_PASSWORD),
});

const writeResult = (result) => {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
};

const main = async () => {
  const config = getConfig();
  const missing = Object.entries(config)
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missing.length > 0) {
    writeResult({
      status: 'BLOCKED',
      code: 'GAP-INFRASTRUCTURE',
      missing,
      message: 'Provide isolated staging URLs, browser executable and test-only credentials through the environment. No production values are accepted.',
    });
    process.exitCode = 2;
    return;
  }

  let appUrl;
  let apiUrl;
  try {
    appUrl = validateSmokeTarget(config.appUrl, 'HD_MANAGER_E2E_APP_URL');
    apiUrl = validateSmokeTarget(config.apiUrl, 'HD_MANAGER_E2E_API_URL');
  } catch (error) {
    writeResult({ status: 'BLOCKED', code: 'UNSAFE_TARGET', message: error.message });
    process.exitCode = 2;
    return;
  }

  const requests = [];
  const consoleErrors = [];
  const browser = await chromium.launch({ executablePath: config.browserPath, headless: true });
  try {
    const page = await browser.newPage();
    page.on('request', (request) => requests.push(request.url()));
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text().slice(0, 500));
    });

    await page.goto(appUrl.href, { waitUntil: 'networkidle' });
    const emailInput = page.locator('input[type="email"], input[autocomplete="username"], input[name*="email" i], input[placeholder*="email" i]').first();
    const passwordInput = page.locator('input[type="password"], input[autocomplete="current-password"]').first();
    await emailInput.fill(config.email);
    await passwordInput.fill(config.password);
    await page.getByRole('button', { name: /đăng nhập|vào ứng dụng|login|sign in/i }).first().click();
    await page.waitForTimeout(1000);

    const firebaseRequests = collectFirebaseRequests(requests);
    const apiRequests = requests.filter((url) => url.startsWith(apiUrl.origin));
    const coreApiRequests = apiRequests.filter((url) => /\/api\/v1\/(master-data\/customers|products|sales\/orders|auth\/)/.test(url));

    const result = {
      status: firebaseRequests.length === 0 && coreApiRequests.length > 0 ? 'PASS' : 'FAIL',
      appUrl: appUrl.origin,
      apiUrl: apiUrl.origin,
      login: 'ATTEMPTED',
      coreApiRequests: coreApiRequests.length,
      firebaseRequests,
      consoleErrors,
      note: 'This harness proves network routing for the existing login/core load. CRUD actions still require explicit staging fixtures/selectors and are not silently marked PASS.',
    };
    writeResult(result);
    process.exitCode = result.status === 'PASS' ? 0 : 1;
  } finally {
    await browser.close();
  }
};

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main();
}
