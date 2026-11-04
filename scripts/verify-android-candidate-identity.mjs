import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

const output=process.env.HD_ACCEPTANCE_CANDIDATE_OUTPUT;
if(!output)throw Error('HD_ACCEPTANCE_CANDIDATE_OUTPUT is required.');
const directory=path.resolve(output),sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const apk=path.join(directory,'HD-Manager-Acceptance-debug.apk');
const adb=process.env.HD_ADB||'D:/HD-DEV/android/sdk/platform-tools/adb.exe';
const invoke=(...args)=>execFileSync(adb,['-s','emulator-5554',...args],{encoding:'utf8',timeout:15000}).trim();
const installed=invoke('shell','pm','path','com.hdmanager.app.acceptance').split(/\r?\n/).find(row=>row.endsWith('/base.apk'))?.slice(8);
assert.match(installed||'',/^\/data\/app\/[A-Za-z0-9_\-=/+.]+\/base\.apk$/);
const hostHash=sha(await fs.readFile(apk)),installedHash=invoke('shell','sha256sum',installed).split(/\s+/)[0];
assert.equal(installedHash,hostHash);
const sources=new Map();
const assets=path.join(directory,'public','assets');
for(const file of await fs.readdir(assets)){
  if(!file.endsWith('.map'))continue;
  const map=JSON.parse(await fs.readFile(path.join(assets,file),'utf8'));
  for(let i=0;i<map.sources.length;i++){
    const raw=map.sources[i].replaceAll('\\','/'),offset=raw.lastIndexOf('/src/');
    const source=offset>=0?raw.slice(offset+1):raw.startsWith('src/')?raw:null;
    if(!source||source.includes('?')||source.includes('..')||typeof map.sourcesContent[i]!=='string')continue;
    let current;try{current=await fs.readFile(path.resolve(source))}catch{continue;}
    const builtHash=sha(map.sourcesContent[i]);assert.equal(sha(current),builtHash,'Current source differs from candidate map: '+source);
    const existing=sources.get(source);if(existing)assert.equal(existing,builtHash);sources.set(source,builtHash);
  }
}
for(const required of ['src/App.jsx','src/main.jsx','src/layout/moduleNavigation.js','src/layout/useModuleScrollReset.js',
  'src/layout/ReadWorkerActivityNotice.jsx','src/services/firestoreReadWorker.js','src/services/firestoreReadWorkerClient.js',
  'src/services/initialReadAdmission.js'])assert(sources.has(required),'Missing source in candidate maps: '+required);
const result={at:new Date().toISOString(),apkSha256:hostHash,installedMatches:true,sourceMapMatches:true,sources:Object.fromEntries([...sources].sort()),
  device:{android:invoke('shell','getprop','ro.build.version.release'),api:invoke('shell','getprop','ro.build.version.sdk'),abi:invoke('shell','getprop','ro.product.cpu.abi')},
  scope:'Actual installed Acceptance APK hash equals candidate artifact; every recognized workspace source-map source matches current files. No credentials or record contents collected. Source maps and debug package remain local test artifacts.'};
await fs.writeFile(path.join(directory,'candidate-identity.json'),JSON.stringify(result,null,2));
console.log(JSON.stringify({apkSha256:hostHash,sourceCount:sources.size,installedMatches:true,sourceMapMatches:true,device:result.device}));
