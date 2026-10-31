import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {build} from 'esbuild';
import {connectAndroidWebView} from './helpers/android-webview-cdp.mjs';
const output=process.env.HD_REPORT_LAB_OUTPUT || 'test-results/android10-report-calculation-lab';
await fs.mkdir(output,{recursive:true});
const source=await fs.readFile('src/services/executiveDashboardService.js','utf8');
const frozen=await fs.readFile('tests/fixtures/profitability-build.baseline.mjs','utf8');
const baseline=frozen.slice(frozen.indexOf('export default ')+15).trim().replace(/;$/,'').replace('events.sort(sortProfitEvents)','events.sort(baselineSortProfitEvents)');
const bundled=await build({stdin:{resolveDir:path.resolve('src/services'),contents:`import './legacyRuntime.js';
${source}
const baselineSortProfitEvents=(a,b)=>{const day=a.dateKey.localeCompare(b.dateKey);return day || (a.type===b.type?0:(PROFIT_EVENT_ORDER[a.type]??9)-(PROFIT_EVENT_ORDER[b.type]??9))};
const baselineProfitability=${baseline};
const days=['2026-10-22','2026-10-23','2026-10-24'];
const input=normalizeInput({now:'2026-10-24T12:00:00',products:[{id:'duck',name:'Vịt',unit:'Con',groupName:'Vịt'}],
 orders:Array.from({length:4000},(_,i)=>({id:'o'+i,date:'2026-10-'+String(i%24+1).padStart(2,'0'),items:[{productId:'duck',quantity:i%9+1,price:60000+i,costPrice:30000}]})),
 warehouseImports:Array.from({length:500},(_,i)=>({id:'i'+i,date:'2026-10-'+String(i%24+1).padStart(2,'0'),productId:'duck',quantity:50,amount:1500000})),
 warehouseDispatches:Array.from({length:1500},(_,i)=>({id:'d'+i,date:'2026-10-'+String(i%24+1).padStart(2,'0'),productId:'duck',quantity:i%9+1,unit:'Con',costPrice:30000}))});
function calculate(mode){const previous=activeBuildCache;activeBuildCache={dates:new Map(),billing:new WeakMap(),totals:new WeakMap(),deliveries:new WeakMap()};
 try{if(mode==='baseline')return [days[2],...days].map(todayKey=>baselineProfitability(input,{todayKey}));
 const read=createProfitabilitySnapshotReader(input,days);return [days[2],...days].map(read)}finally{activeBuildCache=previous}}
export async function run(){
 const runs=[];let expected;
 for(const mode of ['baseline','prepared','prepared','baseline']){
  await new Promise(r=>setTimeout(r,100));const started=performance.now(),result=calculate(mode),elapsedMs=performance.now()-started;
  const serialized=JSON.stringify(result);if(expected===undefined)expected=serialized;else if(serialized!==expected)throw Error('Profitability fixture parity failed');
  runs.push({mode,elapsedMs,snapshots:result.length,totals:result.map(r=>r.totals)});
 }
 return {runs,fixture:{orders:4000,imports:500,dispatches:1500,days:3},equal:true};
}
`},bundle:true,write:false,format:'iife',globalName:'__hdReportCalculationLab',target:'chrome74',define:{'process.env.NODE_ENV':'"production"'}});
const c=await connectAndroidWebView({adb:'D:/HD-DEV/android/sdk/platform-tools/adb.exe',serial:'emulator-5554',packageName:'com.hdmanager.app.acceptance',enableRuntime:false});
try{
 const result=await c.evaluate(bundled.outputFiles[0].text+'\n__hdReportCalculationLab.run()');
 await fs.writeFile(output+'/result.json',JSON.stringify({at:new Date(),sourceSha256:crypto.createHash('sha256').update(source).digest('hex'),...result,
 scope:'Four ABBA diagnostic runs on actual Android 10/WebView74 with only synthetic data and per-build caches. Working-tree calculation code injected, NOT installed APK performance, real login, INP, p95 or whole-app acceptance. No application state, credentials, documents or network payloads accessed.'},null,2));
 console.log(JSON.stringify({equal:result.equal,runs:result.runs.map(r=>({mode:r.mode,elapsedMs:r.elapsedMs}))}));
}finally{try{await c.evaluate('delete window.__hdReportCalculationLab')}catch{/* renderer lost */}c.close()}
