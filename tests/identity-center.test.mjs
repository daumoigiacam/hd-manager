import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  DEFAULT_FIRST_LOGIN_PASSWORD,
  buildPhoneVariants,
  normalizePhone,
  normalizeUsername,
  validatePassword,
  validatePin,
  verifyLegacyPassword,
} = require('../functions/identityCenter.js');

const legacyHash = (password, salt = 'identity-test-salt') => {
  const crypto = require('node:crypto');
  return `pbkdf2-sha256-v1$120000$${Buffer.from(salt).toString('hex')}$${crypto.pbkdf2Sync(password, Buffer.from(salt), 120000, 32, 'sha256').toString('hex')}`;
};

assert.equal(DEFAULT_FIRST_LOGIN_PASSWORD, '12345678');
assert.equal(normalizePhone('84 978 194 836'), '0978194836');
assert.equal(normalizePhone('0978.194.836'), '0978194836');
assert.ok(buildPhoneVariants('0978194836').includes('84978194836'));
assert.equal(normalizeUsername(' Nguyen Van.A '), 'nguyenvan.a');
assert.equal(validatePassword('abcd1234'), '');
assert.notEqual(validatePassword('12345678'), '');
assert.equal(validatePin('123456'), '');
assert.notEqual(validatePin('12345'), '');
assert.equal(verifyLegacyPassword('Abcd1234', legacyHash('Abcd1234')), true);
assert.equal(verifyLegacyPassword('Wrong1234', legacyHash('Abcd1234')), false);

const firebaseConfig = JSON.parse(await readFile(new URL('../firebase.json', import.meta.url), 'utf8'));
const identityClientSource = await readFile(new URL('../src/services/identityCenter.js', import.meta.url), 'utf8');
const appSource = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
const identityFunctionSource = await readFile(new URL('../functions/identityCenter.js', import.meta.url), 'utf8');
const identityRewriteSources = firebaseConfig.hosting.rewrites
  .filter(item => `${item.source || ''}`.startsWith('/api/identity/'))
  .map(item => item.source);
for (const expectedPath of [
  '/api/identity/login',
  '/api/identity/register-company',
  '/api/identity/complete-setup',
  '/api/identity/request-recovery',
  '/api/identity/complete-recovery',
  '/api/identity/verify-pin',
  '/api/identity/devices',
  '/api/identity/revoke-devices',
  '/api/identity/logout',
  '/api/identity/audit',
]) {
  assert.ok(identityRewriteSources.includes(expectedPath), `Missing hosting rewrite: ${expectedPath}`);
}
assert.match(identityClientSource, /https:\/\/us-central1-hd-manager-c5839\.cloudfunctions\.net/);
assert.match(identityClientSource, /'\/api\/identity\/login': 'identityLogin'/);
assert.match(identityClientSource, /'\/api\/identity\/register-company': 'identityRegisterCompany'/);
assert.match(identityClientSource, /export const identityRegisterCompany/);
assert.match(identityClientSource, /getIdentityApiUrl\(path\)/);
assert.match(appSource, /auth\.bootstrap\.not_required/);
assert.doesNotMatch(appSource, /auth\.bootstrap\.anonymous/);
assert.doesNotMatch(appSource, /if \(false\) return undefined;/);

const anonymousSignInCalls = appSource.match(/signInAnonymously\(auth\)/g) || [];
assert.equal(anonymousSignInCalls.length, 0, 'Anonymous Auth must never run in login or startup paths');
assert.doesNotMatch(appSource, /anonymousBootstrapAllowedRef/);
assert.match(appSource, /if \(u\.isAnonymous\)/);
assert.match(appSource, /identityRegisterCompany\(\{/);

const identitySessionStart = appSource.indexOf('const establishIdentitySession = async');
const identitySessionEnd = appSource.indexOf('const handleIdentityLogin = async');
const identitySessionSource = appSource.slice(identitySessionStart, identitySessionEnd);
assert.match(identitySessionSource, /runFirebaseAuthMutation\(\(\) => signInWithCustomToken/);
assert.match(identityFunctionSource, /setCustomUserClaims\(firebaseUid, claims\)/);
assert.match(identityFunctionSource, /const registerCompany = async/);
assert.match(identityFunctionSource, /await db\.runTransaction/);
assert.match(identityFunctionSource, /transaction\.create\(companyRef, company\)/);
assert.match(identityFunctionSource, /transaction\.create\(employeeRef, employee\)/);
assert.match(identityFunctionSource, /transaction\.create\(identityRef, identity\)/);
const registerStart = identityFunctionSource.indexOf('const registerCompany = async');
const registerEnd = identityFunctionSource.indexOf('const enforceLoginRateLimit = async');
const registerSource = identityFunctionSource.slice(registerStart, registerEnd);
assert.doesNotMatch(registerSource, /password_hash\s*:/);
assert.ok(
  identityFunctionSource.indexOf('setCustomUserClaims(firebaseUid, claims)')
    < identityFunctionSource.indexOf('createCustomToken(firebaseUid, claims)'),
  'Persistent Firebase claims must be synchronized before issuing a custom token'
);
assert.match(appSource, /firestore\.write\.token_refresh/);
assert.match(appSource, /firestore\.write\.sdk_token_refresh/);
assert.match(appSource, /firebaseUser\.getIdToken\(forceRefreshToken\)/);
assert.match(appSource, /await firebaseUser\.getIdToken\(true\)/);

console.log('Identity Center unit checks passed.');
