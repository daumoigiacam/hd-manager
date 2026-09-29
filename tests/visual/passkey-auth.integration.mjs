import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { chromium } from 'playwright-core';

const require = createRequire(import.meta.url);
const { createPasskeyService } = require('../../functions/identityPasskeys');
const { memoryStore } = require('../helpers/passkey-store.cjs');
const origin = 'https://app.hdconnect.net';
const db = memoryStore({ 'identity_accounts/test-user': { status: 'active', name: 'Test Account', phone: 'test-only', passwordHash: 'test-only-hash' } });
let sessions = 0;
const service = createPasskeyService({ db,
  getVerifiedIdentity: async () => ({ identityId: 'test-user', identity: db.rows.get('identity_accounts/test-user') }),
  verifyPassword: async password => password === 'test-only',
  issueSession: async () => { sessions++; return { customToken: 'test-only-custom-token' }; },
  logAudit: async () => {},
});
const call = (operation, body = {}) => service({ operation, body, origin, authorization: 'test-only', ip: 'test-only' });
const bundle = await build({ stdin: { contents: "export { startRegistration, startAuthentication } from '@simplewebauthn/browser';", resolveDir: process.cwd() }, bundle: true, write: false, format: 'iife', globalName: 'PasskeyTest' });
const browser = await chromium.launch({ executablePath: process.env.HD_MANAGER_VISUAL_QA_BROWSER_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
try {
  const page = await browser.newPage();
  // Every request is intercepted: no production traffic, account or credential.
  await page.route('**/*', route => route.fulfill({ contentType: 'text/html', body: '<html><body>Isolated passkey test</body></html>' }));
  await page.goto(origin);
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
  const registration = await call('register-options', { password: 'test-only' });
  const credential = await page.evaluate(optionsJSON => window.PasskeyTest.startRegistration({ optionsJSON }), registration.options);
  assert.equal((await call('register-verify', { challengeId: registration.challengeId, response: credential })).success, true);
  assert.equal((await call('list')).passkeys.length, 1);
  const challenge = await call('login-options');
  const response = await page.evaluate(optionsJSON => window.PasskeyTest.startAuthentication({ optionsJSON }), challenge.options);
  const invalidSignature = { ...response, response: { ...response.response, signature: 'AAAA' } };
  await assert.rejects(call('login-verify', { challengeId: challenge.challengeId, response: invalidSignature }), { statusCode: 401 });
  const noUserVerification = Buffer.from(response.response.authenticatorData, 'base64url');
  noUserVerification[32] &= ~4;
  await assert.rejects(call('login-verify', { challengeId: challenge.challengeId, response: { ...response, response: { ...response.response, authenticatorData: noUserVerification.toString('base64url') } } }), { statusCode: 401 });
  const result = await call('login-verify', { challengeId: challenge.challengeId, response });
  assert.equal(result.customToken, 'test-only-custom-token');
  await assert.rejects(call('login-verify', { challengeId: challenge.challengeId, response }), { statusCode: 401 });
  assert.equal(sessions, 1);
  await cdp.send('WebAuthn.removeVirtualAuthenticator', { authenticatorId });
  console.log('PASS: real WebAuthn registration + signed login; forged signature, missing UV, replay rejected. No production traffic.');
} finally { await browser.close(); }
