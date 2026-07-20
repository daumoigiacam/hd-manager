const listeners = new Set();

const authState = {
  currentUser: null
};

function notify() {
  for (const listener of listeners) {
    listener(authState.currentUser);
  }
}

export function getAuth() {
  return authState;
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
  authState.currentUser = {
    uid: token || 'preview-user',
    isAnonymous: false
  };
  notify();
  return { user: authState.currentUser };
}

export function onAuthStateChanged(_, callback) {
  listeners.add(callback);
  queueMicrotask(() => callback(authState.currentUser));
  return () => listeners.delete(callback);
}
