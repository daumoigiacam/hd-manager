import fs from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import crypto from 'node:crypto';
const root='test-results/phase2-performance-20261102',adb='D:/HD-DEV/android/sdk/platform-tools/adb.exe',serial='emulator-5554';
const apk='performance/phase2/android-lab/macrobenchmark/build/outputs/apk/benchmark/macrobenchmark-benchmark.apk';
const bytes=await fs.readFile(apk),started=Date.now();
const state={at:new Date().toISOString(),status:'BUILT_WAITING_FOR_SOAK',package:'com.hdmanager.perflab.benchmark',
 target:'com.hdmanager.perflab',apk,apkBytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),
 dependency:'androidx.benchmark:benchmark-macro-junit4:1.4.1',productionTargetAllowed:false,
 emulatorSuppressedErrors:['EMULATOR'],scope:'Synthetic fixture only; not full Capacitor release or all-phone acceptance'};
const publish=async()=>{await fs.writeFile(`${root}/macro-state.json`,JSON.stringify(state,null,2));execFileSync(process.execPath,['scripts/phase2-report.mjs'],{windowsHide:true,stdio:'ignore'})};
await publish();
let completed=null;
while(Date.now()-started<130*60000){
 try{completed=JSON.parse(await fs.readFile(`${root}/native-memory-result.json`,'utf8'))}catch{/* wait for actual finished observation */}
 if(completed)break;
 await new Promise(r=>setTimeout(r,15000));
}
if(!completed||completed.elapsedMs<7200000||completed.status!=='OBSERVATION_COMPLETE_NOT_LEAK_PROOF'){
 state.status='NOT_RUN_SOAK_INCOMPLETE';await publish();process.exitCode=1;
}else{
 const command=(args,timeout=30000)=>execFileSync(adb,['-s',serial,...args],{encoding:'utf8',timeout,windowsHide:true});
 try{
  // Installing/running the benchmark waits for soak: cold starts deliberately
  // stop ONLY the fixture app. This would invalidate an overlapping memory run.
  state.status='RUNNING';state.startedAt=new Date().toISOString();await publish();
  state.install=command(['install','-r',apk]);
  state.instrumentationOutput=command(['shell','am','instrument','-w','-r',
   '-e','androidx.benchmark.suppressErrors','EMULATOR',
   '-e','additionalTestOutputDir','/sdcard/Android/media/com.hdmanager.perflab.benchmark/',
   'com.hdmanager.perflab.benchmark/androidx.test.runner.AndroidJUnitRunner'],15*60000);
  state.status=/OK \(2 tests\)/.test(state.instrumentationOutput)?'SYNTHETIC_MACRO_TESTS_COMPLETED':'INSTRUMENTATION_FAILED';
  const files=command(['shell','find','/sdcard/Android/media/com.hdmanager.perflab.benchmark','-type','f']).trim().split(/\r?\n/).filter(Boolean);
  state.outputFiles=[];
  for(const file of files){
   if(!file.startsWith('/sdcard/Android/media/com.hdmanager.perflab.benchmark/')||file.includes('..'))throw Error('Unsafe benchmark output path');
   // JSON summaries only here; Perfetto traces remain in the isolated test
   // package output folder, not copied from any real application's storage.
   if(!file.endsWith('.json'))continue;
   const name=file.split('/').at(-1);state.outputFiles.push(name);
   command(['pull',file,`${root}/${name}`]);
  }
 }catch(error){state.status='INSTRUMENTATION_FAILED';state.error=String(error.message).slice(0,1000)}
 state.endedAt=new Date().toISOString();await publish();
}
