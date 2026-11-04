import fs from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import crypto from 'node:crypto';
const root='test-results/phase2-verification-20261102',started=performance.now();
const state={pid:process.pid,status:'WAITING_FOR_FIXED_MACRO',startedAt:new Date().toISOString(),scope:'Synthetic-only continuation; prior failed attempts preserved separately'};
const publish=()=>fs.writeFile(`${root}/rerun-state.json`,JSON.stringify(state,null,2));
await publish();
try {
 let macro;
 while(performance.now()-started<30*60000){
  try{macro=JSON.parse(await fs.readFile(`${root}/capacitor-macro-state.json`,'utf8'))}catch{/* publishing */}
  if(['SYNTHETIC_CAPACITOR_MACRO_COMPLETED','INSTRUMENTATION_FAILED'].includes(macro?.status))break;
  await new Promise(resolve=>setTimeout(resolve,5000));
 }
 if(!['SYNTHETIC_CAPACITOR_MACRO_COMPLETED','INSTRUMENTATION_FAILED'].includes(macro?.status))throw Error('Fixed Macro not terminal; do not interrupt it');
 const diagnostic=JSON.parse(await fs.readFile(`${root}/capacitor-run-status.json`,'utf8'));
 if(diagnostic.status!=='DIAGNOSTIC_COMPLETED_NOT_ACCEPTANCE')throw Error('Functional diagnostic incomplete; do not start soak');
 state.macroVerified=macro.status==='SYNTHETIC_CAPACITOR_MACRO_COMPLETED';
 const call=args=>execFileSync('D:/HD-DEV/android/sdk/platform-tools/adb.exe',['-s','emulator-5554',...args],{encoding:'utf8',windowsHide:true,timeout:60000});
 state.syntheticBackgroundStopped=[];
 for(const pkg of ['com.hdmanager.perflab','com.hdmanager.caplab']){call(['shell','am','force-stop',pkg]);state.syntheticBackgroundStopped.push(pkg)}
 const apk=`${root}/capacitor-project/app/build/outputs/apk/diagnostic/app-diagnostic.apk`;
 state.soakApkSha256=crypto.createHash('sha256').update(await fs.readFile(apk)).digest('hex');
 state.install=call(['install','-r',apk]);
 state.status='SOAK';await publish();await import('./verification-capacitor-soak.mjs');
 state.status='FINISHED_NOT_ACCEPTANCE';
}catch(error){state.status='PIPELINE_FAILED';state.error=error.message}
finally{state.endedAt=new Date().toISOString();await publish()}
