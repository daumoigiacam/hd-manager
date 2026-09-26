import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const appSource = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const clientSource = readFileSync(new URL('../src/api/client.js', import.meta.url), 'utf8');

test('Firebase login remains phone-first and routes through Identity Center', () => {
  assert.match(appSource, /type=\{vpsStagingMode \? 'email' : 'tel'\} value=\{loginPhone\}/);
  assert.match(appSource, /placeholder=\{vpsStagingMode \? 'Email' : 'Số điện thoại'\}/);
  assert.match(appSource, /const normalizedIdentifier = normalizeEmployeeLoginPhone\(identifier\)/);
  assert.match(appSource, /await identityLogin\(\{ identifier: normalizedIdentifier, password, appId \}\)/);
  assert.match(appSource, /await onLogin\(loginPhone, loginPassword\)/);
});

test('VPS staging login stays in its separate identity flow', () => {
  assert.match(appSource, /if \(vpsStagingMode\) \{\s*return \(\s*<VpsEmailAuthView/);
  assert.match(appSource, /getHdConnectStagingApi\(\)\.login\(\{ identifier: loginIdentifier, password \}\)/);
  assert.match(clientSource, /isEmail\s*\? \{ email: normalizedIdentifier\.toLowerCase\(\) \}\s*: \{ phone: normalizedIdentifier \}/);
});

test('Firebase registration remains available without exposing legacy VPS registration', () => {
  assert.match(appSource, /if \(vpsStagingMode\) \{\s*setRegError\('VPS staging accounts are provisioned through the identity invitation flow\.'/);
  assert.match(appSource, /!showForgotPassword && !vpsStagingMode && <p/);
  assert.match(appSource, /await onRegister\(toTitleCase\(regCompanyName\), regPhone, regPassword\)/);
});

test('Firebase password recovery uses the current reset and device verification path', () => {
  const start = appSource.indexOf('const handleForgotPasswordSubmit = async (e) => {');
  const end = appSource.indexOf('const handleLoginSubmit = async (e) => {', start);
  assert.ok(start >= 0 && end > start);
  const recoveryHandler = appSource.slice(start, end);
  assert.match(recoveryHandler, /onForgotPassword\?\.\(\{ identifier: forgotPhone, pin: forgotPin \}\)/);
  assert.doesNotMatch(recoveryHandler, /onOtpRequest/);
});
