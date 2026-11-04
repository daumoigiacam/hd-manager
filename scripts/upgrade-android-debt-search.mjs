import {currentDebtAnswer,armDebtSearch,debtDiagnosticBasePage} from './helpers/debt-search-observation.mjs';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import {connectAndroidWebView} from './helpers/android-webview-cdp.mjs';
import {assertNoActiveUpgradeSoak} from './helpers/upgrade-observation-barrier.mjs';
import {assertVerificationFixtureReady} from './helpers/verification-fixture-preflight.mjs';
import {searchCustomers} from '../src/services/searchEngine.js';

// Current committed hook inspection is diagnostic only. Never follows the DOM
// expando's stale alternate, mutates React, or accepts a matching previous page.




const cohort=process.argv[2],profile=process.argv.includes('--profile');
if(!/^after-[a-z0-9-]+$/.test(cohort||''))throw Error('Explicit fixture cohort required');
const label=process.argv.find(a=>a.startsWith('--run-label='))?.slice(12);
if(label&&!/^[a-z0-9-]+$/.test(label))throw Error('Invalid observation label');
const observation=cohort+(label?'-'+label:'');
await assertNoActiveUpgradeSoak();const fixtureAvailability=await assertVerificationFixtureReady();
const root='test-results/performance-upgrade-20261103',pkg='com.hdmanager.caplab.diag';
const output=root+'/debt-search-'+observation+(profile?'-profile':'-clean')+'.json';
try{await fs.access(output);throw Error('Observation exists; choose a new run-label')}catch(error){if(error.code!=='ENOENT')throw error}
const c=await connectAndroidWebView({adb:'D:/HD-DEV/android/sdk/platform-tools/adb.exe',serial:'emulator-5554',packageName:pkg,port:9279});
const result={at:new Date().toISOString(),cohort,profile,fixtureAvailability,status:'RUNNING',runs:[],realAccounts:false,productionRequests:0,
 condition:'Owned demo only, trusted input. Full current-query committed result IDs and debt values inspected from CURRENT React root. Observer is diagnostic overhead; profiler rows never count as speed acceptance. No business writes, sign-in, install, forced GC or navigation outside permitted routes.'};
