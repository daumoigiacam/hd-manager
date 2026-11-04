import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import {connectAndroidWebView} from './helpers/android-webview-cdp.mjs';
import {loadSyntheticHomeInput} from './helpers/home-prototype-synthetic-input.mjs';
import {exportSyntheticHomeInput} from './upgrade-home-read-model-emulator.mjs';
import {buildHomePrimaryProjection} from '../src/services/executiveDashboardService.js';
import {getCashExpenseFinance,getReportPeriod} from '../src/features/business-report/reportViewModel.js';
const candidate=process.argv[2],root='test-results/performance-upgrade-20261103';
if(!/^after-home-priority-v\d+-two$/.test(candidate||''))throw Error('Explicit frozen fictional candidate required');
const output=path.join(root,`${candidate}-read-model-parity`);await fs.mkdir(output,{recursive:true});
const evidencePath=path.join(output,'parity.json');
try{await fs.access(evidencePath);throw Error('Preserve prior parity evidence')}catch(error){if(error.code!=='ENOENT')throw error}
const hash=value=>createHash('sha256').update(value).digest('hex');
const periods=['today','week','month','quarter','year'];
const view=snapshot=>Object.fromEntries(periods.map(period=>{const r=getReportPeriod(getCashExpenseFinance(snapshot.finance),period);return[period,Object.fromEntries(['revenue','expense','profit','receivables'].map(key=>[key,r[key]]))]}));
const identity=JSON.parse(await fs.readFile(`${root}/${candidate}/capacitor-build-identity.json`));
if(identity.project!=='demo-hdm-perf-verification')throw Error('Only isolated fixture APK');
const frozen=JSON.parse(await fs.readFile(`${root}/${candidate}/source-inputs.json`));
if(!frozen.unchangedDuringBuild||frozen.files.find(row=>row.file==='src/App.jsx')?.sha256!==hash(await fs.readFile('src/App.jsx')))throw Error('App source differs from frozen APK');
const bundled=await build({stdin:{contents:"export {getCashExpenseFinance,getReportPeriod} from './src/features/business-report/reportViewModel.js'",resolveDir:process.cwd()},bundle:true,write:false,format:'iife',globalName:'parityFinance',platform:'browser',target:'chrome74'});
const loaded=await loadSyntheticHomeInput(output),snapshot=buildHomePrimaryProjection(loaded.input),prototypePeriods=view(snapshot);
const c=await connectAndroidWebView({adb:'D:/HD-DEV/android/sdk/platform-tools/adb.exe',serial:'emulator-5554',packageName:'com.hdmanager.caplab.diag',port:9251});let native;
try{
 const installed=c.shell('shell','pm','path','com.hdmanager.caplab.diag').replace(/^package:/,'').trim();
 if(!installed.startsWith('/data/app/')||!installed.endsWith('/base.apk'))throw Error('Unexpected native package');
 const apkSha256=c.shell('shell','sha256sum',installed).split(/\s+/)[0];
 if(apkSha256!==hash(await fs.readFile(`${root}/${candidate}/capacitor-project/app/build/outputs/apk/diagnostic/app-diagnostic.apk`)))throw Error('Installed APK is not frozen candidate');
 native=await c.evaluate(`(function(){${bundled.outputFiles[0].text}
  if(!window.__hdVerification||!window.__hdVerification.fixtureOnly)throw Error('Fictional fixture required');
  var m=document.querySelector('main[data-hd-module=home]');if(!m||!window.__hdSourceContract(m,'home',window.__hdPlans).sourcesReady||window.__hdModulePending(m))throw Error('Complete Home sources required');
  var fiber=m[Object.keys(m).find(function(k){return k.indexOf('__reactFiber$')===0})];while(fiber&&fiber.return)fiber=fiber.return;
  var stack=[fiber&&fiber.stateNode&&fiber.stateNode.current],primary=null,mainProps=null;
  // DOM's fiber can point at the previous alternate. Inspect the CURRENT root,
  // never mistake an obsolete pre-publication null for live financial state.
  for(var i=0;stack.length&&i<20000;i++){var n=stack.pop();if(!n)continue;var p=n.memoizedProps;if(p&&p.homeReadinessCollections)mainProps=p;if(p&&p.snapshot&&p.snapshot.kind==='home-primary-v1')primary=p.snapshot;if(n.sibling)stack.push(n.sibling);if(n.child)stack.push(n.child)}
  if(!primary||!mainProps||!Array.isArray(mainProps.customerComplaints))throw Error('Confirmed empty complaints must be an array, never missing/null');
  var views={};${JSON.stringify(periods)}.forEach(function(period){var r=parityFinance.getReportPeriod(parityFinance.getCashExpenseFinance(primary.finance),period),row={};['revenue','expense','profit','receivables'].forEach(function(k){row[k]=r[k]});views[period]=row});
  return{periods:views,counts:{customers:mainProps.customers.length,orders:mainProps.orders.length,payments:mainProps.payments.length,complaints:mainProps.customerComplaints.length},cards:Array.from(m.querySelectorAll('.business-report-kpi')).map(function(e){return e.title}),stamp:(m.querySelector('.business-report-freshness')||{}).textContent,errors:window.__hdVerification.errors,rejections:window.__hdVerification.rejections};})()`);
 native.apkSha256=apkSha256;native.api=c.shell('shell','getprop','ro.build.version.sdk');
}finally{c.close()}
const nativePath=path.join(output,'native.json');await fs.writeFile(nativePath,JSON.stringify(native,null,2));
const equal=JSON.stringify(native.periods)===JSON.stringify(prototypePeriods);
const scopeValid=native.counts.customers===1000&&native.counts.orders===2000&&native.counts.payments===2000&&native.counts.complaints===0;
const evidence={kind:'home-read-model-actual-app-parity-v1',status:equal&&scopeValid&&!native.errors.length&&!native.rejections?'PASS':'FAIL',sourceEquivalent:equal&&scopeValid,
 at:new Date().toISOString(),candidate,actualApp:native.periods.today,prototype:prototypePeriods.today,periods:{actualApp:native.periods,prototype:prototypePeriods},
 sourceRevision:loaded.sourceRevision,domainSourceSha256:loaded.domainSourceSha256,appSourceSha256:hash(await fs.readFile('src/App.jsx')),timeZone:'Asia/Ho_Chi_Minh',dayKey:loaded.input.now.toLocaleDateString('sv-SE'),
 nativeEvidence:{path:path.resolve(nativePath),sha256:hash(await fs.readFile(nativePath))},fixture:loaded.fixture,
 qualification:'Fictional complete-source Home only. Five-period exact financial comparison and native displayed cards; source counts/current readiness checked. No production auth/Rules/performance acceptance. Frozen pre-fix cohorts retain their earlier null-complaint calculation and are not relabelled.'};
await fs.writeFile(evidencePath,JSON.stringify(evidence,null,2));console.log(JSON.stringify({status:evidence.status,actualApp:evidence.actualApp,evidencePath}));if(evidence.status!=='PASS')throw Error('Actual native financial parity failed');
await exportSyntheticHomeInput(loaded,path.join(output,'existing-home-domain.mjs'),path.join(output,'fictional-source-export.json'));
