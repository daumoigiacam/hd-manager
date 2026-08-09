import { Capacitor } from '@capacitor/core';
import { NativeBiometric, AccessControl } from '@capgo/capacitor-native-biometric';
import { fetchWithTimeout } from './fetchWithTimeout.js';

const DEVICE_KEY = 'hd-identity-device-v1';
const WEB_SECRET_PREFIX = 'hd-identity-device-secret-v1:';
const NATIVE_SECRET_PREFIX = 'hd.identity.device.v1.';
const DEVICE_ACCOUNT_INDEX_KEY = 'hd-identity-device-accounts-v2';
const IDENTITY_REQUEST_TIMEOUT_MS = 30000;
const AI_REQUEST_TIMEOUT_MS = 55000;
// Identity routes are served by Cloud Functions. Do not fall back to Firebase
// Hosting: an unknown Hosting path responds with the SPA HTML, which browsers
// surface as a CORS/network error instead of a useful authentication message.
const DEFAULT_IDENTITY_API_BASE_URL = 'https://us-central1-hd-manager-c5839.cloudfunctions.net';
const IDENTITY_FUNCTION_NAMES = {
  '/api/identity/login': 'identityLogin',
  '/api/identity/register-company': 'identityRegisterCompany',
  '/api/identity/complete-setup': 'identityCompleteSetup',
  '/api/identity/request-recovery': 'identityRequestRecovery',
  '/api/identity/complete-recovery': 'identityCompleteRecovery',
  '/api/identity/verify-pin': 'identityVerifyPin',
  '/api/identity/devices': 'identityDevices',
  '/api/identity/revoke-devices': 'identityRevokeDevices',
  '/api/identity/logout': 'identityLogout',
  '/api/identity/audit': 'identityAudit',
  '/api/customer/bootstrap': 'customerPortalBootstrap',
  '/api/customer/redeem-points': 'customerRedeemPoints',
  '/api/ai/generate-content': 'geminiGenerateContent',
};

const getRuntimePlatform = () => {
  try {
    return Capacitor.getPlatform?.() || 'web';
  } catch {
    return 'web';
  }
};

const isNativeRuntime = () => {
  try {
    return Boolean(Capacitor.isNativePlatform?.());
  } catch {
    return false;
  }
};