let profiling=false;
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function until(expression){const deadline=Date.now()+30000;while(Date.now()<deadline){if(await c.evaluate(expression))return;await wait(50)}throw Error('Debt diagnostic deadline')}
async function click(selector){const p=await c.evaluate(`(function(){var e=document.querySelector(${JSON.stringify(selector)});if(!e)return null;e.scrollIntoView({block:'center'});var r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2,h=document.elementFromPoint(x,y);return h&&(h===e||e.contains(h))?{x:x,y:y}:null})()`);if(!p)throw Error('No clickable target '+selector);await c.send('Input.dispatchMouseEvent',{type:'mousePressed',...p,button:'left',clickCount:1});await c.send('Input.dispatchMouseEvent',{type:'mouseReleased',...p,button:'left',clickCount:1})}
async function input(query){await c.evaluate("document.querySelector('input[data-hd-search-input]').focus()");await c.send('Input.dispatchKeyEvent',{type:'rawKeyDown',key:'a',code:'KeyA',windowsVirtualKeyCode:65,modifiers:2});await c.send('Input.dispatchKeyEvent',{type:'keyUp',key:'a',code:'KeyA',windowsVirtualKeyCode:65,modifiers:2});await c.send('Input.dispatchKeyEvent',{type:'rawKeyDown',key:'Backspace',code:'Backspace',windowsVirtualKeyCode:8});await c.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Backspace',code:'Backspace',windowsVirtualKeyCode:8});await c.send('Input.insertText',{text:query})}
try{
 const id=JSON.parse(await fs.readFile(root+'/'+cohort+'/capacitor-build-identity.json'));if(id.project!=='demo-hdm-perf-verification')throw Error('Wrong project');
 const remote=c.shell('shell','pm','path',pkg).replace(/^package:/,'');if(!remote.startsWith('/data/app/')||!remote.includes(pkg)||!remote.endsWith('/base.apk'))throw Error('Unexpected package path');
 result.apkSha256=c.shell('shell','sha256sum',remote).split(/\s+/)[0];const apk=root+'/'+cohort+'/capacitor-project/app/build/outputs/apk/diagnostic/app-diagnostic.apk';if(result.apkSha256!==crypto.createHash('sha256').update(await fs.readFile(apk)).digest('hex'))throw Error('APK does not match cohort');
 if(!await c.evaluate('Boolean(window.__hdVerification&&window.__hdVerification.fixtureOnly)'))throw Error('Not owned fixture');
 await click('button[aria-label="Thêm"]');await until('Boolean(document.querySelector("button[data-hd-more-module=debt]"))');await click('button[data-hd-more-module=debt]');
 await until("(function(){var m=document.querySelector('main[data-hd-module=debt]');return m&&!window.__hdModulePending(m)&&window.__hdSourceContract(m,'debt',window.__hdPlans).sourcesReady})()");
 await c.evaluate('window.__upgradeDebtAnswer='+currentDebtAnswer.toString());
 if(!await c.evaluate("Boolean(document.querySelector('input[data-hd-search-input]'))"))await click('button[aria-label="Tìm kiếm"]');
 await input('');await until("(function(){var a=window.__upgradeDebtAnswer();return a&&a.query===''})()");
 const baseline=await c.evaluate('(function(){var a=window.__upgradeDebtAnswer();return a&&{filter:a.filter,total:a.base.length}})()');if(!baseline||baseline.filter!=='all'||!baseline.total)throw Error('Unsupported debt scope/filter');
 const loaded=[];for(let start=0;start<baseline.total;start+=25)loaded.push(...await c.evaluate(`(${debtDiagnosticBasePage.toString()})(${start},25)`));
 const base=loaded.filter(row=>row.ledger.currentDebt>0||row.ledger.creditBalance>0);result.scope={sourceCount:base.length,baseIdsSha256:crypto.createHash('sha256').update(JSON.stringify(base.map(r=>r.id))).digest('hex')};
 result.before={heap:await c.send('Runtime.getHeapUsage'),dom:await c.send('Memory.getDOMCounters')};
 if(profile){await c.send('Profiler.enable');await c.send('Profiler.setSamplingInterval',{interval:1000});await c.send('Profiler.start');profiling=true}
 const queries=profile?['Synthetic Customer 999','Synthetic','no-match-fictional']:['Synthetic Customer 999','Synthetic Customer 99','Synthetic','no-match-fictional','Synthetic Customer 1','Synthetic Customer 999'];
 for(const query of queries){const oracle=searchCustomers(base,query),expectedIds=oracle.map(r=>r.id);await c.evaluate(`(${armDebtSearch.toString()})(${JSON.stringify({query,expectedIds})})`);await input(query);const timing=await c.evaluate('window.__upgradeDebtPromise');const answer=await c.evaluate('(function(){var a=window.__upgradeDebtAnswer();return a&&{query:a.query,rows:a.rows}})()');const money=new Map(base.map(row=>[row.id,row.ledger.currentDebt]));if(answer.rows.some(row=>row.debt!==money.get(row.id)))throw Error('Debt money changed while filtering');result.runs.push({query,...timing,rows:expectedIds.length,resultIdsSha256:crypto.createHash('sha256').update(JSON.stringify(expectedIds)).digest('hex')})}
 if(profile){const p=await c.send('Profiler.stop');profiling=false;await fs.writeFile(root+'/debt-search-'+cohort+'.cpuprofile',JSON.stringify(p.profile));await c.send('Profiler.disable')}
 result.after={heap:await c.send('Runtime.getHeapUsage'),dom:await c.send('Memory.getDOMCounters')};result.status=profile?'DEBT_CPU_DIAGNOSTIC_COMPLETE_NOT_ACCEPTANCE':'DEBT_SEARCH_OBSERVED_NOT_GLOBAL_ACCEPTANCE';
}catch(error){result.status='FAILED';result.error=error.message;result.failedRequest=error.request||null;process.exitCode=1}finally{
 if(profiling)try{const p=await c.send('Profiler.stop');await fs.writeFile(root+'/debt-search-'+cohort+'-failed-partial.cpuprofile',JSON.stringify(p.profile));await c.send('Profiler.disable')}catch(error){result.profilerCleanupError=error.message}
 c.close();result.endedAt=new Date().toISOString();await fs.writeFile(output,JSON.stringify(result,null,2));console.log(JSON.stringify({status:result.status,runs:result.runs,error:result.error}))}
