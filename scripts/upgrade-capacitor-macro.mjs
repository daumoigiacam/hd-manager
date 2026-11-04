import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {assertNoActiveUpgradeSoak} from './helpers/upgrade-observation-barrier.mjs';
import {assertVerificationFixtureReady} from './helpers/verification-fixture-preflight.mjs';
const cohort=process.argv[2];if(!/^(?:baseline|baseline-native-probe-v2|baseline-native-v[34]|baseline-quiet-probe|after-[a-z0-9-]+)$/.test(cohort||''))throw Error('Explicit candidate cohort required');
const method=process.argv.find(v=>v.startsWith('--method='))?.slice(9)||'';
if(method&&!['coldSyntheticPasswordLogin','warmSyntheticPasswordLogin'].includes(method))throw Error('Unknown benchmark method');
const harness=process.argv.find(v=>v.startsWith('--harness='))?.slice(10)||'after-native-probe';
if(!/^after-[a-z0-9-]+$/.test(harness))throw Error('Unknown harness cohort');
const runId=crypto.randomUUID();
const root='test-results/performance-upgrade-20261103',buildRoot=cohort==='baseline'?'test-results/phase2-verification-20261102':`${root}/${cohort}`;
await assertNoActiveUpgradeSoak();
const fixtureAvailability=await assertVerificationFixtureReady();
const soak=JSON.parse(await fs.readFile(`${root}/soak-integrated/sdk-soak-result.json`,'utf8')),worker=JSON.parse(await fs.readFile(`${root}/worker-heap-two-hour.json`,'utf8'));
if(!soak.state.endedAt||soak.state.elapsedMs<7200000||!worker.endedAt||worker.elapsedMs<7200000)throw Error('Both independent two-hour collectors must finish before any install/navigation');
const out=`${root}/native-macro-${cohort}-${runId}`;await fs.mkdir(out,{recursive:true});
const adb='D:/HD-DEV/android/sdk/platform-tools/adb.exe',serial='emulator-5554',pkg='com.hdmanager.caplab',testPkg=pkg+'.benchmark';
const call=(args,timeout=30000)=>execFileSync(adb,['-s',serial,...args],{encoding:'utf8',windowsHide:true,timeout});
const result={at:new Date().toISOString(),cohort,runId,method:method||'cold+warm',harness,status:'RUNNING',pid:process.pid,package:pkg,realAccounts:false,productionRequests:0,apks:[],files:[],fixtureAvailability,
 conditions:'Release-like non-debuggable/profileable Capacitor APK; AndroidX Macrobenchmark 1.4.1, CompilationMode.None, five cold + five warm explicit synthetic password logins. TTID is native StartupTimingMetric; TTFD is the test subclass native anchor after source/commit/projection readiness. Home shell/interactive/data times use the probe anchor at synthetic login submit. UIAutomator password entry is included in native TTFD, not in login-to-Home probe duration. Emulator-only and local demo SDK; not production authentication/network acceptance.'};
