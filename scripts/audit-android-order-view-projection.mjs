import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import {build} from 'esbuild';
import {appObject} from '../tests/helpers/app-source-function.mjs';
import {legacyViewModels,legacySnapshots} from '../tests/fixtures/order-view-projection.baseline.mjs';
import {connectAndroidWebView} from './helpers/android-webview-cdp.mjs';
const output=process.env.HD_ORDER_VIEW_LAB_OUTPUT||'test-results/android10-order-view-projection-lab';
await fs.mkdir(output,{recursive:true});
const source=await fs.readFile('src/App.jsx','utf8');
const helpers=['parseLooseMoneyValue','getOrderOutstandingBalance','normalizeOrderPaymentSnapshot','buildOrderViewModel','buildOrderViewProjectionSteps']
 .map(name=>{const node=appObject(name);return `const ${name}=${source.slice(node.start,node.end)};`}).join('\n');
const bundle=await build({stdin:{resolveDir:process.cwd(),contents:`
import './src/services/legacyRuntime.js';
import {runCooperativeReportProjection} from './src/services/cooperativeReportProjection.js';
import {createProjectionScheduler} from './src/services/cooperativeProjection.js';
${helpers}
const activeOrders=Array.from({length:5404},(_,i)=>({id:'o'+i,customerId:'c'+i%310,empId:'e'+i%17,amount:100000+i,paidAmount:i%4?1000:0,
 items:[{quantity:2,unitPrice:50000}],...Object.fromEntries(Array.from({length:40},(_,j)=>['fixture'+j,'Thông tin giả lập '+j]))}));
const context={customerLookup:new Map(),ledgerOrderById:new Map(),employeeLookup:new Map(),paymentHistoryByOrderId:new Map(),deliveryReportIssueByDispatch:new Map(),zaloQueueByOrderId:new Map()};
const {customerLookup,ledgerOrderById,employeeLookup,paymentHistoryByOrderId,deliveryReportIssueByDispatch,zaloQueueByOrderId}=context;
const useMemo=f=>f();
function synchronous(){const orderViewModels=${legacyViewModels};return {byId:orderViewModels,snapshots:${legacySnapshots}}}
export async function run(){const runs=[];let expected;
 for(const mode of ['synchronous','cooperative','cooperative','synchronous']){
  await new Promise(r=>setTimeout(r,100));let maxStepMs=null,steps=0,yields=0;const started=performance.now();let result;
  if(mode==='synchronous'){result=synchronous();maxStepMs=performance.now()-started;steps=1}
  else {const scheduler=createProjectionScheduler();try{result=await runCooperativeReportProjection(buildOrderViewProjectionSteps(activeOrders,context),{
    yieldWork:()=>{yields++;return scheduler.yieldTask()},runStep:f=>{const at=performance.now();try{return f()}finally{maxStepMs=Math.max(maxStepMs||0,performance.now()-at);steps++}}
  })}finally{scheduler.close()}}
  const elapsedMs=performance.now()-started,serialized=JSON.stringify(result);if(expected===undefined)expected=serialized;else if(expected!==serialized)throw Error('Order view fixture mismatch');
  runs.push({mode,elapsedMs,maxStepMs,stepCallsIncludingCleanup:steps,yields,count:result.snapshots.length});
 }
 return {equal:true,runs,fixture:{orders:5404,extraSyntheticFieldsPerOrder:40}};
}
`},bundle:true,write:false,format:'iife',globalName:'__hdOrderViewLab',target:'chrome74',define:{'process.env.NODE_ENV':'"production"'}});
const c=await connectAndroidWebView({adb:'D:/HD-DEV/android/sdk/platform-tools/adb.exe',serial:'emulator-5554',packageName:'com.hdmanager.app.acceptance',enableRuntime:false});
try{
 const result=await c.evaluate(bundle.outputFiles[0].text+'\n__hdOrderViewLab.run()');
 await fs.writeFile(output+'/result.json',JSON.stringify({at:new Date(),appSourceSha256:crypto.createHash('sha256').update(source).digest('hex'),...result,
 scope:'Actual Android10/WebView74, App helpers with only synthetic orders. Working-tree functions injected separately, not installed APK, real cloud data, INP, p95 or module acceptance. No application state, credentials, documents or network payload read.'},null,2));
 console.log(JSON.stringify(result));
}finally{try{await c.evaluate('delete window.__hdOrderViewLab')}catch{/* renderer lost */}c.close()}
