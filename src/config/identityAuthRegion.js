// Opt-in routing for the two independently deployed regional auth endpoints.
// Other Identity Center routes and emulator traffic retain their existing URLs.
export function getRegionalIdentityAuthUrl(path, env = {}) {
  if (env.VITE_FIREBASE_EMULATORS === 'true' || !env.VITE_IDENTITY_AUTH_REGION) return '';
  if (env.VITE_IDENTITY_AUTH_REGION !== 'asia-southeast1') throw new Error('Unsupported regional identity configuration.');
  const names = { '/api/identity/login': 'identityLoginRegional', '/api/identity/biometric-login': 'identityBiometricLoginRegional' };
  if (!Object.hasOwn(names, path)) return '';
  const project = env.VITE_FIREBASE_PROJECT_ID || 'hd-manager-c5839';
  if (!/^[a-z0-9-]+$/.test(project)) throw new Error('Invalid regional identity project.');
  return `https://asia-southeast1-${project}.cloudfunctions.net/${names[path]}`;
}
