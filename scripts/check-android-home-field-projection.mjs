import {readFile,mkdir,writeFile} from 'node:fs/promises';import path from 'node:path';import {build} from 'esbuild';import {createHash} from 'node:crypto';
import {buildProjectedEmployeeHomeProjector} from './helpers/employee-home-projected-projector-build.mjs';
import {connectAndroidWebView} from './helpers/android-webview-cdp.mjs';
const output=process.env.HD_HOME_FIELD_PARITY_OUTPUT;
if(!output?.startsWith('test-results/'))throw Error('Local diagnostic output required.');
const manifest=await buildProjectedEmployeeHomeProjector(output+'/artifact');
const original=path.resolve('test-results/perf-target-20261102/deployed-full-home-reference/employee-home-projector.cjs').replaceAll('\\','/'),projected=manifest.modulePath.replaceAll('\\','/');
if(createHash('sha256').update(await readFile(original)).digest('hex')!=='628fb912eb07203e0d399eecc2a5c286565ae102435e65392264a35583b00a3d')throw Error('Frozen deployed full-reference artifact hash mismatch.');
const bundle=await build({stdin:{contents:`import * as full from ${JSON.stringify(original)};import * as projected from ${JSON.stringify(projected)};export {full,projected};`,resolveDir:path.resolve('.')},bundle:true,write:false,platform:'browser',format:'iife',globalName:'homeFieldComparison',target:'chrome74'});
const c=await connectAndroidWebView({adb:'D:/HD-DEV/android/sdk/platform-tools/adb.exe',serial:'emulator-5554',packageName:'com.hdmanager.app.acceptance',enableRuntime:false});let result;
try{
 result=await c.evaluate(`(async function(){
  ${bundle.outputFiles[0].text}
  function current(){var m=document.querySelector('main[data-hd-module="home"]'),k=m&&Object.keys(m).find(function(k){return k.indexOf('__reactFiber$')===0}),f=k&&m[k];
   for(var depth=0;f&&depth<100;depth++,f=f.return){var p=f.memoizedProps;if(p&&p.homeReadinessCollections&&p.employee)return p}return null}
  var p=current(),names=['employees','customers','orders','payments','expenses','financials','employeeReviews','deliveryReports','holidays','assets','assetCostLogs','advances'];
  if(!p||p.currentUser.accountType!=='employee'||p.currentUser.id!==p.employee.id||p.employee.companyId!==p.currentUser.companyId)throw Error('Approved own-employee Home session required');
  var required=['companies','employees'].concat(p.homeReadinessCollections),flags=p.serverConfirmedCollectionState;
  if(p.homeReadinessCollections.length!==13||flags.tenantId!==p.currentUser.companyId||!required.every(function(n){return flags.collections[n]===true}))throw Error('Complete personal Home source contract required');
  var actor={companyId:p.currentUser.companyId,employeeId:p.employee.id,date:p.date},snapshot={company:{documentId:actor.companyId,data:p.currentCompany},employee:{documentId:actor.employeeId,data:p.employee},sources:{},counts:{}};
  names.forEach(function(n){var rows=n==='advances'?p.advanceRequests:p[n];snapshot.sources[n]=rows.map(function(row){return {documentId:row.id,data:row}})});
  snapshot.sources.attendance=Object.keys(p.attendance).map(function(id){return {documentId:id,data:p.attendance[id]}});
  snapshot.sources.performance=Object.keys(p.performance).filter(function(id){return p.performance[id].companyId===actor.companyId}).map(function(id){return {documentId:id,data:p.performance[id]}});
  Object.keys(snapshot.sources).forEach(function(n){snapshot.counts[n]=snapshot.sources[n].length});
  var spec=homeFieldComparison.projected.employeeHomeFieldProjection,selected={company:snapshot.company,employee:snapshot.employee,counts:snapshot.counts,sources:{},fieldProjection:spec},sizes=[],encoder=new TextEncoder(),steps=0;
  for(var name of Object.keys(snapshot.sources)){
   var fields=spec.fieldsByCollection[name],rows=snapshot.sources[name];if(!fields){selected.sources[name]=rows;continue}
   var set=new Set(fields),before=0,after=0,mapped=[];
   for(var row of rows){var data=Object.fromEntries(Object.entries(row.data).filter(function(entry){return set.has(entry[0])}));
    before+=encoder.encode(JSON.stringify(row.data)).byteLength;after+=encoder.encode(JSON.stringify(data)).byteLength;mapped.push({documentId:row.documentId,data:data});
    if(++steps%32===0)await new Promise(function(resolve){setTimeout(resolve,0)});
   }
   selected.sources[name]=mapped;sizes.push({collection:name,rows:rows.length,beforeJsonUtf8Bytes:before,afterJsonUtf8Bytes:after});
  }
  function same(){var live=current();return live&&live.currentUser.id===p.currentUser.id&&live.currentUser.companyId===p.currentUser.companyId&&live.date===p.date
   &&['employees','customers','orders','payments','expenses','financials','attendance','performance','employeeReviews','deliveryReports','holidays','assets','assetCostLogs','advanceRequests'].every(function(n){return live[n]===p[n]})}
  if(!same())return {status:'SOURCE_CHANGED_NOT_COMPARABLE',sizes:sizes};
  try{
   var began=performance.now(),expected=homeFieldComparison.full.projectEmployeeHomeSnapshot(actor,snapshot),fullCalculationMs=performance.now()-began;
   began=performance.now();var actual=homeFieldComparison.projected.projectEmployeeHomeSnapshot(actor,selected),projectedCalculationMs=performance.now()-began;
   if(!same())return {status:'SOURCE_CHANGED_NOT_COMPARABLE',sizes:sizes};
   return {status:JSON.stringify(expected)===JSON.stringify(actual)?'LOCAL_DISPLAY_PARITY':'DISPLAY_MISMATCH',sizes:sizes,fieldCount:spec.fieldsByCollection.orders.length,displayCharacters:JSON.stringify(actual).length,
    diagnosticCalculationMs:{full:fullCalculationMs,projected:projectedCalculationMs}};
  }catch(error){return {status:'PROJECTION_REJECTED',code:/^[a-z_]{1,80}$/.test(error.code||'')?error.code:'calculation_failed',sizes:sizes}}
 })()`);
}finally{c.close()}
await mkdir(output,{recursive:true});await writeFile(output+'/result.json',JSON.stringify({at:new Date().toISOString(),domainVersion:manifest.domainVersion,...result,
 scope:'Read-only local diagnostic on already-filtered, already-committed Main employee props in the approved Acceptance session. No Firebase API invocation, source writes, account IDs, document values, credentials or financial amounts exported. Per-record JSON byte estimates are not gRPC wire/heap bytes or latency acceptance. Original deployed calculation vs local guarded calculation, not raw Admin source/API parity. Concurrent source changes reject comparison.'},null,2));
console.log(JSON.stringify(result));if(result?.status!=='LOCAL_DISPLAY_PARITY')throw Error('Guarded local projection not proven.');
