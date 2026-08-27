import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [viteSource, vpsSource] = await Promise.all([
  readFile(new URL('../vite.config.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/api/hdConnectStaging.js', import.meta.url), 'utf8'),
]);

assert.match(viteSource, /const isVpsStagingBuild = vpsDataMode === 'vps-staging';/);
assert.match(viteSource, /const useCloudData = !usePreviewData && !isVpsStagingBuild;/);
assert.match(viteSource, /isVpsStagingBuild \? '\.\/src\/mocks\/firebase-runtime-vps\.js' : '\.\/src\/config\/firebase-runtime\.js'/);
assert.match(vpsSource, /export const isVpsStagingMode = vpsDataMode === 'vps-staging';/);
assert.match(vpsSource, /export const isVpsApiMode = isVpsStagingMode \|\| isVpsProductionMode;/);
assert.match(vpsSource, /export const isVpsMode = isVpsStagingMode;/);

console.log('Hybrid runtime safety checks passed.');
