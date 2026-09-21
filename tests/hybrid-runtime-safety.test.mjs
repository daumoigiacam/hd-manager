import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [viteSource, vpsSource, firebaseOnlySource, appSource, mainSource] = await Promise.all([
  readFile(new URL('../vite.config.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/api/hdConnectStaging.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/config/firebase-only-runtime.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/App.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/main.jsx', import.meta.url), 'utf8'),
]);

assert.match(viteSource, /const isVpsStagingBuild = vpsDataMode === 'vps-staging';/);
assert.match(viteSource, /const useCloudData = !usePreviewData && !isVpsStagingBuild;/);
assert.match(viteSource, /isVpsStagingBuild \? '\.\/src\/mocks\/firebase-runtime-vps\.js' : '\.\/src\/config\/firebase-runtime\.js'/);
assert.match(viteSource, /isVpsStagingBuild \? '\.\/src\/api\/hdConnectStaging\.js' : '\.\/src\/config\/firebase-only-runtime\.js'/);
assert.match(vpsSource, /export const isVpsStagingMode = vpsDataMode === 'vps-staging';/);
assert.match(vpsSource, /export const isVpsApiMode = isVpsStagingMode \|\| isVpsProductionMode;/);
assert.match(vpsSource, /export const isVpsMode = isVpsStagingMode;/);
assert.match(firebaseOnlySource, /export const isVpsMode = false;/);
assert.match(firebaseOnlySource, /export const isVpsStagingMode = false;/);
assert.match(firebaseOnlySource, /HD_MANAGER_FIREBASE_ONLY/);
assert.doesNotMatch(firebaseOnlySource, /VITE_API_BASE_URL|\/api\/v1|hdConnectStaging/);
assert.match(appSource, /from '@hd\/hd-connect-runtime';/);
assert.doesNotMatch(appSource, /from '\.\/api\/hdConnectStaging\.js';/);
assert.doesNotMatch(mainSource, /AdminConsolePage|platform-admin/);

console.log('Hybrid runtime safety checks passed.');
