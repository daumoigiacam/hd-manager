const getConfiguredFirebaseValues = () => ({
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || '',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || '',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '',
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || '',
});

export const resolveFirebaseRuntimeConfig = () => {
  if (typeof __firebase_config !== 'undefined') {
    return JSON.parse(__firebase_config);
  }

  return Object.fromEntries(
    Object.entries(getConfiguredFirebaseValues()).filter(([, value]) => `${value || ''}`.trim()),
  );
};

export const resolveDataAppId = () => (
  typeof __app_id !== 'undefined'
    ? __app_id
    : (import.meta.env.VITE_HD_APP_ID || import.meta.env.VITE_FIREBASE_PROJECT_ID || 'hd-manager-production')
);
