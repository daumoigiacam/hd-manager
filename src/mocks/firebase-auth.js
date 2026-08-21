const listeners = new Set();

const authState = {
  currentUser: null
};
const PREVIEW_AUTH_TOKEN_PREFIX = 'hd-preview-auth-v1:';

const decodePreviewClaims = (token) => {
  const rawToken = `${token || ''}`;
  if (!rawToken.startsWith(PREVIEW_AUTH_TOKEN_PREFIX)) return {};
  try {
    const encodedClaims = rawToken.slice(PREVIEW_AUTH_TOKEN_PREFIX.length);
    return JSON.parse(decodeURIComponent(encodedClaims));
  } catch {
    return {};
  }
};

const createPreviewUser = (token) => {
  const claims = decodePreviewClaims(token);
  const uid = claims.uid || claims.appUserId || claims.identityId || token || 'preview-user';
  return {
    uid,
    isAnonymous: false,
    getIdToken: async () => token || `preview-token:${uid}`,
    getIdTokenResult: async () => ({ claims })
  };
};

export const indexedDBLocalPersistence = { type: 'LOCAL_INDEXED_DB' };
export const browserLocalPersistence = { type: 'LOCAL_BROWSER' };

function notify() {
  for (const listener of listeners) {
    listener(authState.currentUser);
  }
}

export function getAuth() {
  return authState;
}

export function initializeAuth() {
  return authState;
}

export async function setPersistence() {
  return undefined;
}

export async function signInAnonymously() {
  authState.currentUser = {
    uid: 'preview-user',
    isAnonymous: true
  };
  notify();
  return { user: authState.currentUser };
}

export async function signInWithCustomToken(_, token) {
  authState.currentUser = createPreviewUser(token);
  notify();
  return { user: authState.currentUser };
}

export async function signOut() {
  authState.currentUser = null;
  notify();
}

export function onAuthStateChanged(_, callback) {
  listeners.add(callback);
  queueMicrotask(() => callback(authState.currentUser));
  return () => listeners.delete(callback);
}
