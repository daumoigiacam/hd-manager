import fs from 'node:fs/promises';import path from 'node:path';import {workspace} from './environment.mjs';
const done=JSON.parse(await fs.readFile(path.join(workspace,'.local-dev/runtime/dev40-final50-verification.json'),'utf8'));if(done.status!=='COMPLETED_MEASURED_NOT_AUTOMATIC_ACCEPTANCE')throw Error('Finish frozen dev40 timing before source edit');
const root=path.join(workspace,'development/hd-manager/application'),backup=path.join(workspace,'.local-dev/source-backups/startup-dev40-before-ui-gate');await fs.mkdir(backup,{recursive:true});
const config=path.join(root,'vite.config.js');await fs.copyFile(config,path.join(backup,'vite.config.js'));
let source=await fs.readFile(config,'utf8');const marker="    if(request==='@hd/native-bootstrap-core')";if(!source.includes(marker))throw Error('Expected existing entry alias');
source=source.replace(marker,"    if(mode==='emulator'&&minimalNativeEntry&&env.VITE_NATIVE_SECURITY_FIRST_UI==='true'&&request==='/src/main.jsx'&&importer?.replaceAll('\\\\','/').endsWith('/index.html'))return fileURLToPath(new URL('./src/native-ui-entry.js',import.meta.url));\n"+marker);await fs.writeFile(config,source);
await fs.writeFile(path.join(root,'src/native-ui-entry.js'),`import {getNativeStartupController} from './services/nativeStartupController.js';
import {startupMark} from './services/offlineStartupTrace.js';
// Same singleton performs B. A is static, public HTML already on the document.
// This only schedules code evaluation: it confers NO permission or data access.
const store=getNativeStartupController();startupMark('ui.security-first.start');
const securityOpportunity=new Promise(resolve=>{
 let finished=false,off=()=>{},timer;
 const finish=reason=>{if(finished)return;finished=true;clearTimeout(timer);off();startupMark('ui.security-first.end',{reason});resolve();};
 const inspect=()=>{const s=store.getSnapshot();if(s.verifiedLaunch?.isCurrent())finish('verified-cache');else if(s.settled)finish('settled');};
 off=store.subscribe(inspect);timer=setTimeout(()=>finish('bounded-timeout'),120);inspect();
});
// A scheduling opportunity, never a benchmark/frame claim. Android actual
// presents/FCP and secure report commit remain independently measured.
const shellOpportunity=new Promise(resolve=>requestAnimationFrame(()=>setTimeout(resolve,0)));
void Promise.all([securityOpportunity,shellOpportunity]).then(()=>{startupMark('ui.main-import.start');return import('./main.jsx');}).catch(()=>{const status=document.querySelector('[data-hd-startup-shell] [role=status]');if(status)status.textContent='Không thể mở giao diện. Dữ liệu trên thiết bị được giữ nguyên.';});
`);
for(const name of ['build-web.mjs','build-android.mjs'])await fs.copyFile(path.join(workspace,'tools/local-development',name),path.join(backup,name));
const web=path.join(workspace,'tools/local-development/build-web.mjs');await fs.writeFile(web,(await fs.readFile(web,'utf8')).replace('VITE_NATIVE_VERIFY_KEY_REUSE:',"VITE_NATIVE_SECURITY_FIRST_UI:process.env.HD_EXPERIMENT_SECURITY_FIRST_UI==='true'?'true':'false',VITE_NATIVE_VERIFY_KEY_REUSE:").replace('runtimeFlags:{','runtimeFlags:{securityFirstUi:process.env.HD_EXPERIMENT_SECURITY_FIRST_UI===\'true\','));
const android=path.join(workspace,'tools/local-development/build-android.mjs');await fs.writeFile(android,(await fs.readFile(android,'utf8')).replaceAll('1.0.12-local-dev.40','1.0.12-local-dev.41').replaceAll('26111150','26111151'));
console.log(JSON.stringify({status:'PREPARED_DEV41',boundedYieldMs:120,sameController:true,noAuthorizationByScheduling:true}));
