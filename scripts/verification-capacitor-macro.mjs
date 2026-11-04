import fs from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import crypto from 'node:crypto';
const root='test-results/phase2-verification-20261102',native=`${root}/capacitor-project`,adb='D:/HD-DEV/android/sdk/platform-tools/adb.exe',serial='emulator-5554';
const state={at:new Date().toISOString(),pid:process.pid,status:'WAITING_FOR_DIAGNOSTIC',package:'com.hdmanager.caplab',testPackage:'com.hdmanager.caplab.benchmark',conditions:{realAccounts:false,identity:'synthetic loopback fixture',firestore:'demo Emulator / real SDK',debuggable:false,profileable:true,compilation:'None',iterations:{coldPasswordLogin:5,warmPasswordLogin:5},warmSessionCondition:'Fixture does not restore authenticated Home after Activity recreation; use explicit synthetic login, do not change persistence/security to manufacture authenticated startup.',suppressedBenchmarkErrors:['EMULATOR'],physicalDevice:false}};
const write=async()=>fs.writeFile(`${root}/capacitor-macro-state.json`,JSON.stringify(state,null,2));
await write();let diagnostic;
const start=Date.now();while(Date.now()-start<170*60000){try{diagnostic=JSON.parse(await fs.readFile(`${root}/capacitor-diagnostic-result.json`,'utf8'))}catch{/* wait */}if(diagnostic)break;await new Promise(r=>setTimeout(r,15000))}
if(!diagnostic){state.status='NOT_RUN_DIAGNOSTIC_NOT_FINISHED';await write();process.exitCode=1}else{
 const adbCall=(args,timeout=30000)=>execFileSync(adb,['-s',serial,...args],{encoding:'utf8',timeout,windowsHide:true});
 try{
  state.status='RUNNING';state.startedAt=new Date().toISOString();state.apks=[];await write();
  for(const apk of [`${native}/app/build/outputs/apk/release/app-release.apk`,`${native}/macrobenchmark/build/outputs/apk/benchmark/macrobenchmark-benchmark.apk`]){
   const bytes=await fs.readFile(apk);state.apks.push({apk,bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')});adbCall(['install','-r',apk],60000);
  }
  state.output=adbCall(['shell','am','instrument','-w','-r','-e','class','com.hdmanager.caplab.benchmark.CapacitorBenchmark',
   '-e','androidx.benchmark.suppressErrors','EMULATOR',
   'com.hdmanager.caplab.benchmark/androidx.test.runner.AndroidJUnitRunner'],20*60000);
  state.status=/OK \(2 tests\)/.test(state.output)?'SYNTHETIC_CAPACITOR_MACRO_COMPLETED':'INSTRUMENTATION_FAILED';
  const files=adbCall(['shell','find','/sdcard/Android/media/com.hdmanager.caplab.benchmark','-type','f']).trim().split(/\r?\n/).filter(Boolean);state.outputFiles=[];
  for(const file of files){if(!file.startsWith('/sdcard/Android/media/com.hdmanager.caplab.benchmark/')||file.includes('..'))throw Error('Unsafe target output path');if(!file.endsWith('.json'))continue;
   const name='cap-'+file.split('/').at(-1);adbCall(['pull',file,`${root}/${name}`]);state.outputFiles.push(name);
  }
 }catch(error){state.status='INSTRUMENTATION_FAILED';state.error=String(error.message).slice(0,1400)}
 state.endedAt=new Date().toISOString();await write();
}
