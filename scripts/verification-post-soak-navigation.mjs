import fs from 'node:fs/promises';
import {connectAndroidWebView} from './helpers/android-webview-cdp.mjs';
import {observationCoverage} from '../performance/phase2-verification/soak-analysis.mjs';
const root='test-results/phase2-verification-20261102';
const cohort=JSON.parse(await fs.readFile(`${root}/sdk-soak-result.json`,'utf8'));
const afterAbortedCollector=process.argv.includes('--after-aborted-collector')&&cohort.state.status==='INCOMPLETE';
if(afterAbortedCollector){try{process.kill(cohort.state.pid,0);throw Error('Collector still running')}catch(error){if(error.code!=='ESRCH')throw error}}
if(!afterAbortedCollector&&(cohort.state.status!=='TWO_HOUR_OBSERVATION_COMPLETE_NOT_ACCEPTANCE'||cohort.state.elapsedMs<7200000||!observationCoverage(cohort.samples,cohort.state.elapsedMs).observedWithoutLargeGaps))throw Error('Do not run supplemental navigation before natural collector ends');
const c=await connectAndroidWebView({adb:'D:/HD-DEV/android/sdk/platform-tools/adb.exe',serial:'emulator-5554',packageName:'com.hdmanager.caplab.diag',port:9242});
const wait=ms=>new Promise(r=>setTimeout(r,ms)),result={at:new Date().toISOString(),scope:afterAbortedCollector?'Harness control diagnosis after INCOMPLETE collector stopped; not two-hour evidence':'Supplemental fixture UI availability/hit testing AFTER soak; not retroactive module coverage or a latency benchmark',steps:[],errors:[]};
async function until(expression,timeout=15000){const end=Date.now()+timeout;while(Date.now()<end){if(await c.evaluate(expression))return;await wait(150)}throw Error('Supplemental UI condition not reached')}
async function press(selector){
 const point=await c.evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e||e.disabled||!e.getClientRects().length)return null;e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2,h=document.elementFromPoint(x,y);return h&&(h===e||e.contains(h))?{x:x,y:y}:null})()`);
 if(!point)return false;
 await c.send('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',clickCount:1});await c.send('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',clickCount:1});return true;
}
async function fill(selector,value){if(!await press(selector))throw Error('Synthetic login input not hit-testable');await c.evaluate(`document.querySelector(${JSON.stringify(selector)}).select()`);await c.send('Input.insertText',{text:value})}
async function moduleIs(id){await until(`(()=>{const e=document.querySelector('main[data-hd-module]');return e&&e.getAttribute('data-hd-module')===${JSON.stringify(id)}})()`)}
async function more(){if(!await press('button[aria-label="Thêm"]'))throw Error('Footer More not hit-testable');await moduleIs('more')}
async function role(){return c.evaluate(`(()=>{if(!window.__hdVerification||!window.__hdVerification.fixtureOnly)throw Error('Fixture probe required');const m=document.querySelector('main[data-hd-module]'),k=m&&Object.keys(m).find(k=>k.startsWith('__reactFiber$'));let f=k&&m[k];for(let i=0;f&&i<100;i++,f=f.return){const p=f.memoizedProps;if(p&&p.currentUser)return{id:p.currentUser.id,role:p.currentUser.role}}return null})()`)}
try{
 c.onEvent(e=>{if(e.method==='Page.javascriptDialogOpening'&&/đăng xuất/i.test(e.params.message||''))void c.send('Page.handleJavaScriptDialog',{accept:true}).catch(error=>result.errors.push(error.message))});
 result.initialIdentity=await role();if(!String(result.initialIdentity?.id||'').startsWith('fixture-'))throw Error('Only seeded synthetic identities allowed');
 if(result.initialIdentity.id!=='fixture-manager'){
  await more();if(!await press('button.hd-more-menu__logout'))throw Error('Synthetic logout control unavailable');
  await until('Boolean(document.querySelector("input[type=tel]"))');
  await fill('input[type=tel]','0900000001');await fill('input[type=password]','Local-fixture-only-2026!');
  const point=await c.evaluate(`(()=>{const e=Array.from(document.querySelectorAll('button')).find(e=>e.textContent.trim()==='Vào Ứng Dụng');if(!e)return null;e.setAttribute('data-hd-supplemental-login','true');return true})()`);
  if(!point||!await press('[data-hd-supplemental-login]'))throw Error('Synthetic login submit unavailable');
  await moduleIs('home');await until('Number.isFinite(window.__hdVerification.homeDataReadyMs)');
 }
 result.identity=await role();if(result.identity.id!=='fixture-manager')throw Error('Manager fixture not verified');
 await more();result.visibleMenuIds=await c.evaluate(`Array.from(document.querySelectorAll('button[data-hd-more-module]')).map(e=>e.getAttribute('data-hd-more-module'))`);
 const assetClicked=await press('button[data-hd-more-module="asset_management"]');result.steps.push({action:'asset-via-module-control',clicked:assetClicked});
 if(assetClicked){
  await moduleIs('asset_management');await wait(500);
  result.assetGenericMoreCandidates=await c.evaluate(`Array.from(document.querySelectorAll('button')).filter(e=>e.getClientRects().length&&e.textContent.trim()==='Thêm').map(e=>({aria:e.getAttribute('aria-label'),title:e.title,footerNav:Boolean(e.getAttribute('aria-label')==='Thêm')}))`);
  await more();result.steps.push({action:'asset-to-more-using-footer-aria',observedModule:'more'});
 }
 const payrollClicked=await press('button[data-hd-more-module="payroll"]');result.steps.push({action:'payroll-via-module-control',clicked:payrollClicked});
 if(payrollClicked){await moduleIs('payroll');result.payrollReached=true;}
 if(!afterAbortedCollector){
  result.moduleChecks=[];
  for(const id of result.visibleMenuIds){
   const row={requested:id,startedAt:new Date().toISOString()};
   try{
    await more();row.clicked=await press(`button[data-hd-more-module="${id}"]`);
    if(!row.clicked)throw Error('Module menu control not hit-testable');
    await moduleIs(id);row.activeModuleObserved=true;
    const end=Date.now()+20000;
    do{
     row.readiness=await c.evaluate(`(()=>{const m=document.querySelector('main[data-hd-module]');return{contract:window.__hdSourceContract(m,${JSON.stringify(id)},window.__hdPlans),pending:window.__hdModulePending(m)}})()`);
     if(!row.readiness.contract.hasContract||row.readiness.contract.sourcesReady&&!row.readiness.pending)break;
     await wait(200);
    }while(Date.now()<end);
    row.status=row.readiness.contract.sourcesReady&&!row.readiness.pending?'SYNTHETIC_SOURCES_AND_VIEW_READY':'UI_REACHED_DATA_READINESS_NOT_VERIFIED';
   }catch(error){row.status='NOT_VERIFIED';row.error=error.message}
   row.endedAt=new Date().toISOString();result.moduleChecks.push(row);
  }
  await press('button[aria-label="Trang chủ"]');await moduleIs('home');
  result.finalProbe=await c.evaluate(`(()=>{const s=window.__hdVerification;return{errors:s.errors,rejections:s.rejections,blockedNetwork:s.blockedNetwork||null}})()`);
 }
 result.status='SUPPLEMENTAL_NAVIGATION_RECORDED_NOT_A_SOAK_REPLACEMENT';
}catch(error){result.status='NOT_VERIFIED';result.errors.push(error.message)}
finally{c.close();result.endedAt=new Date().toISOString();await fs.writeFile(`${root}/post-soak-navigation.json`,JSON.stringify(result,null,2));console.log(JSON.stringify(result));}
