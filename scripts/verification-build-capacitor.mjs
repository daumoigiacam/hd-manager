import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {build as viteBuild} from 'vite';
import {readModuleSourceReadiness,hasActiveModulePending,isExplicitlyVisible} from './helpers/module-source-readiness.mjs';
import {instrumentSearchPhases} from '../performance/upgrade-20261103/search-phase-transform.mjs';
import {loadNativeListenerReleasePatch} from './native-listener-release-patch.mjs';

const project='demo-hdm-perf-verification',root=process.env.HD_VERIFICATION_OUTPUT||'test-results/phase2-verification-20261102';
const homeModelPilot=process.env.HD_VERIFICATION_HOME_MODEL_PILOT==='true',homeModelReceipts=[];
if(homeModelPilot&&(!/^test-results\/performance-upgrade-20261103\/after-home-model-[a-z0-9-]+$/.test(root)||process.env.VITE_HOME_PRIORITY_DATA!=='true'))throw Error('Read-model pilot requires isolated explicit Home QA cohort');
const homeModelPlugin=homeModelPilot?(await import('./helpers/home-read-model-pilot-plugin.mjs')).homeReadModelPilotPlugin({enabled:true,project,receipts:homeModelReceipts}):null;
const searchPhaseDiagnostics=process.env.HD_VERIFICATION_SEARCH_DIAGNOSTICS==='true',searchTransformReceipts=[];
const nativeListenerReleasePatch=process.env.HD_VERIFICATION_NATIVE_LISTENER_RELEASE_PATCH==='true';
if(nativeListenerReleasePatch&&!root.endsWith('/after-native-listener-release'))throw Error('Native bridge pilot requires its own isolated cohort');
if(searchPhaseDiagnostics&&!root.endsWith('/after-search-phase-diagnostic'))throw Error('Search instrumentation requires an explicitly diagnostic fixture output');
if(searchPhaseDiagnostics){
 // This diagnostic cohort is queued after the natural two-hour run. Preserve
 // the old candidate's retention evidence before the controller can replace it.
 const gate='test-results/performance-upgrade-20261103/post-soak-heap-status.json',deadline=Date.now()+60000;
 while(true){const state=JSON.parse(await fs.readFile(gate,'utf8'));if(state.endedAt)break;if(Date.now()>=deadline)throw Error('Post-soak retention capture has not ended; do not replace the observed APK');await new Promise(r=>setTimeout(r,1000))}
}
if(!/^test-results\/(?:phase2-verification-20261102|performance-upgrade-20261103\/[a-z0-9-]+)$/.test(root))throw Error('Fixture output must stay in an approved test-results project');
const native=`${root}/capacitor-project`,assets=`${native}/app/src/main/assets`;
async function fingerprintSourceInputs(){
 const files=[];
 async function visit(file){const entry=await fs.stat(file);if(entry.isDirectory()){for(const name of(await fs.readdir(file)).sort())await visit(path.join(file,name))}
 else {const bytes=await fs.readFile(file);files.push({file:file.replaceAll('\\','/'),bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')})}}
 for(const file of ['src','public','index.html','vite.config.js','package.json','package-lock.json','performance/phase2-verification/probe.js','performance/phase2-verification/VerificationActivity.java','performance/phase2-verification/CapacitorBenchmark.java','performance/phase2-verification/CapacitorBaselineProfile.java'])await visit(file);
 if(homeModelPilot)for(const file of ['performance/upgrade-20261103/pilots/LocalHomeReadModelView.jsx','scripts/helpers/home-read-model-pilot-plugin.mjs'])await visit(file);
 return files;
}
const sourceInputsBefore=await fingerprintSourceInputs();
await fs.mkdir(`${native}/app/src/main`,{recursive:true});
// Copies, never patches the production Android project or its credential files.
for(const dir of ['java','res'])await fs.cp(`android/app/src/main/${dir}`,`${native}/app/src/main/${dir}`,{recursive:true});
const stringsFile=`${native}/app/src/main/res/values/strings.xml`;
await fs.writeFile(stringsFile,(await fs.readFile(stringsFile,'utf8')).replace(/(<string name="(?:app_name|title_activity_main)">)[^<]*/g,'$1HDM Verification'));
await fs.copyFile('android/variables.gradle',`${native}/variables.gradle`);
let settings=`pluginManagement { repositories { google(); mavenCentral(); gradlePluginPortal() } }\nrootProject.name='HDMCapacitorVerification'\ninclude ':app'\n`;
const deps=await fs.readFile('android/capacitor.settings.gradle','utf8');
settings+=deps.replace(/new File\('\.\.\/node_modules\//g,`new File('${path.resolve('node_modules').replaceAll('\\','/')}/`);
settings+=`\ninclude ':capacitor-cordova-android-plugins'\nproject(':capacitor-cordova-android-plugins').projectDir=new File('${path.resolve('android/capacitor-cordova-android-plugins').replaceAll('\\','/')}')\n`;
settings+=`include ':macrobenchmark'\n`;
await fs.writeFile(`${native}/settings.gradle`,settings);
await fs.writeFile(`${native}/build.gradle`, `buildscript { repositories { google(); mavenCentral() }; dependencies { classpath 'com.android.tools.build:gradle:8.13.0' } }\napply from:'variables.gradle'\nallprojects { repositories { google(); mavenCentral() } }\n`);
await fs.writeFile(`${native}/gradle.properties`,'org.gradle.jvmargs=-Xmx1536m\nandroid.useAndroidX=true\nandroid.overridePathCheck=true\n');
await fs.writeFile(`${native}/local.properties`,'sdk.dir=D\\:\\\\HD-DEV\\\\android\\\\sdk\n');
const plugins=[...deps.matchAll(/include '(:[^']+)'/g)].map(m=>m[1]).filter(n=>n!==':capacitor-android');
await fs.writeFile(`${native}/app/build.gradle`,`apply plugin:'com.android.application'
android {
 namespace 'com.hdmanager.app'
 compileSdk rootProject.ext.compileSdkVersion
 defaultConfig { applicationId 'com.hdmanager.caplab'; minSdk rootProject.ext.minSdkVersion; targetSdk rootProject.ext.targetSdkVersion; versionCode 26110201; versionName '1.0.11-verification'; testInstrumentationRunner 'androidx.test.runner.AndroidJUnitRunner' }
 buildFeatures { buildConfig true }
 compileOptions { sourceCompatibility JavaVersion.VERSION_21; targetCompatibility JavaVersion.VERSION_21 }
 buildTypes {
  release { debuggable false; minifyEnabled false; signingConfig signingConfigs.debug; buildConfigField 'boolean','VERIFICATION_DIAGNOSTIC','false' }
  diagnostic { initWith release; applicationIdSuffix '.diag'; matchingFallbacks=['release']; buildConfigField 'boolean','VERIFICATION_DIAGNOSTIC','true' }
 }
}
dependencies {
 implementation "androidx.appcompat:appcompat:$androidxAppCompatVersion"
 implementation "androidx.coordinatorlayout:coordinatorlayout:$androidxCoordinatorLayoutVersion"
 implementation "androidx.core:core-splashscreen:$coreSplashScreenVersion"
 implementation project(':capacitor-android')
 implementation project(':capacitor-cordova-android-plugins')
 ${plugins.map(n=>`implementation project('${n}')`).join('\n ')}
}
`);
let manifest=await fs.readFile('android/app/src/main/AndroidManifest.xml','utf8');
manifest=manifest.replace('android:name=".MainActivity"','android:name="com.hdmanager.app.VerificationActivity"');
manifest=manifest.replace('android:usesCleartextTraffic="false"','android:usesCleartextTraffic="false" android:networkSecurityConfig="@xml/verification_network"');
manifest=manifest.replace('<activity','<profileable android:shell="true"/><activity');
await fs.writeFile(`${native}/app/src/main/AndroidManifest.xml`,manifest);
await fs.writeFile(`${native}/app/src/main/res/xml/verification_network.xml`,`<network-security-config><base-config cleartextTrafficPermitted="false"/><domain-config cleartextTrafficPermitted="true"><domain includeSubdomains="false">127.0.0.1</domain><domain includeSubdomains="false">localhost</domain></domain-config></network-security-config>`);
await fs.copyFile('performance/phase2-verification/VerificationActivity.java',`${native}/app/src/main/java/com/hdmanager/app/VerificationActivity.java`);
await fs.mkdir(assets,{recursive:true});
let nativeBridge={override:false,baseSha256:crypto.createHash('sha256').update(await fs.readFile('node_modules/@capacitor/android/capacitor/src/main/assets/native-bridge.js')).digest('hex'),
 android:JSON.parse(await fs.readFile('node_modules/@capacitor/android/package.json','utf8')).version,
 core:JSON.parse(await fs.readFile('node_modules/@capacitor/core/package.json','utf8')).version};
const nativeBridgeAsset=`${assets}/native-bridge.js`;
if(nativeListenerReleasePatch){
 const {code,...receipt}=await loadNativeListenerReleasePatch(process.cwd());
 await fs.writeFile(nativeBridgeAsset,code);nativeBridge={override:true,...receipt,bytes:Buffer.byteLength(code)};
 await fs.writeFile(`${root}/native-bridge-release-receipt.json`,JSON.stringify({...nativeBridge,nodeModulesModified:false,productionAndroidProjectModified:false},null,2));
}else{
 try{await fs.access(nativeBridgeAsset);throw Error('Unexpected pre-existing bridge override; do not reuse this cohort as a baseline')}catch(error){if(error.code!=='ENOENT')throw error}
}
for(const name of ['capacitor.plugins.json'])await fs.copyFile(`android/app/src/main/assets/${name}`,`${assets}/${name}`);
const config=JSON.parse(await fs.readFile('capacitor.config.json','utf8'));config.appId='com.hdmanager.caplab';config.appName='HD Verification';
config.server={hostname:'localhost',androidScheme:'https',allowNavigation:[]};
config.android={...(config.android||{}),allowMixedContent:true}; // test-only loopback Emulators, not a production setting
await fs.writeFile(`${assets}/capacitor.config.json`,JSON.stringify(config,null,2));
Object.assign(process.env,{VITE_DATA_MODE:'cloud',VITE_FIREBASE_EMULATORS:'true',VITE_FIREBASE_PROJECT_ID:project,
 VITE_FIREBASE_API_KEY:'synthetic-verification-key',VITE_FIREBASE_AUTH_DOMAIN:project+'.firebaseapp.com',
 VITE_FIREBASE_APP_ID:'synthetic-capacitor-verification',VITE_FIREBASE_STORAGE_BUCKET:project+'.appspot.com',
 VITE_FIREBASE_MESSAGING_SENDER_ID:'000000000000',VITE_FIREBASE_MEASUREMENT_ID:'',
 VITE_HD_APP_ID:'verification-fixture',VITE_HD_BUILD_ID:'verification-synthetic-only',
 VITE_FIRESTORE_READ_WORKER:'true',VITE_PERSONAL_HOME_WORKER:'true',
 VITE_EMPLOYEE_HOME_READ_MODEL:'false',VITE_PERFORMANCE_MONITOR:'false',VITE_FIREBASE_PERFORMANCE:'false',VITE_SOURCE_PHASE_DIAGNOSTICS:searchPhaseDiagnostics?'true':'false',
 VITE_FIREBASE_FUNCTIONS_REGION:'us-central1',VITE_SEPAY_API_BASE_URL:'http://127.0.0.1:5002/unsupported',
 VITE_IDENTITY_AUTH_REGION:'',VITE_ALLOW_PREVIEW_BUILD:'false'});
const plans=JSON.parse(await fs.readFile('docs/reports/phase2-performance-20261102/data-engine-integration.json','utf8')).descriptors.FOREGROUND_REALTIME_COLLECTIONS_BY_TAB;
const probe=`window.__hdLocalHomeReadModelPilot=${homeModelPilot};window.__hdSourceContract=${readModuleSourceReadiness.toString()};const isExplicitlyVisible=${isExplicitlyVisible.toString()};window.__hdModulePending=${hasActiveModulePending.toString()};window.__hdPlans=${JSON.stringify(plans)};`+(searchPhaseDiagnostics?'window.__HD_SOURCE_PHASE_TIMING__=true;':'')+(await fs.readFile('performance/phase2-verification/probe.js','utf8')).replace('[8185,9199,5002]',homeModelPilot?'[8185,9199,5002,5003]':'[8185,9199,5002]')+(searchPhaseDiagnostics?`;window.addEventListener('hd-startup-event',function(event){if(event.detail.name!=='data.source.phase')return;var list=window.__hdVerification.sourcePhases||(window.__hdVerification.sourcePhases=[]);list.push({at:performance.now(),detail:event.detail.detail});while(list.length>300)list.shift()});`:'');
const outDir=`${assets}/public`;
// Vite will recursively empty this directory. Verify the canonical target is
// inside THIS generated fixture project, never dist/ or the production assets.
const allowedRoot=await fs.realpath(root);
const actualOutput=await fs.realpath(outDir).catch(error=>{if(error.code==='ENOENT')return path.resolve(outDir);throw error});
if(!actualOutput.toLowerCase().startsWith((allowedRoot+path.sep).toLowerCase())||path.basename(actualOutput)!=='public')throw Error('Unsafe fixture output cleanup target');
await viteBuild({mode:'emulator',build:{outDir,sourcemap:'hidden',emptyOutDir:true},logLevel:'error',plugins:[...(homeModelPlugin?[homeModelPlugin]:[]),{
 name:'diagnostic-search-phases',enforce:'pre',transform(code,id){if(!searchPhaseDiagnostics)return null;const result=instrumentSearchPhases(code,id);if(result)searchTransformReceipts.push({id,originalSha256:crypto.createHash('sha256').update(code).digest('hex'),diagnosticSha256:crypto.createHash('sha256').update(result.code).digest('hex')});return result;},
},{
 name:'verification-probe-only',transformIndexHtml:{order:'pre',handler:html=>html.replace('<head>',()=>'<head><script>'+probe+'</script>')},
}],resolve:{alias:[{find:/^firebase\/firestore$/,replacement:path.resolve('performance/phase2-verification/counted-firestore.js')}]}});
if(homeModelPilot){if(homeModelReceipts.length!==2)throw Error('Missing Home pilot transform receipts');await fs.writeFile(`${root}/home-read-model-pilot-receipts.json`,JSON.stringify(homeModelReceipts,null,2));}
if(searchPhaseDiagnostics){if(new Set(searchTransformReceipts.map(r=>r.id.split('?')[0])).size!==2)throw Error('Search diagnostic transform boundaries missing');await fs.writeFile(`${root}/search-phase-transform-receipts.json`,JSON.stringify({at:new Date().toISOString(),diagnosticOnly:true,transformerSha256:crypto.createHash('sha256').update(await fs.readFile('performance/upgrade-20261103/search-phase-transform.mjs')).digest('hex'),receipts:searchTransformReceipts},null,2));}
const mapsDir=`${root}/source-maps/assets`;await fs.mkdir(mapsDir,{recursive:true});
for(const file of await fs.readdir(`${outDir}/assets`))if(file.endsWith('.map')){
 await fs.copyFile(`${outDir}/assets/${file}`,`${mapsDir}/${file}`);
 await fs.unlink(`${outDir}/assets/${file}`); // single known generated map, not a recursive delete
}
const maps=[];async function walk(dir){for(const e of await fs.readdir(dir,{withFileTypes:true})){
 const file=path.join(dir,e.name);if(e.isDirectory())await walk(file);else{const b=await fs.readFile(file);maps.push({file:path.relative(outDir,file).replaceAll('\\','/'),bytes:b.length,sha256:crypto.createHash('sha256').update(b).digest('hex')})}
}}
await walk(outDir);
await fs.mkdir(`${native}/macrobenchmark/src/main/java/com/hdmanager/caplab/benchmark`,{recursive:true});
await fs.copyFile('performance/phase2/android-lab/macrobenchmark/src/main/AndroidManifest.xml',`${native}/macrobenchmark/src/main/AndroidManifest.xml`);
await fs.copyFile('performance/phase2/android-lab/macrobenchmark/build.gradle',`${native}/macrobenchmark/build.gradle`);
await fs.copyFile('performance/phase2-verification/CapacitorBenchmark.java',`${native}/macrobenchmark/src/main/java/com/hdmanager/caplab/benchmark/CapacitorBenchmark.java`);
await fs.copyFile('performance/phase2-verification/CapacitorBaselineProfile.java',`${native}/macrobenchmark/src/main/java/com/hdmanager/caplab/benchmark/CapacitorBaselineProfile.java`);
let gradle=await fs.readFile(`${native}/macrobenchmark/build.gradle`,'utf8');gradle=gradle.replaceAll('com.hdmanager.perflab.benchmark','com.hdmanager.caplab.benchmark');await fs.writeFile(`${native}/macrobenchmark/build.gradle`,gradle);
await fs.appendFile(`${native}/macrobenchmark/build.gradle`,"\nandroid.sourceSets.main.java.exclude('com/hdmanager/perflab/**')\n");
await fs.writeFile(`${root}/capacitor-build-identity.json`,JSON.stringify({at:new Date().toISOString(),project,package:'com.hdmanager.caplab',diagnosticPackage:'com.hdmanager.caplab.diag',
 sourceBuilderSha256:crypto.createHash('sha256').update(await fs.readFile('scripts/verification-build-capacitor.mjs')).digest('hex'),
 sourceLoginClockRevision:'trusted-intent-v2',sourceProbeSha256:crypto.createHash('sha256').update(await fs.readFile('performance/phase2-verification/probe.js')).digest('hex'),
 sourceReadinessReader:{revision:'current-root-v2',functionSha256:crypto.createHash('sha256').update(readModuleSourceReadiness.toString()).digest('hex')},
 sourceMainActivitySha256:crypto.createHash('sha256').update(await fs.readFile('android/app/src/main/java/com/hdmanager/app/MainActivity.java')).digest('hex'),
 nativePlugins:plugins,nativeBridge,files:maps,featureFlags:{homeReadModelPilot:homeModelPilot,adaptivePerformance:process.env.VITE_ADAPTIVE_PERFORMANCE||'true',workerTransferProfile:process.env.VITE_WORKER_TRANSFER_PROFILE||'conservative-16k',workerInitialConcurrency:process.env.VITE_WORKER_INITIAL_CONCURRENCY||'2',workerTransferWindow:process.env.VITE_WORKER_TRANSFER_WINDOW||'1',homePriorityData:process.env.VITE_HOME_PRIORITY_DATA==='true',homeWorkerCriticalReads:process.env.VITE_HOME_WORKER_CRITICAL_READS==='true',nativeAuthJsonTransport:process.env.VITE_NATIVE_AUTH_JSON_TRANSPORT==='true'},productionEndpointsAllowed:false,transport:'Real Firebase SDK and workers, isolated demo Emulator; local identity fixture not real identity backend'},null,2));
const sourceInputsAfter=await fingerprintSourceInputs();
if(JSON.stringify(sourceInputsBefore)!==JSON.stringify(sourceInputsAfter))throw Error('Build source changed while compiling; do not use this cohort');
await fs.writeFile(`${root}/source-inputs.json`,JSON.stringify({at:new Date().toISOString(),unchangedDuringBuild:true,files:sourceInputsBefore},null,2));
console.log(JSON.stringify({native,files:maps.length,plugins:plugins.length,project}));
