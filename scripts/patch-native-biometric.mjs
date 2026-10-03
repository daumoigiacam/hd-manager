import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// Temporary, version-locked Android fix. Never relax protected storage to avoid a prompt.
const base = new URL('../node_modules/@capgo/capacitor-native-biometric/', import.meta.url);
const version = JSON.parse(await readFile(new URL('package.json', base), 'utf8')).version;
if (version !== '8.6.2') throw new Error(`Review biometric native patch for version ${version}`);
const directory = 'android/src/main/java/ee/forgr/biometric/';
for (const file of ['BiometricAuthenticatorConfig.java', 'AuthActivity.java']) {
  const target = new URL(directory + file, base);
  let source = await readFile(target, 'utf8');
  if (source.includes('// HD_MANAGER_STRONG_CRYPTO_V1')) continue;
  const replace = (before, after) => {
    if (!source.includes(before)) throw new Error(`Native patch context changed: ${file}: ${before}`);
    source = source.replaceAll(before, after);
  };
  replace('KEY_AUTH_BIOMETRIC_STRONG = 1;', 'KEY_AUTH_BIOMETRIC_STRONG = KeyProperties.AUTH_BIOMETRIC_STRONG;');
  replace('KEY_AUTH_DEVICE_CREDENTIAL = 4;', 'KEY_AUTH_DEVICE_CREDENTIAL = KeyProperties.AUTH_DEVICE_CREDENTIAL;');
  replace('KEY_AUTH_BIOMETRIC_STRONG | KEY_AUTH_BIOMETRIC_WEAK', 'KEY_AUTH_BIOMETRIC_STRONG');
  replace('private static final int KEY_AUTH_BIOMETRIC_WEAK = 2;', '// HD_MANAGER_STRONG_CRYPTO_V1');
  if (file === 'BiometricAuthenticatorConfig.java') {
    replace('BiometricManager.Authenticators.BIOMETRIC_STRONG | BiometricManager.Authenticators.BIOMETRIC_WEAK', 'BiometricManager.Authenticators.BIOMETRIC_STRONG');
  } else {
    replace('setContentView(R.layout.activity_auth_acitivy);', `try {
            startAuthentication();
        } catch (RuntimeException error) {
            android.util.Log.e("HDManagerBiometric", "Native authentication could not start", error);
            finishActivity("error", 0, "Biometric authentication unavailable. Use password.");
        }
    }

    private void startAuthentication() {
        setContentView(R.layout.activity_auth_acitivy);`);
  }
  await writeFile(target, source);
  console.log(`Applied strong-crypto fix: ${fileURLToPath(target)}`);
}
