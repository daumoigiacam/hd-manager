import {resolveOfflineRuntimeEnvironment,resolveLocalOfflineRuntimeEnvironment} from './offlineRuntimeEnvironment.js';
// Disabled by default. A verified remote environment must supply every field;
// no localhost/demo endpoint or Development signer is a Production fallback.
const env=import.meta.env||{};
// Direct import.meta replacement lets the bundler eliminate the old pilot
// branch entirely instead of carrying its loopback fallback into release JS.
const localEnabled=import.meta.env.MODE==='emulator'&&import.meta.env.VITE_OFFLINE_RUNTIME==='local-v1';
export const trustedOfflineEnabled=import.meta.env.VITE_OFFLINE_RUNTIME==='trusted-v1'||localEnabled;
export const trustedOfflineEnvironment=trustedOfflineEnabled?(localEnabled?resolveLocalOfflineRuntimeEnvironment:resolveOfflineRuntimeEnvironment)({
  mode:import.meta.env.MODE,
  projectId:env.VITE_FIREBASE_PROJECT_ID,appId:env.VITE_HD_APP_ID,
  apiBaseUrl:env.VITE_OFFLINE_API_BASE_URL,appOrigin:env.VITE_OFFLINE_APP_ORIGIN,
  publicKey:JSON.parse(env.VITE_OFFLINE_VERIFYING_JWK||'null'),
  environment:env.VITE_OFFLINE_ENVIRONMENT,maxOfflineMs:Number(env.VITE_OFFLINE_MAX_MS||3600000),
}):null;
