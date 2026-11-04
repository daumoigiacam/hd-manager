import {readFile,writeFile,mkdir} from 'node:fs/promises';import path from 'node:path';import {build} from 'esbuild';
import {connectAndroidWebView} from './helpers/android-webview-cdp.mjs';import {extractEmployeeHomeScreenModel} from './helpers/employee-home-model-extraction.mjs';
const root='test-results/perf-target-20261102',ledgerFile=root+'/employee-home-qa-request-ledger.json';
const cpuDiagnostic=process.env.HD_HOME_QA_CPU_DIAGNOSTIC==='true';
let ledger={limit:6,attempts:[]};try{ledger=JSON.parse(await readFile(ledgerFile,'utf8'))}catch(e){if(e.code!=='ENOENT')throw e}
if(![6,10,12,14,15,17].includes(ledger.limit)||!Array.isArray(ledger.attempts)||ledger.attempts.length>=ledger.limit)throw Error('Approved QA authenticated request budget exhausted.');
if(ledger.limit===15&&(!cpuDiagnostic||ledger.attempts.length!==14))throw Error('The15th approved read is CPU diagnosis only.');
if(ledger.limit===17&&(cpuDiagnostic||ledger.attempts.length<15))throw Error('The16th/17th reads require the approved ordinary measurement, no profiler.');
const artifact=JSON.parse(await readFile(root+'/employee-home-qa-artifact.json','utf8')),source=await readFile('src/App.jsx','utf8');
const roots=['isCashflowOfficial','parseLooseMoneyValue','getAssetDisplayLabel','getAssetStatusLabel','formatShiftRangeLabel','formatAttendanceMomentForWorkDate','getAttendanceCompactSource'];
const extracted=extractEmployeeHomeScreenModel(source,path.resolve('src'),roots);
const bundle=await build({stdin:{contents:extracted.code+`\nexport {buildEmployeeHomeScreenDto} from './services/employeeHomeScreenDto.js';export {readEmployeeHomeScreenModel} from './services/employeeHomeReadModelClient.js';`,resolveDir:path.resolve('src')},bundle:true,write:false,platform:'browser',format:'iife',globalName:'homeQaDomain',target:'chrome74'});
const c=await connectAndroidWebView({adb:'D:/HD-DEV/android/sdk/platform-tools/adb.exe',serial:'emulator-5554',packageName:'com.hdmanager.app.acceptance',enableRuntime:false});
const attempt={number:ledger.attempts.length+1,startedAt:new Date().toISOString(),status:'RESERVED_NO_RESULT',...(cpuDiagnostic?{diagnosticOnly:true,kind:'source_cpu_metadata'}:{})};let result;
try{
 const point=await c.evaluate(`(function(){var b=Array.from(document.querySelectorAll('[data-hd-navigation="bottom"] button')).find(function(b){return (b.getAttribute('aria-label')||b.innerText).trim()==='Trang chủ'});if(!b||!document.hasFocus())throw Error('Focused existing app required');b.scrollIntoView({block:'center'});var r=b.getBoundingClientRect();return {x:(r.x+r.width/2)*devicePixelRatio,y:(r.y+r.height/2)*devicePixelRatio}})()`);
 c.shell('shell','input','tap',String(Math.round(point.x)),String(Math.round(point.y)));
 const deadline=Date.now()+60000;
 while(!await c.evaluate(`(function(){var m=document.querySelector('main[data-hd-module="home"]');return !!m&&!!m.querySelector('.hd-staff-greeting-surface')&&!m.querySelector('[data-hd-module-loading],[data-hd-report-refreshing],[aria-busy="true"]')})()`)){
  if(Date.now()>deadline)throw Error('Complete personal Home precondition unavailable');await new Promise(r=>setTimeout(r,250));
 }
 ledger.attempts.push(attempt);await mkdir(root,{recursive:true});await writeFile(ledgerFile,JSON.stringify(ledger,null,2));
 result=await c.evaluate(`(async function(){
  ${bundle.outputFiles[0].text}
  function context(){var m=document.querySelector('main[data-hd-module="home"]'),key=m&&Object.keys(m).find(function(k){return k.indexOf('__reactFiber$')===0}),fiber=key&&m[key],props,user;
   for(var d=0;fiber&&d<100;d++,fiber=fiber.return){var p=fiber.memoizedProps;if(p&&p.currentUser&&p.currentCompany&&p.homeReadinessCollections)props=p;
    for(var h=fiber.memoizedState,i=0;h&&i<1000;h=h.next,i++){var v=h.memoizedState;if(v&&typeof v.getIdToken==='function'&&typeof v.getIdTokenResult==='function'&&v.auth)user=v}}
   if(!props||!user||user.isAnonymous||user.auth.currentUser!==user||user.auth.app.options.projectId!=='hd-manager-c5839')throw Error('Existing approved Firebase session required');return {p:props,user:user};
  }
  var original=context(),p=original.p,user=original.user,claims=(await user.getIdTokenResult()).claims;
  if(claims.accountType!=='employee'||claims.companyId!==p.currentUser.companyId||claims.appUserId!==p.currentUser.id)throw Error('Approved own employee scope required');
  var digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(user.uid)))).map(function(n){return n.toString(16).padStart(2,'0')}).join('');
  if(digest!==${JSON.stringify(artifact.qaActorSha256)})throw Error('QA UID digest changed');
  var flags=p.serverConfirmedCollectionState,required=['companies','employees'].concat(p.homeReadinessCollections);
  if(p.homeReadinessCollections.length!==13||flags.tenantId!==p.currentUser.companyId||!required.every(function(n){return flags.collections[n]===true}))throw Error('Complete legacy Home reference required');
  var references=['employee','employees','attendance','financials','performance','customers','orders','payments','expenses','holidays','employeeReviews','deliveryReports','advanceRequests','assets','assetCostLogs'];
  var scope={uid:user.uid,companyId:claims.companyId,employeeId:claims.appUserId},httpStatus=null,serverCode=null,started=performance.now(),reply;
  try{reply=await homeQaDomain.readEmployeeHomeScreenModel({projectId:'hd-manager-c5839',appId:'hd-manager-production',actor:scope,date:p.date,timeZone:Intl.DateTimeFormat().resolvedOptions().timeZone,
   domainVersion:${JSON.stringify(artifact.domainVersion)},timeoutMs:4500,getIdToken:()=>user.getIdToken(),nonceFactory:()=>${JSON.stringify(cpuDiagnostic?'qaCpu_':'')}+Array.from(crypto.getRandomValues(new Uint8Array(16))).map(function(n){return n.toString(16).padStart(2,'0')}).join(''),
   isCurrent:()=>{try{var live=context();return live.user.uid===scope.uid&&live.p.currentUser.companyId===scope.companyId&&live.p.currentUser.id===scope.employeeId&&live.p.date===p.date}catch(e){return false}},
   fetchImpl:async function(url,options){var response=await fetch(url,options);httpStatus=response.status;if(!response.ok){try{var error=await response.clone().json();if(typeof error.code==='string'&&/^[a-z_]{1,80}$/.test(error.code))serverCode=error.code}catch(e){}}return response}
  })}catch(error){return {status:'READ_FAILED',httpStatus,serverCode,clientCode:/^[a-z_]{1,80}$/.test(error.code||'')?error.code:error.name==='AbortError'?'aborted':'unknown',roundTripMs:performance.now()-started,clientDeadlineMs:4500}}
  var roundTripMs=performance.now()-started,live=context().p,referenceStable=references.every(function(n){return live[n]===p[n]})&&live.date===p.date;
  var input={date:p.date,record:p.currentAttendanceAlert&&p.currentAttendanceAlert.record};references.forEach(function(n){input[n]=p[n]});
  input.payments=input.payments.filter(homeQaDomain.isCashflowOfficial);input.expenses=input.expenses.filter(homeQaDomain.isCashflowOfficial);
  var expected=homeQaDomain.buildEmployeeHomeScreenDto(homeQaDomain.buildEmployeeHomeScreenModel(input),input,homeQaDomain),differences=[];
  function compare(a,b,field){if(JSON.stringify(a)===JSON.stringify(b))return;if(a&&b&&typeof a==='object'&&typeof b==='object'&&!Array.isArray(a)&&!Array.isArray(b)){Object.keys(a).forEach(function(k){compare(a[k],b[k],field?field+'.'+k:k)})}else differences.push(field)}compare(expected,reply.model,'');
  return {status:'VALIDATED_DISPLAY_RESPONSE',httpStatus,roundTripMs,clientDeadlineMs:4500,withinFiveSeconds:roundTripMs<=5000,referenceStable,displayParity:!differences.length,differingFields:differences,
   responseBytes:new TextEncoder().encode(JSON.stringify(reply)).byteLength,domainVersionMatched:reply.domainVersion===${JSON.stringify(artifact.domainVersion)},
   readTimeFormatValid:/^\\d{4}-\\d{2}-\\d{2}T/.test(reply.readTime)};
 })()`);
 if(cpuDiagnostic)result={...result,diagnosticOnly:true,performanceAcceptanceEligible:false};
 attempt.status=result.status;attempt.result=result;
}catch(error){attempt.status='DIAGNOSTIC_FAILED_OR_INDETERMINATE';attempt.error='Local precondition/CDP did not produce a response; an authenticated request may have been started.';throw error}
finally{if(ledger.attempts.includes(attempt))await writeFile(ledgerFile,JSON.stringify(ledger,null,2));c.close()}
await writeFile(root+'/employee-home-qa-request-'+attempt.number+'.json',JSON.stringify({at:new Date(),attempt:attempt.number,...result,
 scope:'Authenticated single QA-only read using the existing approved employee session entirely inside the APK; token/UID/tenant/documents/money stay in the app. Deadline 4500ms. Read response latency includes token acquisition, HTTP, decode and scope validation but NOT Home DOM commit. Display comparison is against independently calculated already-filtered current client inputs, not proof of identical raw server read-time. '+(cpuDiagnostic?'Opt-in backend CPU sampling enabled; diagnostic only and never performance acceptance. No heap snapshots, raw profiles, arguments or source contents exported.':'No input/CPU profiler attached during request; diagnostic module code was injected.')+' Not a password-login/full-Home acceptance run. No business writes.'},null,2));
console.log(JSON.stringify({attempt:attempt.number,...result}));
