import { spawn } from 'node:child_process';
import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

// An explicit demo project and loopback-only endpoints are mandatory. This
// runner never reads .env, .firebaserc, service accounts or production tokens.
const workspace=process.cwd(), project='demo-hdm-system-lab';
const root=path.join(os.tmpdir(),'hdm-system-data-lab');
const require=createRequire(import.meta.url);
await mkdir(root,{recursive:true});
await copyFile(path.join(workspace,'firestore.rules'),path.join(root,'firestore.rules'));
await writeFile(path.join(root,'firebase.json'),JSON.stringify({
  firestore:{rules:'firestore.rules'},
  emulators:{firestore:{host:'127.0.0.1',port:9295},auth:{host:'127.0.0.1',port:9296},
    hub:{host:'127.0.0.1',port:4419},logging:{host:'127.0.0.1',port:4519},ui:{enabled:false},singleProjectMode:false},
}));
const files=process.argv.includes('--load-only')?[]:['tests/instant-data-engine.emulator.mjs','tests/firestore-cursor-pagination.test.mjs','tests/firestore-inventory-transaction.test.cjs'];
if(process.argv.includes('--cursor-only'))files.splice(0,files.length,'tests/firestore-cursor-pagination.test.mjs');
if(process.argv.includes('--inventory-only'))files.splice(0,files.length,'tests/firestore-inventory-transaction.test.cjs');
if(process.argv.includes('--security-only'))files.splice(0,files.length,'tests/security-surface-audit.emulator.mjs');
if(process.argv.includes('--deployed-rules')&&!process.argv.includes('--security-only'))throw Error('Deployed snapshot audit must be security-only and local.');
if(process.argv.includes('--extended')||process.argv.includes('--realtime-only')){
  if(process.argv.includes('--realtime-only'))files.splice(0,files.length,'tests/instant-data-engine.emulator.mjs');
  files.push('tests/system-realtime.emulator.mjs','tests/security-surface-audit.emulator.mjs');
}
if(process.argv.includes('--load')||process.argv.includes('--load-only'))files.push('tests/system-data-load.emulator.mjs');
await writeFile(path.join(root,'run.mjs'),`import{spawn}from'node:child_process';process.chdir(${JSON.stringify(workspace)});
process.env.HD_SYSTEM_LAB_PROJECT=${JSON.stringify(project)};
process.env.HD_SECURITY_RULES_VARIANT=${JSON.stringify(process.argv.includes('--deployed-rules')?'deployed-snapshot':'')};
process.env.HD_CURSOR_TEST_PROJECT='demo-hdm-system-cursor';
process.env.HD_INVENTORY_TEST_PROJECT='demo-hdm-system-inventory';
if(process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:9295'||process.env.FIREBASE_AUTH_EMULATOR_HOST!=='127.0.0.1:9296')throw Error('Unsafe emulator endpoints');
for(const file of ${JSON.stringify(files.map(file=>path.join(workspace,file)))}){
 const code=await new Promise((resolve,reject)=>{const child=spawn(process.execPath,[file],{stdio:'inherit',windowsHide:true,env:process.env});child.on('error',reject);child.on('exit',resolve)});
 if(code!==0)process.exit(code??1);
}`);
const child=spawn(process.execPath,[require.resolve('firebase-tools/lib/bin/firebase'),
  'emulators:exec','--only','auth,firestore','--project',project,'--config',path.join(root,'firebase.json'),'node run.mjs'],{
  cwd:root,stdio:'inherit',windowsHide:true,
  env:{...process.env,GOOGLE_APPLICATION_CREDENTIALS:'',GOOGLE_CLOUD_PROJECT:project,GCLOUD_PROJECT:project,
    FIREBASE_TOKEN:'',XDG_CONFIG_HOME:path.join(root,'cli-config')},
});
child.on('error',error=>{console.error(error.message);process.exitCode=1;});
child.on('exit',code=>{process.exitCode=code??1;});
