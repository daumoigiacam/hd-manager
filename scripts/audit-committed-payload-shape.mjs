import {mkdir,writeFile} from 'node:fs/promises';
import {connectAndroidWebView} from './helpers/android-webview-cdp.mjs';

const output=process.env.HD_PAYLOAD_SHAPE_OUTPUT;
if(!output?.startsWith('test-results/'))throw Error('A local test-results output is required.');
const probe=async function(){
  var names=['companies','employees','customers','products','orders','orderRequests','warehouseImports','warehouseDispatches','payments','expenses','deliveryReports'];
  function locate(){
    var main=document.querySelector('main[data-hd-module]'),key=main&&Object.keys(main).find(function(k){return k.indexOf('__reactFiber$')===0}),fiber=key&&main[key],props=null,committed=null;
    for(var f=fiber,depth=0;f&&depth<100;f=f.return,depth++){
      var p=f.memoizedProps;if(p&&p.currentUser&&p.currentCompany&&Array.isArray(p.employees))props=p;
      for(var hook=f.memoizedState,index=0;hook&&index<1000;hook=hook.next,index++){
        var state=hook.memoizedState,value=state&&state.current;
        if(value&&Array.isArray(value.employees)&&Array.isArray(value.companies)&&Object.prototype.hasOwnProperty.call(value,'warehouseStockCounts')&&Object.prototype.hasOwnProperty.call(value,'pricingScenarios'))committed=value;
      }
    }
    return {props:props,committed:committed};
  }
  var initial=locate(),props=initial.props,committed=initial.committed;
  if(!props||!committed)return {status:'NO_APPROVED_COMMITTED_DIRECTORY',collections:[]};
  var actor=props.currentUser,company=props.currentCompany,tenant=actor.companyId;
  if(!tenant||company.id!==tenant)return {status:'SCOPE_UNVERIFIED',collections:[]};
  function current(){var now=locate().props;return now&&now.currentUser.companyId===tenant&&now.currentUser.id===actor.id&&now.currentUser.accountId===actor.accountId&&now.currentUser.role===actor.role&&now.currentCompany.id===tenant
    &&now.currentCompany.rolePermissions===company.rolePermissions&&now.currentCompany.employeeRolePermissions===company.employeeRolePermissions
    &&now.currentCompany.rolePermissionActions===company.rolePermissionActions&&now.currentCompany.employeeRolePermissionActions===company.employeeRolePermissionActions;}
  function bucket(key){if(/image|photo|proof|attachment|signature|logo|avatar/i.test(key))return 'MEDIA_FIELDS';
    if(/^(note|notes|description|content|body|html)$/i.test(key))return 'TEXT_FIELDS';
    if(/^(items|lines|primaryItem|productDetails)$/i.test(key))return 'LINE_ITEMS';
    if(/price|config|permission|branches|settings/i.test(key))return 'CONFIGURATION_FIELDS';return 'OTHER_FIELDS';}
  var began=performance.now(),deadline=began+15000,slice=began,steps=0,results=[],complete=true,reason=null;
  for(var name of names){
    var value=committed[name],rows=Array.isArray(value)?value:value&&typeof value==='object'?Object.values(value):[];
    var result={collection:name,availableRows:rows.length,observedRows:0,omittedUnscopedRows:0,stringCodeUnits:0,maxStringCodeUnits:0,stringValues:0,objectNodes:0,arrayNodes:0,maxArrayLength:0,opaqueObjects:0,cycleRefs:0,fieldBuckets:{}};
    var sizes=[];
    for(var row of rows){
      if(!row||typeof row!=='object'||(name==='companies'?row.id!==tenant:row.companyId!==tenant)){result.omittedUnscopedRows++;continue;}
      var stack=[row,0,'OTHER_FIELDS'],seen=new WeakSet(),size=0;
      while(stack.length){
        var group=stack.pop(),depth=stack.pop(),item=stack.pop();
        if(typeof item==='string'){
          size+=item.length;result.stringCodeUnits+=item.length;result.stringValues++;result.maxStringCodeUnits=Math.max(result.maxStringCodeUnits,item.length);
          result.fieldBuckets[group]=(result.fieldBuckets[group]||0)+item.length;
        }else if(item&&typeof item==='object'){
          if(seen.has(item))result.cycleRefs++;
          else if(depth>64)result.opaqueObjects++;
          else if(Array.isArray(item)){
            seen.add(item);result.arrayNodes++;result.maxArrayLength=Math.max(result.maxArrayLength,item.length);
            for(var i=item.length-1;i>=0;i--)stack.push(item[i],depth+1,group);
          }else{
            var prototype=Object.getPrototypeOf(item);
            if(prototype!==Object.prototype&&prototype!==null)result.opaqueObjects++;
            else{
              seen.add(item);result.objectNodes++;
              for(var key of Object.keys(item))stack.push(item[key],depth+1,depth===0?bucket(key):group);
            }
          }
        }
        if(++steps%128===0&&performance.now()-slice>=4){
          await new Promise(function(resolve){setTimeout(resolve,0)});slice=performance.now();
          if(slice>=deadline||!current()){complete=false;reason=slice>=deadline?'TIME_BUDGET':'SCOPE_CHANGED';break;}
        }
      }
      if(!complete)break;
      result.observedRows++;sizes.push(size);
    }
    sizes.sort(function(a,b){return a-b});
    function percentile(p){return sizes.length?sizes[Math.ceil(sizes.length*p)-1]:null;}
    result.rowStringCodeUnits={p50:percentile(.5),p95:percentile(.95),p99:percentile(.99),max:sizes.length?sizes[sizes.length-1]:null};
    result.status=complete?'OBSERVED_COMMITTED_ROWS':'PARTIAL_NOT_COMPLETE';results.push(result);
    if(!complete)break;
    if(performance.now()>=deadline){complete=false;reason='TIME_BUDGET';break;}
  }
  return {status:complete?'BOUNDED_SHAPE_OBSERVATION':'PARTIAL_SHAPE_OBSERVATION',reason:reason,elapsedMs:performance.now()-began,collections:results,
    requestedCollections:names.length,observedCollections:results.length};
};

const c=await connectAndroidWebView({adb:'D:/HD-DEV/android/sdk/platform-tools/adb.exe',serial:'emulator-5554',packageName:'com.hdmanager.app.acceptance',enableRuntime:false});
try{
  const observation=await c.evaluate(`(${probe.toString()})()`);
  const result={at:new Date().toISOString(),observation,
    scope:'Read-only, time-bounded traversal of the approved app’s already-committed tenant rows. Only counts, primitive string lengths and generic field buckets exported; no record IDs, keys, string values, credentials or document contents. Opaque SDK objects are not traversed. Not serialized/network bytes, V8 allocation size, live heap, a benchmark or proof of a leak. Partial/time-budget/scope changes remain explicit. Run only after clean latency collection.'};
  await mkdir(output,{recursive:true});await writeFile(output+'/result.json',JSON.stringify(result,null,2));
  console.log(JSON.stringify({status:observation.status,observedCollections:observation.observedCollections,elapsedMs:observation.elapsedMs,
    collections:observation.collections?.map(row=>({collection:row.collection,observedRows:row.observedRows,maxStringCodeUnits:row.maxStringCodeUnits,stringCodeUnits:row.stringCodeUnits,status:row.status}))}));
}finally{c.close()}