const createDeviceId = () => {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `device_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
};

const readJson = (key) => {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const writeJson = (key, value) => {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // App can continue without a persisted device label. Native storage remains available.
  }
};

const normalizeIdentityAlias = (value = '') => {
  const raw = `${value || ''}`.trim().toLowerCase();
  if (!raw) return '';
  if (/^[+\d\s().-]+$/.test(raw)) {
    let digits = raw.replace(/\D/g, '');
    if (digits.startsWith('84') && digits.length >= 11) digits = `0${digits.slice(2)}`;
    return digits ? `phone:${digits}` : '';
  }
  return `identifier:${raw}`;
};

export const getIdentityAccountScope = (identity = {}) => {
  const identityKey = `${identity?.identityKey || ''}`.trim();
  if (identityKey) return identityKey;
  const accountType = `${identity?.accountType || identity?.role || 'account'}`.trim().toLowerCase();
  const companyId = `${identity?.companyId || ''}`.trim();
  const accountId = `${identity?.id || identity?.accountId || identity?.customerId || ''}`.trim();
  return accountId ? `${accountType}:${companyId}:${accountId}` : '';
};

export const isIdentityTenantValidationReady = ({ loadedTenantId = '', sessionTenantId = '', coreDataLoaded = false } = {}) => (
  Boolean(sessionTenantId)
  && `${loadedTenantId || ''}` === `${sessionTenantId || ''}`
  && Boolean(coreDataLoaded)
);

const getIdentityAliases = (identity = {}) => [
  identity?.phone,
  identity?.username,
  identity?.id,
  identity?.accountId,
].map(normalizeIdentityAlias).filter(Boolean);

const rememberIdentityAccountScope = (identity = {}) => {
  const accountScope = getIdentityAccountScope(identity);
  if (!accountScope || typeof window === 'undefined') return accountScope;
  const index = readJson(DEVICE_ACCOUNT_INDEX_KEY) || {};
  getIdentityAliases(identity).forEach(alias => {
    index[alias] = accountScope;
  });
  writeJson(DEVICE_ACCOUNT_INDEX_KEY, index);
  return accountScope;
};

const resolveIdentityAccountScope = (identifier = '') => {
  if (typeof window === 'undefined') return '';
  const alias = normalizeIdentityAlias(identifier);
  if (!alias) return '';
  return `${(readJson(DEVICE_ACCOUNT_INDEX_KEY) || {})[alias] || ''}`;
};

const getIdentityApiBaseUrl = () => {
  const configured = `${import.meta.env.VITE_IDENTITY_API_BASE_URL || import.meta.env.VITE_SEPAY_API_BASE_URL || ''}`.trim();
  if (configured) return configured.replace(/\/$/, '');
  return DEFAULT_IDENTITY_API_BASE_URL;
};

const getIdentityApiUrl = (path) => {
  const baseUrl = getIdentityApiBaseUrl();
  if (/cloudfunctions\.net\/?$/i.test(baseUrl)) {
    const functionName = IDENTITY_FUNCTION_NAMES[path];
    if (!functionName) throw new Error('Không xác định được dịch vụ xác thực.');
    return `${baseUrl}/${functionName}`;
  }
  return `${baseUrl}${path}`;
};

const getSecretAccountSuffix = (accountScope = '') => accountScope
  ? `.${encodeURIComponent(accountScope)}`
  : '';

const getNativeSecretKey = (deviceId, accountScope = '') => `${NATIVE_SECRET_PREFIX}${deviceId}${getSecretAccountSuffix(accountScope)}`;
const getWebSecretKey = (deviceId, accountScope = '') => `${WEB_SECRET_PREFIX}${deviceId}${getSecretAccountSuffix(accountScope)}`;

export const getIdentityDevice = () => {
  const current = readJson(DEVICE_KEY) || {};
  const device = {
    deviceId: current.deviceId || createDeviceId(),
    name: current.name || `${getRuntimePlatform() === 'web' ? 'Trình duyệt' : 'HD Manager'} - ${navigator.userAgent.includes('iPhone') ? 'iPhone' : navigator.userAgent.includes('Android') ? 'Android' : 'Thiết bị'}`,
    os: current.os || navigator.platform || getRuntimePlatform(),
    platform: getRuntimePlatform(),
    appVersion: `${import.meta.env.VITE_APP_VERSION || import.meta.env.VITE_BUILD_VERSION || 'web'}`,
  };
  writeJson(DEVICE_KEY, device);
  return device;
};

export const getBiometricAvailability = async () => {
  if (!isNativeRuntime()) return { supported: false, available: false, reason: 'web' };
  try {
    const result = await NativeBiometric.isAvailable({ useFallback: false });
    return {
      supported: true,
      available: Boolean(result.isAvailable),
      biometryType: result.biometryType,
      strong: Boolean(result.strongBiometryIsAvailable),
      deviceIsSecure: Boolean(result.deviceIsSecure),
    };
  } catch (error) {
    return { supported: true, available: false, reason: `${error?.message || error || 'unavailable'}` };
  }
};

export const authenticateBiometric = async (reason = 'Xác thực để tiếp tục') => {
  const availability = await getBiometricAvailability();
  if (!availability.available) return { success: false, message: 'Thiết bị chưa sẵn sàng Face ID hoặc vân tay.' };
  try {
    await NativeBiometric.verifyIdentity({
      reason,
      title: 'HD Manager',
      subtitle: 'Xác thực sinh trắc học',
      description: reason,
      maxAttempts: 3,
    });
    return { success: true };
  } catch {
    return { success: false, message: 'Xác thực sinh trắc học không thành công.' };
  }
};

export const storeTrustedDeviceSecret = async ({ deviceId, secret, biometricEnabled = false, accountScope = '' }) => {
  if (!deviceId || !secret) return;
  if (isNativeRuntime()) {
    await NativeBiometric.setData({
      key: getNativeSecretKey(deviceId, accountScope),
      value: secret,
      accessControl: biometricEnabled ? AccessControl.BIOMETRY_ANY : AccessControl.NONE,
      title: 'Bảo vệ thiết bị tin cậy',
      negativeButtonText: 'Hủy',
    });
    return;
  }
  // Browser fallback keeps a per-origin opaque device secret only. It never stores
  // the password, PIN or Firebase refresh token, and is intentionally lower-assurance
  // than Android Keystore/iOS Keychain.
  window.localStorage.setItem(getWebSecretKey(deviceId, accountScope), secret);
};

export const readTrustedDeviceSecret = async ({ deviceId, requireBiometric = false, accountScope = '' }) => {
  if (!deviceId) return '';
  if (isNativeRuntime()) {
    try {
      const result = requireBiometric
        ? await NativeBiometric.getSecureData({ key: getNativeSecretKey(deviceId, accountScope), reason: 'Xác thực để khôi phục tài khoản', title: 'HD Manager' })
        : await NativeBiometric.getData({ key: getNativeSecretKey(deviceId, accountScope) });
      return `${result?.value || ''}`;
    } catch {
      return '';
    }
  }
  return window.localStorage.getItem(getWebSecretKey(deviceId, accountScope)) || '';
};

export const removeTrustedDeviceSecret = async (deviceId, accountScope = '') => {
  if (!deviceId) return;
  if (isNativeRuntime()) {
    try {
      await NativeBiometric.deleteData({ key: getNativeSecretKey(deviceId, accountScope) });
    } catch {
      // Device revocation is already authoritative on the server.
    }
    return;
  }
  window.localStorage.removeItem(getWebSecretKey(deviceId, accountScope));
};

const requestIdentityApi = async (path, payload = {}, { idToken = '' } = {}) => {
  const response = await fetchWithTimeout(getIdentityApiUrl(path), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
    },
    body: JSON.stringify(payload),
  }, IDENTITY_REQUEST_TIMEOUT_MS);
  let body = {};
  try {
    body = await response.json();
  } catch {
    body = { success: false, message: 'Máy chủ xác thực trả về dữ liệu không hợp lệ.' };
  }
  if (!response.ok || body.success === false) {
    const error = new Error(body.message || 'Không thể hoàn tất yêu cầu xác thực.');
    error.statusCode = response.status;
    throw error;
  }
  return body;
};

const rememberIdentitySessionAccount = (result = {}) => rememberIdentityAccountScope({
  ...(result.identity || {}),
  identityKey: result.identityKey || result.identity?.identityKey || '',
});

export const identityLogin = async ({ identifier, password, appId }) => {
  const result = await requestIdentityApi('/api/identity/login', {
    identifier,
    password,
    appId,
    device: getIdentityDevice(),
  });
  rememberIdentitySessionAccount(result);
  return result;
};

export const identityRegisterCompany = async ({ companyName, phone, password, appId, companySettings }) => {
  const result = await requestIdentityApi('/api/identity/register-company', {
    companyName,
    phone,
    password,
    appId,
    companySettings,
    device: getIdentityDevice(),
  });
  rememberIdentitySessionAccount(result);
  return result;
};

export const identityCompleteSetup = async ({ idToken, password, username, pin, biometricEnabled, trustDevice }) => {
  const device = getIdentityDevice();
  const result = await requestIdentityApi('/api/identity/complete-setup', {
    device,
    password,
    username,
    pin,
    biometricEnabled,
    trustDevice,
  }, { idToken });
  const accountScope = rememberIdentitySessionAccount(result);
  if (result.deviceSecret) {
    await storeTrustedDeviceSecret({
      deviceId: device.deviceId,
      secret: result.deviceSecret,
      biometricEnabled,
      accountScope,
    });
  }
  return result;
};

export const identitySetBiometric = async ({ idToken, enabled, identity = {} }) => {
  const device = getIdentityDevice();
  const accountScope = rememberIdentityAccountScope(identity);
  let secret = await readTrustedDeviceSecret({ deviceId: device.deviceId, requireBiometric: false, accountScope });
  // Existing installations stored one legacy secret per physical device. Read
  // it only as a compatibility fallback, then migrate it into this account's
  // isolated slot after the server confirms the device relationship.
  if (!secret && accountScope) {
    secret = await readTrustedDeviceSecret({ deviceId: device.deviceId, requireBiometric: false });
  }
  if (!secret && isNativeRuntime()) {
    secret = await readTrustedDeviceSecret({ deviceId: device.deviceId, requireBiometric: true, accountScope });
  }
  if (!secret && isNativeRuntime() && accountScope) {
    secret = await readTrustedDeviceSecret({ deviceId: device.deviceId, requireBiometric: true });
  }
  if (!secret) throw new Error('Thiết bị này chưa được tin cậy. Hãy đăng nhập lại và hoàn tất thiết lập bảo mật.');
  const result = await requestIdentityApi('/api/identity/complete-setup', {
    device,
    biometricEnabled: Boolean(enabled),
  }, { idToken });
  const confirmedAccountScope = rememberIdentitySessionAccount(result) || accountScope;
  await storeTrustedDeviceSecret({
    deviceId: device.deviceId,
    secret,
    biometricEnabled: Boolean(enabled),
    accountScope: confirmedAccountScope,
  });
  return result;
};

export const identityRequestRecovery = async ({ identifier, pin = '' }) => {
  const device = getIdentityDevice();
  const accountScope = resolveIdentityAccountScope(identifier);
  let deviceSecret = '';
  let biometricProof = false;
  const availability = await getBiometricAvailability();
  if (availability.available) {
    deviceSecret = await readTrustedDeviceSecret({ deviceId: device.deviceId, requireBiometric: true, accountScope });
    if (!deviceSecret && accountScope) {
      deviceSecret = await readTrustedDeviceSecret({ deviceId: device.deviceId, requireBiometric: true });
    }
    biometricProof = Boolean(deviceSecret);
  }
  if (!deviceSecret) {
    deviceSecret = await readTrustedDeviceSecret({ deviceId: device.deviceId, requireBiometric: false, accountScope });
  }
  if (!deviceSecret && accountScope) {
    deviceSecret = await readTrustedDeviceSecret({ deviceId: device.deviceId, requireBiometric: false });
  }
  if (!deviceSecret) throw new Error('Thiết bị này chưa được xác minh.');
  return requestIdentityApi('/api/identity/request-recovery', { identifier, device, deviceSecret, pin, biometricProof });
};

export const identityCompleteRecovery = ({ resetToken, password, identifier }) => requestIdentityApi('/api/identity/complete-recovery', {
  resetToken,
  password,
  identifier,
  device: getIdentityDevice(),
});

export const identityVerifyPin = ({ idToken, pin }) => requestIdentityApi('/api/identity/verify-pin', { pin }, { idToken });
export const identityListDevices = ({ idToken }) => requestIdentityApi('/api/identity/devices', {}, { idToken });
export const identityRevokeDevices = async ({ idToken, deviceId = '', all = false, identity = {} }) => {
  const result = await requestIdentityApi('/api/identity/revoke-devices', { deviceId, all }, { idToken });
  if (all || deviceId === getIdentityDevice().deviceId) {
    await removeTrustedDeviceSecret(
      deviceId || getIdentityDevice().deviceId,
      getIdentityAccountScope(identity),
    );
  }
  return result;
};
export const identityLogout = ({ idToken }) => requestIdentityApi('/api/identity/logout', { device: getIdentityDevice() }, { idToken });
export const identityListAudit = ({ idToken }) => requestIdentityApi('/api/identity/audit', {}, { idToken });

export const customerPortalBootstrap = ({ idToken, appId }) => requestIdentityApi('/api/customer/bootstrap', {
  appId,
}, { idToken });

export const customerRedeemPoints = ({
  idToken,
  appId,
  customerId,
  pointsToUse,
  amount,
  requestId,
}) => requestIdentityApi('/api/customer/redeem-points', {
  appId,
  customerId,
  pointsToUse,
  amount,
  requestId,
}, { idToken });

export const requestAiGenerateContent = async ({ idToken, appId, request }) => fetchWithTimeout(
  getIdentityApiUrl('/api/ai/generate-content'),
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ appId, request }),
  },
  AI_REQUEST_TIMEOUT_MS,
);

export const getIdentityApiUrlForDiagnostics = () => getIdentityApiBaseUrl();
