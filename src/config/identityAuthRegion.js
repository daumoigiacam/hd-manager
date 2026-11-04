// Separate opt-in routing for independently deployed auth and public catalogue
// endpoints. Other Identity Center routes and emulator traffic retain their URLs.
export function getRegionalIdentityAuthUrl(path, env = {}) {
  const region=path==='/api/customer/bootstrap'?env.VITE_CUSTOMER_BOOTSTRAP_REGION:env.VITE_IDENTITY_AUTH_REGION;
  if (env.VITE_FIREBASE_EMULATORS === 'true' || !region) return '';
  if (region !== 'asia-southeast1') throw new Error('Unsupported regional identity configuration.');
  const names = { '/api/identity/login': 'identityLoginRegional', '/api/identity/biometric-login': 'identityBiometricLoginRegional',
    '/api/customer/bootstrap':'customerPortalBootstrapRegional' };
  if (!Object.hasOwn(names, path)) return '';
  const project = env.VITE_FIREBASE_PROJECT_ID || 'hd-manager-c5839';
  if (!/^[a-z0-9-]+$/.test(project)) throw new Error('Invalid regional identity project.');
  return `https://asia-southeast1-${project}.cloudfunctions.net/${names[path]}`;
}
