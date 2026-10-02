export function getFirebaseEmulatorConfig(projectId, env = import.meta.env || {}) {
  if (env.VITE_FIREBASE_EMULATORS !== 'true') return null;
  if (env.MODE !== 'emulator' || !/^demo-[a-z0-9-]+$/.test(projectId || '')) {
    throw new Error('Firebase Emulator requires emulator mode and an isolated demo project.');
  }
  return { host: '127.0.0.1', authPort: 9199, firestorePort: 8185, functionsPort: 5002 };
}

export function getFirebaseFunctionsOrigin(projectId, env = import.meta.env || {}) {
  if (!/^[a-z0-9-]+$/.test(projectId || '')) throw new Error('Invalid Firebase project.');
  const emulator = getFirebaseEmulatorConfig(projectId, env);
  const region = env.VITE_FIREBASE_FUNCTIONS_REGION || 'us-central1';
  if (!/^[a-z]+-[a-z]+\d+$/.test(region)) throw new Error('Invalid Firebase Functions region.');
  return emulator
    ? `http://${emulator.host}:${emulator.functionsPort}/${projectId}/${region}`
    : `https://${region}-${projectId}.cloudfunctions.net`;
}

export function getFirestoreRestOrigin(projectId, env = import.meta.env || {}) {
  const emulator = getFirebaseEmulatorConfig(projectId, env);
  return emulator ? `http://${emulator.host}:${emulator.firestorePort}` : 'https://firestore.googleapis.com';
}
