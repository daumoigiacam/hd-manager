import {readFile,writeFile,mkdir} from 'node:fs/promises';import path from 'node:path';
import {connectAndroidWebView} from './helpers/android-webview-cdp.mjs';import {buildEmployeeHomeProjector} from './helpers/employee-home-projector-build.mjs';
const output='test-results/perf-target-20261102';
const c=await connectAndroidWebView({adb:'D:/HD-DEV/android/sdk/platform-tools/adb.exe',serial:'emulator-5554',packageName:'com.hdmanager.app.acceptance',enableRuntime:false});let scope;
try{
 scope=await c.evaluate(`(async function(){
  var main=document.querySelector('main[data-hd-module]'),key=main&&Object.keys(main).find(function(k){return k.indexOf('__reactFiber$')===0}),fiber=key&&main[key],props,user;
  for(var d=0;fiber&&d<100;d++,fiber=fiber.return){var p=fiber.memoizedProps;if(p&&p.currentUser&&p.currentCompany)props=p;
   for(var h=fiber.memoizedState,i=0;h&&i<1000;h=h.next,i++){var v=h.memoizedState;if(v&&typeof v.getIdToken==='function'&&typeof v.getIdTokenResult==='function'&&v.auth)user=v}}
  if(!props||!user||user.isAnonymous||user.auth.currentUser!==user||user.auth.app.options.projectId!=='hd-manager-c5839')throw Error('Approved existing Firebase session required');
  var claims=(await user.getIdTokenResult()).claims;
  if(claims.accountType!=='employee'||claims.companyId!==props.currentUser.companyId||claims.appUserId!==props.currentUser.id||props.currentUser.accountType!=='employee')throw Error('Approved own employee scope required');
  var digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(user.uid)))).map(function(n){return n.toString(16).padStart(2,'0')}).join('');
  return {qaActorSha256:digest,projectId:'hd-manager-c5839',accountType:'employee',sameTenant:true};
 })()`);
}finally{c.close()}
if(!/^[a-f0-9]{64}$/.test(scope?.qaActorSha256)||!scope.sameTenant)throw Error('Verified QA digest required.');
const target=path.resolve('functions/.env.hd-manager-c5839');let contents='';
try{contents=await readFile(target,'utf8')}catch(error){if(error.code!=='ENOENT')throw error}
const entry='HD_HOME_QA_UID_SHA256='+scope.qaActorSha256;
const occurrences=(contents.match(/^HD_HOME_QA_UID_SHA256\s*=/gm)||[]).length;
if(occurrences>1)throw Error('Duplicate QA configuration requires review.');
contents=occurrences?contents.replace(/^HD_HOME_QA_UID_SHA256\s*=.*$/m,entry):contents+(contents.endsWith('\n')||!contents?'':'\n')+entry+'\n';
await writeFile(target,contents);
const built=await buildEmployeeHomeProjector('functions/generated/employee-home');
await mkdir(output,{recursive:true});await writeFile(output+'/employee-home-qa-artifact.json',JSON.stringify({at:new Date(),domainVersion:built.domainVersion,sourceSha256:built.sourceSha256,
 qaActorSha256:scope.qaActorSha256,projectId:scope.projectId,scope:'Only UID digest leaves the existing approved app. No token, password, UID, employee/tenant identifier or document values exported. Local deployment configuration for the specifically approved QA endpoint; not yet a deployment.'},null,2));
console.log(JSON.stringify({qaScopeConfigured:true,domainVersion:built.domainVersion,sourceSha256:built.sourceSha256,scope:'No credentials or identity/document values exported.'}));
