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
const identityRewriteSources = firebaseConfig.hosting.rewrites
  .filter(item => `${item.source || ''}`.startsWith('/api/identity/'))
  .map(item => item.source);
for (const expectedPath of [
  '/api/identity/login',
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
assert.match(identityClientSource, /getIdentityApiUrl\(path\)/);

console.log('Identity Center unit checks passed.');