const write=()=>fs.writeFile(`${out}/state.json`,JSON.stringify(result,null,2));await write();
try{
 const identity=JSON.parse(await fs.readFile(`${buildRoot}/capacitor-build-identity.json`,'utf8'));if(identity.project!=='demo-hdm-perf-verification')throw Error('Not the synthetic build project');result.buildIdentity=identity;
 result.sourceReadinessReader=identity.sourceReadinessReader?.revision||identity.derivedNativeHarness?.sourceReadinessRevision;
 if(result.sourceReadinessReader!=='current-root-v2')throw Error('Native measurement requires the corrected current-root reader in the actual APK');
 result.loginClockRevision=identity.sourceLoginClockRevision||identity.derivedNativeHarness?.loginClockRevision;
 if(result.loginClockRevision!=='trusted-intent-v2')throw Error('Full login timing requires the actual trusted-intent probe in the APK');
 result.fixtureManifest=JSON.parse(await fs.readFile(`${root}/rich-service/fixture-manifest.json`,'utf8'));
 if(result.fixtureManifest.project!==identity.project)throw Error('Fixture and build project differ');
 result.device={serial,abi:call(['shell','getprop','ro.product.cpu.abi']).trim(),graphics:call(['shell','getprop','ro.hardware.egl']).trim(),screen:call(['shell','wm','size']).trim(),density:call(['shell','wm','density']).trim(),memTotalKiB:Number(call(['shell','cat','/proc/meminfo']).match(/^MemTotal:\s*(\d+)/m)?.[1])||null,api:call(['shell','getprop','ro.build.version.sdk']).trim(),model:call(['shell','getprop','ro.product.model']).trim(),webview:call(['shell','dumpsys','webviewupdate']).match(/Current WebView package[^\n]*/)?.[0]||null};
 result.device.gles=call(['shell','dumpsys','SurfaceFlinger']).split(/\r?\n/).find(line=>/^\s*GLES:/.test(line))?.trim()||null;
 result.device.graphicsQualification='Runtime GLES line recorded for this run; an EGL emulation property alone does not identify host GPU versus software rendering. No emulator/display configuration was changed.';
 // The observation barriers above are mandatory before stopping this owned test package.
 call(['shell','am','force-stop','com.hdmanager.caplab.diag']);
 const apks=[`${buildRoot}/capacitor-project/app/build/outputs/apk/release/app-release.apk`,`${root}/${harness}/capacitor-project/macrobenchmark/build/outputs/apk/benchmark/macrobenchmark-benchmark.apk`];
 for(const file of apks){const bytes=await fs.readFile(file);result.apks.push({file,bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')});call(['install','-r',file],60000)}
 // adb reverse mappings do not survive an emulator reboot. A missing mapping
 // is an unavailable fixture, never a slow-login app observation.
 for(const port of[8185,9199,5002])call(['reverse',`tcp:${port}`,`tcp:${port}`]);
 result.fixtureReverseMappings=call(['reverse','--list']);
 const remote=`/sdcard/Android/media/${testPkg}/upgrade-20261103-${cohort}-${runId}`;
 try{call(['shell','test','-e',remote]);throw Error('Run-scoped artifact directory already exists')}catch(error){if(error.status!==1)throw error}
 call(['shell','mkdir','-p',remote]);
 // AndroidX clears its output directory at instrumentation startup. A marker
 // INSIDE that directory would disappear. UUID isolation is the freshness
 // contract; never collect old default-directory JSONL as a fallback.
 result.remote=remote;result.startedAt=new Date().toISOString();await write();
 result.instrumentation=call(['shell','am','instrument','-w','-r','-e','class','com.hdmanager.caplab.benchmark.CapacitorBenchmark'+(method?'#'+method:''),'-e','additionalTestOutputDir',remote,'-e','androidx.benchmark.suppressErrors','EMULATOR',`${testPkg}/androidx.test.runner.AndroidJUnitRunner`],20*60000);
 for(const dir of [remote]){
  if(dir!==remote){try{call(['shell','test','-d',dir])}catch(error){if(error.status===1)continue;throw error}}
  const files=call(['shell','find',dir,'-type','f']).trim().split(/\r?\n/).filter(Boolean);
  for(const file of files){if(!file.startsWith(dir+'/')||file.includes('..'))throw Error('Unexpected benchmark output path');if(!/\.(?:json|jsonl|perfetto-trace|trace|xml|png)$/.test(file))continue;
   const destination=path.join(out,(dir===remote?'':'external-')+path.basename(file));call(['pull',file,destination],60000);const bytes=await fs.readFile(destination);result.files.push({file:destination,remote:file,bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')});
  }
 }
 result.status=(method?/OK \(1 test\)/:/OK \(2 tests\)/).test(result.instrumentation)?'SYNTHETIC_NATIVE_MEASURED_NOT_UNIVERSAL_ACCEPTANCE':'FAILED';
 if(result.status==='FAILED')process.exitCode=1;
}catch(error){result.status='FAILED';result.error=error.message;process.exitCode=1}
finally{result.endedAt=new Date().toISOString();await write();console.log(JSON.stringify({cohort,status:result.status,error:result.error,files:result.files.length}))}
