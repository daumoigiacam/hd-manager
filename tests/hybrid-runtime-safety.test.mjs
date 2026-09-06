import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [viteSource, vpsSource] = await Promise.all([
  readFile(new URL('../vite.config.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/api/hdConnectStaging.js', import.meta.url), 'utf8'),
]);

assert.match(viteSource, /const isVpsStagingBuild = vpsDataMode === 'vps-staging';/);
assert.match(viteSource, /const isVpsProductionBuild = vpsDataMode === 'vps-production';/);
assert.match(viteSource, /const isVpsApiBuild = isVpsStagingBuild \|\| isVpsProductionBuild;/);
assert.match(viteSource, /const useCloudData = !usePreviewData && !isVpsApiBuild;/);
assert.match(viteSource, /'VITE_INVENTORY_VPS_ENABLED'/);
assert.match(viteSource, /isVpsApiBuild \? '\.\/src\/mocks\/firebase-runtime-vps\.js' : '\.\/src\/config\/firebase-runtime\.js'/);
assert.match(vpsSource, /export const isVpsStagingMode = vpsDataMode === 'vps-staging';/);
assert.match(vpsSource, /export const isVpsApiMode = isVpsStagingMode \|\| isVpsProductionMode;/);
assert.match(vpsSource, /export const isVpsMode = isVpsApiMode;/);

console.log('VPS production runtime safety checks passed.');
