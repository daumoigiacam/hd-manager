import test from 'node:test';
import assert from 'node:assert/strict';
import {productionQaSettings, WEBSITE, IDENTITY_ORIGIN} from '../scripts/build-production-qa-apk.mjs';

const commit = '941a40e8d0ea9b481ced65e26685cf953fe27fd7';
test('Production QA packages canonical assets in the existing separate debug package', () => {
  const base = {appId: 'com.hdmanager.app', appName: 'HD Manager', webDir: 'dist'};
  const result = productionQaSettings(base, commit);
  assert.equal(result.packageId, 'com.hdmanager.app.acceptance');
  assert.equal(result.capacitor.server.url, undefined);
  assert.equal(result.capacitor.server.androidScheme + '://' + result.capacitor.server.hostname, WEBSITE);
  assert.equal(result.capacitor.server.cleartext, false);
  assert.equal(result.environment.VITE_FIREBASE_PROJECT_ID, 'hd-manager-c5839');
  assert.equal(result.environment.VITE_HD_APP_ID, 'hd-manager-production');
  assert.equal(result.environment.VITE_IDENTITY_API_BASE_URL, IDENTITY_ORIGIN);
  assert.equal(base.server, undefined);
});
test('An undeployed signed transport never becomes a fake Offline readiness claim', () => {
  const result = productionQaSettings({appId: 'com.hdmanager.app'}, commit);
  assert.equal(result.environment.VITE_FIREBASE_EMULATORS, 'false');
  assert.equal(result.environment.VITE_OFFLINE_RUNTIME, '');
  assert.equal(result.environment.VITE_NATIVE_MINIMAL_ENTRY, 'false');
  assert.equal(result.offlineApi, WEBSITE + '/api/offline/');
  assert.equal(result.signedOffline, 'NOT_ENABLED_PRODUCTION_TRANSPORT_NOT_READY');
  assert.equal(result.environment.VITE_HD_BUILD_ID, commit);
});
test('QA packaging refuses a remote website wrapper, wrong package or ambiguous source', () => {
  assert.throws(() => productionQaSettings({appId: 'other'}, commit));
  assert.throws(() => productionQaSettings({appId: 'com.hdmanager.app', server: {url: WEBSITE}}, commit));
  assert.throws(() => productionQaSettings({appId: 'com.hdmanager.app'}, 'main'));
});
