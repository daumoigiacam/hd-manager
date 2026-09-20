import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { HdApiError } from '../src/api/client.js';
import { createHdConnectStagingApi } from '../src/api/hdConnectStaging.js';

const challengeId = '11111111-1111-4111-8111-111111111111';
const proof = 'proof-proof-proof-proof-proof-proof-proof-1234';

test('routes the email registration contract through Platform without a Firebase or SMS fallback', async () => {
  const calls = [];
  let storedSession;
  const api = createHdConnectStagingApi({
    post: async (path, payload, options) => {
      calls.push({ path, payload, options });
      if (path === '/auth/otp/request') return { challengeId, cooldownSeconds: 60 };
      if (path === '/auth/otp/verify') return { challengeId, registrationToken: proof };
      return {
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        user: { id: 'user-1', email: 'owner@example.test', fullName: 'Owner' },
        company: { id: 'company-1', name: 'Disposable Company' },
      };
    },
    setSession: (session) => { storedSession = session; },
  });

  await api.startEmailRegistration(' Owner@Example.test ');
  await api.verifyEmailRegistration({ challengeId, code: '123456', email: 'owner@example.test' });
  const session = await api.completeEmailRegistration({
    challengeId,
    proof,
    email: 'owner@example.test',
    fullName: 'Disposable Owner',
    companyName: 'Disposable Company',
    password: 'StrongPass123!',
  });

  assert.deepEqual(calls.map((call) => call.path), [
    '/auth/otp/request',
    '/auth/otp/verify',
    '/auth/register/email',
  ]);
  assert.deepEqual(calls[0].payload, {
    channel: 'EMAIL',
    email: 'owner@example.test',
    purpose: 'REGISTRATION',
  });
  assert.equal(calls[0].options.authenticate, false);
  assert.deepEqual(calls[1].payload, {
    challengeId,
    channel: 'EMAIL',
    email: 'owner@example.test',
    otp: '123456',
    purpose: 'REGISTRATION',
  });
  assert.equal(calls[1].options.allowRefresh, false);
  assert.equal(calls[2].payload.registrationToken, proof);
  assert.equal(calls[2].payload.email, 'owner@example.test');
  assert.equal(calls[2].payload.password, 'StrongPass123!');
  assert.equal('companyCode' in calls[2].payload, false);
  assert.equal(calls[2].options.retry, false);
  assert.equal(storedSession.accessToken, 'access-token');
  assert.equal(session.user.companyId, 'company-1');
});

test('routes the neutral email password-reset contract and rejects bad OTP input before transport', async () => {
  const calls = [];
  const api = createHdConnectStagingApi({
    post: async (path, payload, options) => {
      calls.push({ path, payload, options });
      if (path === '/auth/otp/request') return { challengeId, cooldownSeconds: 60 };
      if (path === '/auth/otp/verify') return { challengeId, passwordResetToken: proof };
      return { reset: true };
    },
  });

  await api.startEmailPasswordReset('owner@example.test');
  const verified = await api.verifyEmailPasswordReset({
    challengeId,
    code: '123456',
    email: 'owner@example.test',
  });
  await api.completeEmailPasswordReset({ challengeId, proof, newPassword: 'NewStrongPass123!' });
  await assert.rejects(
    () => api.verifyEmailPasswordReset({ challengeId, code: '123', email: 'owner@example.test' }),
    (error) => error instanceof HdApiError && error.code === 'EMAIL_OTP_CODE_INVALID',
  );

  assert.deepEqual(calls.map((call) => call.path), [
    '/auth/otp/request',
    '/auth/otp/verify',
    '/identity/password/reset',
  ]);
  assert.deepEqual(calls[0].payload, {
    channel: 'EMAIL',
    email: 'owner@example.test',
    purpose: 'PASSWORD_RESET',
  });
  assert.deepEqual(calls[1].payload, {
    challengeId,
    channel: 'EMAIL',
    email: 'owner@example.test',
    otp: '123456',
    purpose: 'PASSWORD_RESET',
  });
  assert.equal(verified.proof, proof);
  assert.equal(calls[0].options.authenticate, false);
  assert.equal(calls[2].payload.token, proof);
  assert.equal(calls[2].payload.newPassword, 'NewStrongPass123!');
});

test('requires the authenticated Platform session for email change and preserves OTP proof verification', async () => {
  const calls = [];
  const api = createHdConnectStagingApi({
    post: async (path, payload, options) => {
      calls.push({ path, payload, options });
      if (path.endsWith('/start')) return { challengeId, resendAfterSeconds: 60 };
      if (path.endsWith('/verify')) return { challengeId, proof };
      return { changed: true };
    },
  });

  await api.startEmailChange('next@example.test');
  await api.verifyEmailChange({ challengeId, code: '123456' });
  await api.completeEmailChange({ challengeId, proof });

  assert.deepEqual(calls.map((call) => call.path), [
    '/auth/email-change/start',
    '/auth/email-change/verify',
    '/auth/email-change/complete',
  ]);
  assert.equal(calls[0].options.authenticate, true);
  assert.equal(calls[1].options.authenticate, false);
  assert.equal(calls[2].options.retry, false);
});

test('keeps the VPS auth screen email-only and provides six OTP inputs with autofill support', () => {
  const source = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  const start = source.indexOf('function VpsEmailAuthView');
  const end = source.indexOf('function LoginRegisterView', start);
  const vpsAuthSource = source.slice(start, end);

  assert.ok(start >= 0 && end > start);
  assert.match(vpsAuthSource, /data-auth-runtime="vps-staging"/);
  assert.match(vpsAuthSource, /VpsEmailOtpInput/);
  assert.match(vpsAuthSource, /autoComplete="email"/);
  assert.match(vpsAuthSource, /Mật khẩu và mã xác minh không được lưu trong ứng dụng/);
  assert.doesNotMatch(vpsAuthSource, /SMS|phone OTP|Phone OTP/i);
});
