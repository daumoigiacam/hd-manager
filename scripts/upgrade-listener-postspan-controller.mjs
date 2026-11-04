import fs from 'node:fs/promises';
import {spawn} from 'node:child_process';
const resume=process.argv.includes('--resume');
const root='test-results/performance-upgrade-20261103',file=root+(resume?'/listener-postspan-resume-controller.json':'/listener-postspan-controller.json');
try{await fs.access(file);throw Error('Do not overwrite controller evidence')}catch(e){if(e.code!=='ENOENT')throw e}
const state={at:new Date().toISOString(),pid:process.pid,status:'WAITING_NATURAL_SPAN',steps:[],productionRequests:0};
const write=()=>fs.writeFile(file,JSON.stringify(state,null,2));await write();
async function run(name,args){
 const log=root+'/postspan-'+(resume?'resume-':'')+name+'.log',fd=await fs.open(log,'wx'),row={name,args,log,startedAt:new Date().toISOString()};
 state.status=name;state.steps.push(row);const child=spawn(process.execPath,args,{stdio:['ignore',fd.fd,fd.fd],windowsHide:true});row.pid=child.pid;await write();
 try{row.exitCode=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve)});}finally{await fd.close();row.endedAt=new Date().toISOString();await write()}
 return row.exitCode===0;
}
try{
 const deadline=Date.now()+3*3600000;
 while(true){const primary=JSON.parse(await fs.readFile(root+(resume?'/listener-verification-resume.json':'/listener-verification-controller.json'),'utf8'));
  if(primary.endedAt){if(primary.status!=='OBSERVATIONS_COMPLETE_REVIEW_REQUIRED_NOT_PASS')throw Error('Primary controller failed; preserve device state for diagnosis');break}
  if(Date.now()>deadline)throw Error('Natural span did not finish within watcher deadline');await new Promise(r=>setTimeout(r,5000));
 }
 if(!await run('capture-heap',['scripts/upgrade-post-listener-heap.mjs']))throw Error('Post-span heap capture failed; do not replace observed APK');
 await run('heap-analysis',['--max-old-space-size=2048','scripts/upgrade-analyze-native-retention.mjs','--listener-scope']);
 await run('soak-analysis',['scripts/upgrade-summarize-soak.mjs','soak-listener-scope']);
 await run('macro-before',['scripts/upgrade-capacitor-macro.mjs','after-packet-16k','--harness=after-native-input-v6']);
 await run('macro-after',['scripts/upgrade-capacitor-macro.mjs','after-listener-scope','--harness=after-native-input-v6']);
 await run('reports',['scripts/upgrade-write-verification-report.mjs']);
 state.status='OBSERVATIONS_COMPLETE_REVIEW_REQUIRED_NOT_PASS';
}catch(e){state.status='FAILED_REVIEW_REQUIRED';state.error=e.message;process.exitCode=1}
finally{state.endedAt=new Date().toISOString();await write();console.log(JSON.stringify({status:state.status,error:state.error}))}
