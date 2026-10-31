import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import {build} from 'esbuild';
import {connectAndroidWebView} from './helpers/android-webview-cdp.mjs';
const output=process.env.HD_COOPERATIVE_REPORT_LAB_OUTPUT||'test-results/android10-cooperative-report-lab';
await fs.mkdir(output,{recursive:true});
const code=await build({stdin:{resolveDir:process.cwd(),contents:`
import './src/services/legacyRuntime.js';
import {buildExecutiveDashboardSnapshot,createExecutiveDashboardSnapshotIterator} from './src/services/executiveDashboardService.js';
import {runCooperativeReportProjection} from './src/services/cooperativeReportProjection.js';
import {createProjectionScheduler} from './src/services/cooperativeProjection.js';
const input={now:'2026-10-24T12:00:00',company:{id:'synthetic-company'},products:[{id:'duck',name:'Vịt',unit:'Con',groupName:'Vịt'}],
orders:Array.from({length:4000},(_,i)=>({id:'o'+i,date:'2026-10-'+String(i%24+1).padStart(2,'0'),amount:(i%9+1)*(60000+i),items:[{productId:'duck',quantity:i%9+1,price:60000+i,costPrice:30000}]})),
warehouseImports:Array.from({length:500},(_,i)=>({id:'i'+i,date:'2026-10-'+String(i%24+1).padStart(2,'0'),productId:'duck',quantity:50,amount:1500000})),
warehouseDispatches:Array.from({length:1500},(_,i)=>({id:'d'+i,date:'2026-10-'+String(i%24+1).padStart(2,'0'),productId:'duck',quantity:i%9+1,unit:'Con',costPrice:30000})),
payrollCosts:[{date:'2026-10-24',employeeId:'fixture-employee',amount:100000}],cashExpenseRecords:[{date:'2026-10-24',amount:50000,category:'Chi phí thử'}]};
export async function run(){const runs=[];let expected;
for(const mode of ['synchronous','cooperative','cooperative','synchronous']){
 await new Promise(r=>setTimeout(r,100));let yields=0,maxStepMs=null,steps=0,last=performance.now(),maxTimerGapMs=null;
 const timer=setInterval(()=>{const n=performance.now();maxTimerGapMs=Math.max(maxTimerGapMs||0,n-last);last=n},16);
 const started=performance.now();let result;
 try{if(mode==='synchronous'){result=buildExecutiveDashboardSnapshot(input);maxStepMs=performance.now()-started;steps=1}
 else {const scheduler=createProjectionScheduler();try{result=await runCooperativeReportProjection(createExecutiveDashboardSnapshotIterator(input),{
  yieldWork:()=>{yields++;return scheduler.yieldTask()},runStep:f=>{const s=performance.now();try{return f()}finally{maxStepMs=Math.max(maxStepMs||0,performance.now()-s);steps++}}
 })}finally{scheduler.close()}}
 }finally{clearInterval(timer)}
 const elapsedMs=performance.now()-started,serialized=JSON.stringify({...result,generatedAt:null});
 if(expected===undefined)expected=serialized;else if(serialized!==expected)throw Error('Full financial projection mismatch');
 runs.push({mode,elapsedMs,maxStepMs,steps,yields,maxTimerGapMs,expense:result.finance.expenseMonth,revenue:result.finance.revenueMonth});
}
return {equal:true,runs,fixture:{orders:4000,imports:500,dispatches:1500}};}
`},bundle:true,write:false,format:'iife',globalName:'__hdCooperativeReportLab',target:'chrome74',define:{'process.env.NODE_ENV':'"production"'}});
const c=await connectAndroidWebView({adb:'D:/HD-DEV/android/sdk/platform-tools/adb.exe',serial:'emulator-5554',packageName:'com.hdmanager.app.acceptance',enableRuntime:false});
try{
 const result=await c.evaluate(code.outputFiles[0].text+'\n__hdCooperativeReportLab.run()');
 const sources={};for(const file of ['src/services/executiveDashboardService.js','src/services/cooperativeReportProjection.js','src/services/cooperativeProjection.js'])sources[file]=crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex');
 await fs.writeFile(output+'/result.json',JSON.stringify({at:new Date(),sources,...result,
 scope:'Actual Android10/WebView74, working-tree functions with synthetic fixtures only. Four ABBA diagnostic runs, not installed APK/login/module acceptance, paint, INP or p95. Timer gap remains null when no interval fires. No business state, credentials or network payload accessed.'},null,2));
 console.log(JSON.stringify(result));
}finally{try{await c.evaluate('delete window.__hdCooperativeReportLab')}catch{/* renderer lost */}c.close()}
