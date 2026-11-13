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

// Local frame profiling identified repeated serialization of the shared XML
// preference file on queued-work-looper. Derived Home caches live in that same
// SDK file. Keep the frequently updated signed-session record in a small file,
// using the SAME SDK encryption, key alias and permission verification. This is
// a storage placement fix, not another session manager or a permission cache.
{
  const target = new URL(directory + 'NativeBiometric.java', base);
  let source = await readFile(target, 'utf8');
  if (!source.includes('// HD_LOCAL_SESSION_PREFS_V1')) {
    const replaceOnce = (before, after) => {
      if (source.split(before).length !== 2) throw new Error('Session preferences patch context changed');
      source = source.replace(before, after);
    };
    const start = source.indexOf('    public void setData(final PluginCall call)');
    const end = source.indexOf('    @ActivityCallback', start);
    if (start < 0 || end < start) throw new Error('SDK data API boundaries changed');
    const before = source.slice(start, end);
    let methods = before;
    const editor = 'getContext()\n                    .getSharedPreferences(NATIVE_BIOMETRIC_SHARED_PREFERENCES, Context.MODE_PRIVATE)';
    if (!methods.includes(editor)) throw new Error('SDK setData preferences changed');
    methods = methods.replace(editor, 'offlineSessionPreferences(key)');
    const getter = 'SharedPreferences sharedPreferences = getContext().getSharedPreferences(NATIVE_BIOMETRIC_SHARED_PREFERENCES, Context.MODE_PRIVATE);';
    if (!methods.includes(getter)) throw new Error('SDK getData preferences changed');
    methods = methods.replace(getter, `SharedPreferences sharedPreferences;
        try { sharedPreferences = offlineSessionPreferences(key); }
        catch (IOException error) { call.reject("Failed to open protected data", error); return; }`);
    const deletion = 'getContext()\n                .getSharedPreferences(NATIVE_BIOMETRIC_SHARED_PREFERENCES, Context.MODE_PRIVATE)';
    if (!methods.includes(deletion)) throw new Error('SDK deleteData preferences changed');
    methods = methods.replace(deletion, 'offlineSessionPreferences(key)');
    replaceOnce(before, methods);
    const helper = `
    // HD_LOCAL_SESSION_PREFS_V1
    private synchronized SharedPreferences offlineSessionPreferences(String key) throws IOException {
        SharedPreferences legacy = getContext().getSharedPreferences(NATIVE_BIOMETRIC_SHARED_PREFERENCES, Context.MODE_PRIVATE);
        if (!"com.hdmanager.app.localdev".equals(getContext().getPackageName()) || !key.startsWith("offline-customer-session:")) return legacy;
        SharedPreferences isolated = getContext().getSharedPreferences("HDLocalSignedSessionV1", Context.MODE_PRIVATE);
        String storageKey = dataStorageKey(key), marker = "migrated:" + storageKey;
        if (!isolated.getBoolean(marker, false)) {
            // Copy ciphertext without decrypting or changing the Keystore key.
            // Publish the copy and migration marker atomically. The marker is
            // deliberately retained on deletion so stale legacy data can NEVER
            // be restored after logout. Never erase the original backup here.
            SharedPreferences.Editor migration = isolated.edit().putBoolean(marker, true);
            String encrypted = legacy.getString(storageKey, null);
            if (encrypted != null) migration.putString(storageKey, encrypted);
            if (!migration.commit()) throw new IOException("Protected data migration failed");
        }
        return isolated;
    }

`;
    replaceOnce('    @PluginMethod\n    public void setData(final PluginCall call)', helper + '    @PluginMethod\n    public void setData(final PluginCall call)');
    await writeFile(target, source);
    console.log('Applied Local signed-session preference isolation (no key/data values)');
  }
}
