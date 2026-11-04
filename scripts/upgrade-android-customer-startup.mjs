import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {connectAndroidWebView} from './helpers/android-webview-cdp.mjs';
import {assertNoActiveUpgradeSoak} from './helpers/upgrade-observation-barrier.mjs';
import {assertVerificationFixtureReady} from './helpers/verification-fixture-preflight.mjs';
import {armTrustedLoginClock,resolveTrustedLoginObservation} from './helpers/trusted-login-observation.mjs';
import {armCustomerStartupObservation} from './helpers/customer-startup-observation.mjs';
import {findOwnedWebViewRendererPids} from './helpers/android-renderer-ownership.mjs';
import {parseAndroidProcessMetrics} from './helpers/android-process-metrics.mjs';
import {ownedCpuIntervals} from './helpers/upgrade-soak-metrics.mjs';
import {readWorkerHeaps} from '../performance/phase2-verification/worker-heap.mjs';
import {createIdentityNetworkTimingCollector} from './helpers/identity-network-timing.mjs';
const cohort=process.argv[2],label=process.argv[3],network=process.argv.includes('--network-diagnostic');
if(!/^after-[a-z0-9-]+$/.test(cohort||'')||!/^[a-z0-9-]+$/.test(label||''))throw Error('Explicit owned cohort and unique label required');
const root='test-results/performance-upgrade-20261103',out=`${root}/android-customer-${cohort}-${label}.json`,pkg='com.hdmanager.caplab.diag',adb='D:/HD-DEV/android/sdk/platform-tools/adb.exe';
try{await fs.access(out);throw Error('Preserve observation; choose another label')}catch(e){if(e.code!=='ENOENT')throw e}
await assertNoActiveUpgradeSoak();const fixture=await assertVerificationFixtureReady();
const identity=JSON.parse(await fs.readFile(`${root}/${cohort}/capacitor-build-identity.json`,'utf8'));if(identity.project!=='demo-hdm-perf-verification')throw Error('Not synthetic');
const apk=`${root}/${cohort}/capacitor-project/app/build/outputs/apk/diagnostic/app-diagnostic.apk`,apkSha256=crypto.createHash('sha256').update(await fs.readFile(apk)).digest('hex');
const shell=(...args)=>execFileSync(adb,['-s','emulator-5554',...args],{encoding:'utf8',timeout:60000,windowsHide:true}).trim();
shell('shell','am','force-stop','com.hdmanager.caplab');shell('install','-r',apk);shell('shell','pm','clear',pkg);
for(const port of[8185,9199,5002])shell('reverse',`tcp:${port}`,`tcp:${port}`);
shell('shell','am','start','-W','-n',pkg+'/com.hdmanager.app.VerificationActivity');
const c=await connectAndroidWebView({adb,serial:'emulator-5554',packageName:pkg,port:9297});
const report={at:new Date().toISOString(),cohort,label,apkSha256,fixture,status:'RUNNING',productionRequests:0,realAccounts:false,role:'synthetic customer',navigation:[],conditions:'Actual customer portal, trusted submit to shell/catalog-interactive/confirmed financial Home after two frames. Same Android10/WebView74, isolated demo account0900000003, exact debt80000/paid40000. Not employee source contract, not native TTID/TTFD or all-device/Production acceptance. Endpoint heap/process metadata and automation add overhead; no profiler/forcedGC or business writes.'};
const collector=network?createIdentityNetworkTimingCollector():null,off=collector?c.onEvent(e=>collector.onEvent(e)):()=>{};
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function until(expression){const end=Date.now()+60000;while(Date.now()<end){if(await c.evaluate(expression))return;await wait(80)}throw Error('Customer UI deadline: '+expression.slice(0,80))}
async function click(selector){const p=await c.evaluate(`(function(){var e=document.querySelector(${JSON.stringify(selector)});if(!e||e.disabled||!e.getClientRects().length)return null;e.scrollIntoView({block:'center'});var r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2,h=document.elementFromPoint(x,y);return h&&(h===e||e.contains(h))?{x:x,y:y}:null})()`);if(!p)throw Error('Unavailable '+selector);await c.send('Input.dispatchMouseEvent',{type:'mousePressed',...p,button:'left',clickCount:1});await c.send('Input.dispatchMouseEvent',{type:'mouseReleased',...p,button:'left',clickCount:1})}
async function fill(selector,text){await click(selector);await c.evaluate(`document.querySelector(${JSON.stringify(selector)}).select()`);await c.send('Input.dispatchKeyEvent',{type:'rawKeyDown',key:'Backspace',code:'Backspace',windowsVirtualKeyCode:8});await c.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Backspace',code:'Backspace',windowsVirtualKeyCode:8});await until(`document.querySelector(${JSON.stringify(selector)}).value===''`);await c.send('Input.insertText',{text});await until(`document.querySelector(${JSON.stringify(selector)}).value===${JSON.stringify(text)}`)}
async function sample(){const pid=Number(c.pid),renderers=findOwnedWebViewRendererPids(shell('shell','dumpsys','activity','services',pkg),pkg,pid),processes=[];for(const p of[pid,...renderers])processes.push({pid:p,kind:p===pid?'native':'renderer',...parseAndroidProcessMetrics(shell('shell','dumpsys','meminfo',String(p)),shell('shell','cat',`/proc/${p}/status`),shell('shell','cat',`/proc/${p}/stat`))});return{elapsedMs:performance.now(),heap:await c.send('Runtime.getHeapUsage'),dom:await c.send('Memory.getDOMCounters'),processes}}
try{
 const remote=shell('shell','pm','path',pkg).replace(/^package:/,'');if(!remote.startsWith('/data/app/')||!remote.includes(pkg)||!remote.endsWith('/base.apk')||shell('shell','sha256sum',remote).split(/\s+/)[0]!==apkSha256)throw Error('Installed APK mismatch');
 report.device={api:shell('shell','getprop','ro.build.version.sdk'),clockTicksPerSecond:Number(shell('shell','getconf','CLK_TCK')),webview:shell('shell','dumpsys','webviewupdate').match(/Current WebView package[^\n]*/)?.[0]||null};
 await until('Boolean(window.__hdVerification&&window.__hdVerification.fixtureOnly&&document.querySelector("input[type=tel]"))');
 if(network)await c.send('Network.enable');
 await fill('input[type=tel]','0900000003');await fill('input[type=password]','Local-fixture-only-2026!');
 await c.evaluate("Array.from(document.querySelectorAll('button')).find(function(e){return e.textContent.trim()==='Vào Ứng Dụng'}).setAttribute('data-upgrade-customer-login','true')");
 report.before=await sample();await c.evaluate(`(${armTrustedLoginClock.toString()})('[data-upgrade-customer-login]')`);await c.evaluate(`(${armCustomerStartupObservation.toString()})({debt:80000,paid:40000})`);
 await click('[data-upgrade-customer-login]');
 const response=await c.send('Runtime.evaluate',{expression:'window.__upgradeCustomerStartupPromise',returnByValue:true,awaitPromise:true},75000);if(response.exceptionDetails)throw Error(response.exceptionDetails.exception?.description||response.exceptionDetails.text);
 report.customerObservation=response.result.value;report.independentLoginClock=await c.evaluate('window.__upgradeLoginClock');
 report.startup=resolveTrustedLoginObservation({...report.customerObservation,loginIntentAt:report.independentLoginClock.intentAt,identityRequestAt:await c.evaluate('window.__hdVerification.identityRequestAt')},report.independentLoginClock);
 report.after=await sample();report.cpu=ownedCpuIntervals([report.before,report.after],report.device.clockTicksPerSecond);report.workerHeaps=await readWorkerHeaps(c);
 const labels=await c.evaluate("Array.from(document.querySelectorAll('.customer-portal-nav button')).map(function(e,i){e.setAttribute('data-upgrade-customer-nav',String(i));return e.textContent.trim()})");
 for(let i=0;i<labels.length;i++){await click(`[data-upgrade-customer-nav="${i}"]`);await until("(function(){var m=document.querySelector('.customer-portal-main');return m&&!m.querySelector('[data-hd-module-loading],[aria-busy=\"true\"]')})()");report.navigation.push({label:labels[i],exercised:true});}
 const home=labels.indexOf('Trang chủ');if(home<0)throw Error('Customer home navigation missing');await click(`[data-upgrade-customer-nav="${home}"]`);
 report.probe=await c.evaluate('({errors:window.__hdVerification.errors,rejections:window.__hdVerification.rejections,blocked:window.__hdVerification.networkBlocked,maxTaskMs:window.__hdVerification.maxTaskMs})');
 if(report.probe.errors.length||report.probe.rejections||report.probe.blocked)throw Error('Customer runtime/network guard failed');
 report.status=network?'CUSTOMER_STARTUP_NETWORK_DIAGNOSTIC_NOT_ACCEPTANCE':'CUSTOMER_STARTUP_OBSERVED_NOT_UNIVERSAL_ACCEPTANCE';
}catch(e){report.status='FAILED';report.error=e.message;report.failedRequest=e.request||null;process.exitCode=1}
finally{if(collector)report.network=collector.snapshot();off();try{await c.evaluate('if(window.__upgradeCustomerStartupStop)window.__upgradeCustomerStartupStop();if(window.__upgradeLoginClockStop)window.__upgradeLoginClockStop()')}catch{}c.close();report.endedAt=new Date().toISOString();await fs.writeFile(out,JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,startup:report.startup,navigation:report.navigation,error:report.error}))}
