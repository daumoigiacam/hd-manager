import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawn, execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {readFile, writeFile, mkdir, stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildAcceptanceApk, ACCEPTANCE_PACKAGE} from './android-acceptance-apk.mjs';
import {productionOfflineConfiguration,verifyProductionOfflineEndpoint} from './production-offline-preflight.mjs';

export const WEBSITE = 'https://app.hdconnect.net';
export const IDENTITY_ORIGIN = 'https://us-central1-hd-manager-c5839.cloudfunctions.net';

// Same canonical Firebase app as the website, with an independently installed
// debug package. Never silently enable a signed transport that is not deployed.
export function productionQaSettings(base, sourceCommit, offlineConfiguration=null) {
  assert.match(sourceCommit, /^[a-f0-9]{40}$/);
  assert.equal(base.appId, 'com.hdmanager.app');
  assert.equal(base.server?.url, undefined, 'Bundle canonical assets; do not wrap an old website');
  const capacitor = structuredClone(base);
  capacitor.server = {hostname: 'app.hdconnect.net', androidScheme: 'https', cleartext: false};
  capacitor.loggingBehavior = 'none';
  const environment = {
    VITE_DATA_MODE: 'cloud', VITE_FIREBASE_PROJECT_ID: 'hd-manager-c5839',
    VITE_HD_APP_ID: 'hd-manager-production', VITE_FIREBASE_EMULATORS: 'false',
    VITE_IDENTITY_API_BASE_URL: IDENTITY_ORIGIN, VITE_IDENTITY_AUTH_REGION: '',
    VITE_FIRESTORE_READ_WORKER: 'true', VITE_WORKER_TRANSFER_PROFILE: 'balanced-64k',
    VITE_NATIVE_MINIMAL_ENTRY: 'false', VITE_NATIVE_STARTUP_CORE_PRELOAD: 'false',
    VITE_OFFLINE_CUSTOMER_PILOT: 'false', VITE_OFFLINE_RUNTIME: '',
    VITE_HD_BUILD_ID: sourceCommit,
  };
  if(offlineConfiguration) {
    const offline=productionOfflineConfiguration(offlineConfiguration);
    Object.assign(environment,{
      VITE_OFFLINE_RUNTIME:'trusted-v1',VITE_OFFLINE_API_BASE_URL:offline.apiBaseUrl,
      VITE_OFFLINE_APP_ORIGIN:offline.appOrigin,VITE_OFFLINE_ENVIRONMENT:offline.environment,
      VITE_OFFLINE_VERIFYING_JWK:JSON.stringify(offline.publicKey),VITE_OFFLINE_MAX_MS:String(offline.maxOfflineMs),
      VITE_CUSTOMER_DELTA_SYNC:'true',
    });
  }
  return {capacitor, environment, website: WEBSITE, packageId: ACCEPTANCE_PACKAGE,
    signedOffline: offlineConfiguration?'CONFIGURED_SERVER_GRANT_AND_DEVICE_VERIFICATION_REQUIRED':'NOT_ENABLED_PRODUCTION_TRANSPORT_NOT_READY',
    offlineApi: WEBSITE + '/api/offline/'};
}

function run(executable, args, cwd, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {cwd, env, stdio: 'inherit', windowsHide: true});
    child.once('error', reject);
    child.once('exit', code => code === 0 ? resolve() : reject(new Error(`Build command failed (${code})`)));
  });
}

