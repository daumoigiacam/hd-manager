import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

test('Android crypto prompt uses strong authentication and official Keystore flags', async () => {
  execFileSync(process.execPath, ['scripts/patch-native-biometric.mjs'], { timeout: 10000 });
  const base = 'node_modules/@capgo/capacitor-native-biometric/android/src/main/java/ee/forgr/biometric/';
  const config = await readFile(base + 'BiometricAuthenticatorConfig.java', 'utf8');
  assert.doesNotMatch(config, /Authenticators\.BIOMETRIC_WEAK/);
  for (const name of ['BiometricAuthenticatorConfig.java', 'AuthActivity.java']) {
    const text = await readFile(base + name, 'utf8');
    assert.match(text, /KEY_AUTH_BIOMETRIC_STRONG = KeyProperties\.AUTH_BIOMETRIC_STRONG/);
    assert.match(text, /KEY_AUTH_DEVICE_CREDENTIAL = KeyProperties\.AUTH_DEVICE_CREDENTIAL/);
    assert.doesNotMatch(text, /KEY_AUTH_BIOMETRIC_WEAK/);
    execFileSync(process.execPath, ['scripts/patch-native-biometric.mjs'], { timeout: 10000 });
    assert.equal(await readFile(base + name, 'utf8'), text, 'repeated install does not duplicate patch');
  }
  const activity = await readFile(base + 'AuthActivity.java', 'utf8');
  assert.match(activity, /catch \(RuntimeException error\)/);
  assert.match(activity, /finishActivity\("error", 0,/);
});
