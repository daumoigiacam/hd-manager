import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import {connectAndroidWebView} from './helpers/android-webview-cdp.mjs';
import {assertNoActiveUpgradeSoak} from './helpers/upgrade-observation-barrier.mjs';
import {assertVerificationFixtureReady} from './helpers/verification-fixture-preflight.mjs';
const cohort=process.argv[2],label=process.argv[3];
if(!/^after-[a-z0-9-]+$/.test(cohort||'')||!/^[a-z0-9-]+$/.test(label||''))throw Error('Explicit owned cohort and unique label required');
const root='test-results/performance-upgrade-20261103',out=`${root}/session-retention-${cohort}-${label}.json`;
try{await fs.access(out);throw Error('Preserve existing observation; use another label')}catch(e){if(e.code!=='ENOENT')throw e}
await assertNoActiveUpgradeSoak();const fixture=await assertVerificationFixtureReady();
const c=await connectAndroidWebView({adb:'D:/HD-DEV/android/sdk/platform-tools/adb.exe',serial:'emulator-5554',packageName:'com.hdmanager.caplab.diag',port:9294});
const result={at:new Date().toISOString(),cohort,label,status:'RUNNING',fixture,sessions:[],runtimeEvents:[],productionRequests:0,realAccounts:false,
 conditions:'Six actual synthetic manager login/logout cycles, same Home/product/debt navigation and one search. Trusted UI and native back. Explicit GC ONLY at logged-out endpoints: retention diagnosis, NOT natural RAM/latency/soak acceptance. No business writes, profiler, app restart or activity reinstall during cycles. Current-root source contract is not a fresh reopen epoch guarantee.'};
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function until(expression,timeout=45000){const end=Date.now()+timeout;while(Date.now()<end){if(await c.evaluate(expression))return;await wait(100)}throw Error('Retention condition timeout: '+expression.slice(0,100))}
async function click(selector){const p=await c.evaluate(`(function(){var e=document.querySelector(${JSON.stringify(selector)});if(!e||e.disabled||!e.getClientRects().length)return null;e.scrollIntoView({block:'center'});var r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2,h=document.elementFromPoint(x,y);return h&&(e===h||e.contains(h))?{x:x,y:y}:null})()`);if(!p)throw Error('Unavailable '+selector);await c.send('Input.dispatchMouseEvent',{type:'mousePressed',...p,button:'left',clickCount:1});await c.send('Input.dispatchMouseEvent',{type:'mouseReleased',...p,button:'left',clickCount:1})}
async function fill(selector,text){await click(selector);await c.evaluate(`document.querySelector(${JSON.stringify(selector)}).select()`);await c.send('Input.dispatchKeyEvent',{type:'rawKeyDown',key:'Backspace',code:'Backspace',windowsVirtualKeyCode:8});await c.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Backspace',code:'Backspace',windowsVirtualKeyCode:8});await until(`document.querySelector(${JSON.stringify(selector)}).value===''`);await c.send('Input.insertText',{text});await until(`document.querySelector(${JSON.stringify(selector)}).value===${JSON.stringify(text)}`)}
async function ready(module){await until(`(function(){var m=document.querySelector('main[data-hd-module]');return m&&m.getAttribute('data-hd-module')===${JSON.stringify(module)}&&!window.__hdModulePending(m)&&window.__hdSourceContract(m,${JSON.stringify(module)},window.__hdPlans).sourcesReady})()`)}
async function more(module){await click('button[aria-label="Thêm"]');await until(`Boolean(document.querySelector('button[data-hd-more-module=${module}]'))`);await click(`button[data-hd-more-module=${module}]`);await ready(module)}
async function sample(){return{at:new Date().toISOString(),heap:await c.send('Runtime.getHeapUsage'),dom:await c.send('Memory.getDOMCounters'),nativeMeminfo:c.shell('shell','dumpsys','meminfo',c.pid),probe:await c.evaluate('(function(){var s=window.__hdVerification;return{errors:s.errors,rejections:s.rejections,workersCreated:s.workersCreated,workersTerminated:s.workersTerminated,blockedExternalRequests:s.networkBlocked}})()')}}
c.onEvent(e=>{if(['Runtime.exceptionThrown','Inspector.targetCrashed','Page.loadEventFired'].includes(e.method))result.runtimeEvents.push({at:new Date().toISOString(),method:e.method});if(e.method==='Page.javascriptDialogOpening'&&/đăng xuất/i.test(e.params.message||''))void c.send('Page.handleJavaScriptDialog',{accept:true}).catch(()=>{})});
try{
 const bytes=await fs.readFile(`${root}/${cohort}/capacitor-project/app/build/outputs/apk/diagnostic/app-diagnostic.apk`);result.apkSha256=crypto.createHash('sha256').update(bytes).digest('hex');
 const remote=c.shell('shell','pm','path','com.hdmanager.caplab.diag').replace(/^package:/,'');if(!remote.startsWith('/data/app/')||!remote.endsWith('/base.apk')||c.shell('shell','sha256sum',remote).split(/\s+/)[0]!==result.apkSha256)throw Error('Installed synthetic APK mismatch');
 if(!await c.evaluate('Boolean(window.__hdVerification&&window.__hdVerification.fixtureOnly)'))throw Error('Not synthetic package');
 result.origin=await c.evaluate('performance.timeOrigin');
 if(!await c.evaluate('Boolean(document.querySelector("input[type=tel]"))'))await click('button[aria-label="Trang chủ"]');
 for(let i=0;i<6;i++){
  result.step={session:i,phase:'login-home'};
  if(await c.evaluate('Boolean(document.querySelector("input[type=tel]"))')){
   await fill('input[type=tel]','0900000001');await fill('input[type=password]','Local-fixture-only-2026!');
   await c.evaluate("Array.from(document.querySelectorAll('button')).find(function(e){return e.textContent.trim()==='Vào Ứng Dụng'}).setAttribute('data-retention-login','true')");await click('[data-retention-login]');
  }
  await ready('home');
  result.step={session:i,phase:'product-search'};
  await more('products');
  if(!await c.evaluate('Boolean(document.querySelector("input[data-hd-search-input]"))'))await click('button[aria-label="Tìm kiếm"]');
  await fill('input[data-hd-search-input]','Synthetic Product 999');
  await until("(function(){var e=document.querySelector('.hd-product-list');return e&&e.getAttribute('data-hd-search-committed-query')==='Synthetic Product 999'})()");
  await more('debt');
  result.step={session:i,phase:'native-back'};
  c.shell('shell','input','keyevent','4');await until("Boolean(document.querySelector('main[data-hd-module=more]'))");
  await click('button[aria-label="Trang chủ"]');await ready('home');
  const beforeLogout=await sample();
  result.step={session:i,phase:'logout'};
  await click('button[aria-label="Thêm"]');await until('Boolean(document.querySelector(".hd-more-menu__logout"))');await click('.hd-more-menu__logout');
  await until('Boolean(document.querySelector("input[type=tel]"))');await wait(5000);
  const loggedOutBeforeGc=await sample();await c.send('HeapProfiler.collectGarbage',{},60000);await wait(1000);const loggedOutAfterGc=await sample();
  if(await c.evaluate('performance.timeOrigin')!==result.origin)throw Error('Unexpected document reload');
  result.sessions.push({index:i,beforeLogout,loggedOutBeforeGc,loggedOutAfterGc});
  await fs.writeFile(out,JSON.stringify(result,null,2));console.log(JSON.stringify({cohort,session:i,loggedOutHeap:loggedOutAfterGc.heap.usedSize,dom:loggedOutAfterGc.dom.nodes}));
 }
 if(result.runtimeEvents.some(e=>e.method==='Runtime.exceptionThrown'||e.method==='Inspector.targetCrashed'))throw Error('Runtime error/crash observed');
 result.status='SIX_SESSION_RETENTION_DIAGNOSTIC_COMPLETE_NOT_SOAK_ACCEPTANCE';
}catch(e){result.status='FAILED';result.error=e.message;result.failedRequest=e.request||null;process.exitCode=1}
finally{c.close();result.endedAt=new Date().toISOString();await fs.writeFile(out,JSON.stringify(result,null,2));console.log(JSON.stringify({status:result.status,sessions:result.sessions.length,error:result.error}))}
