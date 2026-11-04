import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { connectAndroidWebView } from './helpers/android-webview-cdp.mjs';

const candidate=process.env.HD_ACCEPTANCE_CANDIDATE_OUTPUT;
if(!candidate)throw Error('Set HD_ACCEPTANCE_CANDIDATE_OUTPUT to an immutable local candidate.');
const label=process.env.HD_ACCEPTANCE_MEASUREMENT_LABEL||'measurements';
if(!/^measurements(?:-[A-Za-z0-9_-]+)?$/.test(label))throw Error('Invalid measurement label.');
const output=path.join(candidate,label);
await fsp.mkdir(output,{recursive:true});
const skipStartup=process.env.HD_ACCEPTANCE_SKIP_STARTUP==='true';
const sourceReady=process.env.HD_ACCEPTANCE_SOURCE_READY==='true';
const repeatRounds=Number(process.env.HD_ACCEPTANCE_REPEAT_ROUNDS??5);
if(!Number.isInteger(repeatRounds)||repeatRounds<0||repeatRounds>5)throw Error('Repeat rounds must be 0 through 5.');
const routeSequence=(process.env.HD_ACCEPTANCE_NAVIGATION_ROUTES||'').split(',').filter(Boolean);
await fsp.writeFile(path.join(output,'plan.json'),JSON.stringify({at:new Date().toISOString(),
  scope:routeSequence.length?'TARGETED_ROUTE_REGRESSION':'ALL_ACCESSIBLE_ROUTE_REGRESSION',
  rememberedStartup:!skipStartup,repeatRounds,sourceReady,routeSequence:routeSequence.length?routeSequence:null,
  contract:'Trusted Android input to module DOM and two animation frames is a feedback proxy; full readiness/paint/INP stay separate. No cache-hit assumption from repeat round number.'},null,2));
const routeEnvironment=routeSequence.length?{HD_ANDROID_AUDIT_ROUTE_SEQUENCE:JSON.stringify(routeSequence)}:{};
const run=(script,env={})=>new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,[script],{windowsHide:true,stdio:'inherit',env:{...process.env,...env}});
  child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(Error(`${script} exited ${code}`)));
});
await run('scripts/verify-android-candidate-identity.mjs');
if(skipStartup){
  const cdp=await connectAndroidWebView({adb:process.env.HD_ADB||'D:/HD-DEV/android/sdk/platform-tools/adb.exe',serial:'emulator-5554',packageName:'com.hdmanager.app.acceptance',enableRuntime:false});
  const started=Date.now();let status;
  try{
    do{
      status=await cdp.evaluate('({module:!!document.querySelector("main[data-hd-module]"),phoneField:!!document.querySelector("input[type=tel]")})');
      if(status.module)break;
      await new Promise(resolve=>setTimeout(resolve,500));
    }while(Date.now()-started<60000);
    await fsp.writeFile(path.join(output,'session-precondition.json'),JSON.stringify({at:new Date().toISOString(),waitMs:Date.now()-started,status,
      scope:'Wait for the existing approved session to restore before a targeted navigation audit. No login, credential entry, reload or startup-latency acceptance claim.'},null,2));
    if(!status?.module)throw Error('Approved existing-session precondition did not become available; navigation remains unmeasured.');
  }finally{cdp.close()}
}
const fd=fs.openSync(path.join(output,'native.log'),'w');
const native=spawn(process.execPath,['scripts/capture-android-native-health.mjs'],{windowsHide:true,stdio:['ignore',fd,fd],
  env:{...process.env,HD_NATIVE_HEALTH_OUTPUT:path.join(output,'native'),HD_NATIVE_HEALTH_SECONDS:'900',HD_NATIVE_HEALTH_STOP_FILE:path.join(output,'native','stop')}});
fs.closeSync(fd);
const nativeDone=new Promise((resolve,reject)=>{native.once('error',reject);native.once('exit',code=>code===0?resolve():reject(Error('Native capture failed')))});
try {
  if(!skipStartup)await run('scripts/measure-remembered-session-startup.mjs',{HD_REMEMBERED_STARTUP_OUTPUT:path.join(output,'startup')});
  await run('scripts/audit-android-webview.mjs',{HD_ANDROID_AUTHENTICATED_AUDIT:'true',HD_ANDROID_AUDIT_ACCESSIBLE_ONLY:'true',
    HD_ANDROID_AUDIT_ROUNDS:'1',HD_ANDROID_AUDIT_LIGHTWEIGHT:'true',HD_ANDROID_AUDIT_FEEDBACK_ONLY:sourceReady?'false':'true',HD_ANDROID_AUDIT_SOURCE_READY:String(sourceReady),
    HD_ANDROID_AUDIT_OUTPUT:path.join(output,'first-navigation'),HD_ANDROID_AUDIT_APK:path.join(candidate,'HD-Manager-Acceptance-debug.apk'),...routeEnvironment});
  if(repeatRounds>0)await run('scripts/audit-android-webview.mjs',{HD_ANDROID_AUTHENTICATED_AUDIT:'true',HD_ANDROID_AUDIT_ACCESSIBLE_ONLY:'true',
    HD_ANDROID_AUDIT_ROUNDS:String(repeatRounds),HD_ANDROID_AUDIT_LIGHTWEIGHT:'true',HD_ANDROID_AUDIT_FEEDBACK_ONLY:sourceReady?'false':'true',HD_ANDROID_AUDIT_SOURCE_READY:String(sourceReady),
    HD_ANDROID_AUDIT_OUTPUT:path.join(output,'repeat-navigation'),HD_ANDROID_AUDIT_APK:path.join(candidate,'HD-Manager-Acceptance-debug.apk'),...routeEnvironment});
} finally {
  await fsp.mkdir(path.join(output,'native'),{recursive:true});
  await fsp.writeFile(path.join(output,'native','stop'),'Actual measurement window ended. No full acceptance assertion.\n');
  await nativeDone;
  await run('scripts/verify-android-candidate-identity.mjs');
}
