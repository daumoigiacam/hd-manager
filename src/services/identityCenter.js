import { Capacitor } from '@capacitor/core';
import { NativeBiometric, AccessControl } from '@capgo/capacitor-native-biometric';

const DEVICE_KEY = 'hd-identity-device-v1';
const WEB_SECRET_PREFIX = 'hd-identity-device-secret-v1:';
const NATIVE_SECRET_PREFIX = 'hd.identity.device.v1.';
// Identity routes are served by Cloud Functions. Do not fall back to Firebase
// Hosting: an unknown Hosting path responds with the SPA HTML, which browsers
// surface as a CORS/network error instead of a useful authentication message.
const DEFAULT_IDENTITY_API_BASE_URL = 'https://us-central1-hd-manager-c5839.cloudfunctions.net';
const IDENTITY_FUNCTION_NAMES = {
  '/api/identity/login': 'identityLogin',
  '/api/identity/complete-setup': 'identityCompleteSetup',
  '/api/identity/request-recovery': 'identityRequestRecovery',
  '/api/identity/complete-recovery': 'identityCompleteRecovery',
  '/api/identity/verify-pin': 'identityVerifyPin',
  '/api/identity/devices': 'identityDevices',
  '/api/identity/revoke-devices': 'identityRevokeDevices',
  '/api/identity/logout': 'identityLogout',
  '/api/identity/audit': 'identityAudit',
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

const getNativeSecretKey = (deviceId) => `${NATIVE_SECRET_PREFIX}${deviceId}`;

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

export const storeTrustedDeviceSecret = async ({ deviceId, secret, biometricEnabled = false }) => {
  if (!deviceId || !secret) return;
  if (isNativeRuntime()) {
    await NativeBiometric.setData({
      key: getNativeSecretKey(deviceId),
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
  window.localStorage.setItem(`${WEB_SECRET_PREFIX}${deviceId}`, secret);
};

export const readTrustedDeviceSecret = async ({ deviceId, requireBiometric = false }) => {
  if (!deviceId) return '';
  if (isNativeRuntime()) {
    try {
      const result = requireBiometric
        ? await NativeBiometric.getSecureData({ key: getNativeSecretKey(deviceId), reason: 'Xác thực để khôi phục tài khoản', title: 'HD Manager' })
        : await NativeBiometric.getData({ key: getNativeSecretKey(deviceId) });
      return `${result?.value || ''}`;
    } catch {
      return '';
    }
  }
  return window.localStorage.getItem(`${WEB_SECRET_PREFIX}${deviceId}`) || '';
};

export const removeTrustedDeviceSecret = async (deviceId) => {
  if (!deviceId) return;
  if (isNativeRuntime()) {
    try {
      await NativeBiometric.deleteData({ key: getNativeSecretKey(deviceId) });
    } catch {
      // Device revocation is already authoritative on the server.
    }
    return;
  }
  window.localStorage.removeItem(`${WEB_SECRET_PREFIX}${deviceId}`);
};

const requestIdentityApi = async (path, payload = {}, { idToken = '' } = {}) => {
  const response = await fetch(getIdentityApiUrl(path), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
    },
    body: JSON.stringify(payload),
  });
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

export const identityLogin = ({ identifier, password, appId }) => requestIdentityApi('/api/identity/login', {
  identifier,
  password,
  appId,
  device: getIdentityDevice(),
});

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
  if (result.deviceSecret) {
    await storeTrustedDeviceSecret({ deviceId: device.deviceId, secret: result.deviceSecret, biometricEnabled });
  }
  return result;
};

export const identitySetBiometric = async ({ idToken, enabled }) => {
  const device = getIdentityDevice();
  let secret = await readTrustedDeviceSecret({ deviceId: device.deviceId, requireBiometric: false });
  if (!secret && isNativeRuntime()) {
    secret = await readTrustedDeviceSecret({ deviceId: device.deviceId, requireBiometric: true });
  }
  if (!secret) throw new Error('Thiết bị này chưa được tin cậy. Hãy đăng nhập lại và hoàn tất thiết lập bảo mật.');
  await storeTrustedDeviceSecret({ deviceId: device.deviceId, secret, biometricEnabled: Boolean(enabled) });
  return requestIdentityApi('/api/identity/complete-setup', {
    device,
    biometricEnabled: Boolean(enabled),
  }, { idToken });
};

export const identityRequestRecovery = async ({ identifier, pin = '' }) => {
  const device = getIdentityDevice();
  let deviceSecret = '';
  let biometricProof = false;
  const availability = await getBiometricAvailability();
  if (availability.available) {
    deviceSecret = await readTrustedDeviceSecret({ deviceId: device.deviceId, requireBiometric: true });
    biometricProof = Boolean(deviceSecret);
  }
  if (!deviceSecret) deviceSecret = await readTrustedDeviceSecret({ deviceId: device.deviceId, requireBiometric: false });
  if (!deviceSecret) throw new Error('Thiết bị này chưa được xác minh.');
  return requestIdentityApi('/api/identity/request-recovery', { identifier, device, deviceSecret, pin, biometricProof });
};

export const identityCompleteRecovery = ({ resetToken, password }) => requestIdentityApi('/api/identity/complete-recovery', {
  resetToken,
  password,
  device: getIdentityDevice(),
});

export const identityVerifyPin = ({ idToken, pin }) => requestIdentityApi('/api/identity/verify-pin', { pin }, { idToken });
export const identityListDevices = ({ idToken }) => requestIdentityApi('/api/identity/devices', {}, { idToken });
export const identityRevokeDevices = async ({ idToken, deviceId = '', all = false }) => {
  const result = await requestIdentityApi('/api/identity/revoke-devices', { deviceId, all }, { idToken });
  if (all || deviceId === getIdentityDevice().deviceId) await removeTrustedDeviceSecret(deviceId || getIdentityDevice().deviceId);
  return result;
};
export const identityLogout = ({ idToken }) => requestIdentityApi('/api/identity/logout', { device: getIdentityDevice() }, { idToken });
export const identityListAudit = ({ idToken }) => requestIdentityApi('/api/identity/audit', {}, { idToken });

export const getIdentityApiUrlForDiagnostics = () => getIdentityApiBaseUrl();
