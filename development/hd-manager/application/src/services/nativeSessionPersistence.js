import { Capacitor } from '@capacitor/core';
import { NativeBiometric } from '@capgo/capacitor-native-biometric';

const markerKey = 'hd-native-remembered-uid-v1';
const native = () => Capacitor.getPlatform() === 'android';
export const rememberedNativeUid = () => {
  if (!native()) return '';
  try { return window.localStorage.getItem(markerKey) || ''; } catch { return ''; }
};
export const forgetNativeSession = () => {
  if (native()) window.localStorage.removeItem(markerKey);
};

// Firebase's persistence adapter contract; single Android WebView, no polling.
// This stores a refreshable session, never a password or the biometric credential.
export class NativeSessionPersistence {
  static type = 'LOCAL';
  type = 'LOCAL';
  _shouldAllowMigration = false;
  async _isAvailable() { return native(); }
  async _set(key, value) {
    await NativeBiometric.setData({ key: `firebase-session:${key}`, value: JSON.stringify(value), accessControl: 0 });
  }
  async _get(key) {
    const uid = rememberedNativeUid();
    if (!uid) return null;
    try {
      const result = await NativeBiometric.getData({ key: `firebase-session:${key}` });
      const value = JSON.parse(result.value);
      return value?.uid === uid ? value : null;
    } catch { return null; }
  }
  async _remove(key) { await NativeBiometric.deleteData({ key: `firebase-session:${key}` }); }
  _addListener() {}
  _removeListener() {}
}

export async function rememberNativeSession(auth, setPersistence) {
  if (!native() || !auth.currentUser || auth.currentUser.isAnonymous) return;
  const user = auth.currentUser;
  await setPersistence(auth, NativeSessionPersistence);
  if (auth.currentUser !== user) throw new Error('Phiên đăng nhập đã thay đổi.');
  window.localStorage.setItem(markerKey, user.uid);
}