export async function buildProductionQaApk(output,{offlineConfigurationFile}={}) {
  const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
  assert.equal(process.cwd(), root, 'Run from the repository root');
  const destination = path.resolve(output);
  assert.ok(destination.startsWith(path.join(root, '.artifacts') + path.sep), 'Output must be a new .artifacts/ directory');
  try {await stat(destination); throw new Error('Preserve existing artifacts; choose a new output directory');}
  catch (error) {if (error.code !== 'ENOENT') throw error;}
  let offlineConfiguration=null,offlinePreflight=null;
  if(offlineConfigurationFile) {
    const descriptor=JSON.parse(await readFile(offlineConfigurationFile,'utf8'));
    offlineConfiguration=descriptor.productionConfiguration||descriptor;
    offlinePreflight=await verifyProductionOfflineEndpoint(offlineConfiguration);
  }
  await mkdir(destination, {recursive: true});
  const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], {encoding: 'utf8', windowsHide: true}).trim();
  assert.equal(execFileSync('git', ['diff', '--name-only', 'HEAD'], {encoding: 'utf8', windowsHide: true}).trim(), '', 'Commit reviewed source before building');
  const settings = productionQaSettings(JSON.parse(await readFile('capacitor.config.json', 'utf8')), sourceCommit,offlineConfiguration);
  const env = {...process.env};
  for (const key of Object.keys(env)) {
    if (key.startsWith('VITE_') || key.startsWith('HD_RELEASE_') || key === 'GITHUB_SHA') delete env[key];
  }
  Object.assign(env, settings.environment);
  env.JAVA_HOME ||= 'C:/Program Files/Android/Android Studio/jbr';
  env.ANDROID_HOME ||= 'D:/HD-DEV/android/sdk';
  env.ANDROID_SDK_ROOT ||= env.ANDROID_HOME;
  env.GRADLE_USER_HOME ||= 'D:/HD-DEV/gradle';
  // Require the existing debug identity. Gradle must not create a replacement.
  const debugKey = path.join(process.env.USERPROFILE, '.android', 'debug.keystore');
  const debugKeyHash = createHash('sha256').update(await readFile(debugKey)).digest('hex');
  const web = path.join(destination, 'web');
  await run(process.execPath, [path.resolve('node_modules/vite/bin/vite.js'), 'build', '--mode', 'production', '--outDir', web],
    path.join(root, 'development/hd-manager/application'), env);
  await run(process.execPath, ['scripts/verify-firebase-production-bundle.mjs', web], root, env);
  const version = JSON.parse(await readFile(path.join(web, 'version.json'), 'utf8'));
  assert.equal(version.buildId, sourceCommit);
  const index = await readFile(path.join(web, 'index.html'), 'utf8');
  assert.ok(!index.includes('acceptance-init.js') && !index.includes('hd-preview-auth-v1'));

  // Use the installed Capacitor copier/plugin registry, not an archived source
  // snapshot. Restore its generated tracked Gradle files byte-for-byte afterward.
  const require = createRequire(import.meta.url);
  const {loadConfig} = require('@capacitor/cli/dist/config.js');
  const {copy} = require('@capacitor/cli/dist/tasks/copy.js');
  const {updateAndroid} = require('@capacitor/cli/dist/android/update.js');
  const generated = ['android/capacitor.settings.gradle', 'android/app/capacitor.build.gradle',
    'android/capacitor-cordova-android-plugins/build.gradle',
    'android/capacitor-cordova-android-plugins/src/main/AndroidManifest.xml'];
  const originals = new Map();
  for (const file of generated) {
    try {originals.set(file, await readFile(file));} catch (error) {if (error.code !== 'ENOENT') throw error;}
  }
  let apk;
  try {
    const config = await loadConfig();
    config.app.webDir = web;
    config.app.webDirAbs = web;
    config.app.extConfig = {...settings.capacitor, webDir: web};
    await copy(config, 'android');
    await updateAndroid(config);
    // Kotlin's separate compiler process misdecodes Vietnamese Windows paths.
    // Keep the existing SDK/plugins and compile in the UTF-8 Gradle process.
    apk = await buildAcceptanceApk({buildOutput: web, output: destination, buildEnvironment: env, inProcessKotlin: true});
  } finally {
    for (const [file, bytes] of originals) await writeFile(file, bytes);
  }
  assert.equal(createHash('sha256').update(await readFile(debugKey)).digest('hex'), debugKeyHash, 'Debug signing identity changed');
  assert.equal(execFileSync('git', ['diff', '--name-only', 'HEAD'], {encoding: 'utf8', windowsHide: true}).trim(), '', 'Tracked build inputs changed');
  const bytes = await readFile(apk);
  const manifest = {at: new Date().toISOString(), status: 'BUILT_DEVICE_VERIFICATION_REQUIRED',
    sourceCommit, canonicalSource: 'development/hd-manager/application', apk, bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'), packageId: settings.packageId,
    buildType: 'DEVELOPMENT_QA_DEBUG_NOT_OFFICIAL_RELEASE', website: WEBSITE,
    webViewOrigin: WEBSITE, bundledAssets: true, serverUrl: null,
    identityApiOrigin: IDENTITY_ORIGIN, firebaseProjectId: 'hd-manager-c5839', appId: 'hd-manager-production',
    signedOffline: settings.signedOffline, offlineApi: settings.offlineApi,offlinePreflight,
    releaseKeyTouched: false, debugKeyPreserved: true, fixtureInjected: false,
    productionDeployed: false, environment: settings.environment};
  await writeFile(path.join(destination, 'build-manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(JSON.stringify(manifest, null, 2));
  return manifest;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const output = process.argv[2] || `.artifacts/hd-manager-production-qa-${Date.now()}`;
  assert.ok(process.argv.length===3||process.argv.length===2||(process.argv.length===5&&process.argv[3]==='--offline-config'),'Usage: node scripts/build-production-qa-apk.mjs [output] [--offline-config public-configuration.json]');
  await buildProductionQaApk(output,{offlineConfigurationFile:process.argv[4]});
}
