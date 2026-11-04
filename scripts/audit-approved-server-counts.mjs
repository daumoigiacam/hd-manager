import {mkdir,writeFile} from 'node:fs/promises';
import {connectAndroidWebView} from './helpers/android-webview-cdp.mjs';
const output=process.env.HD_SERVER_COUNT_OUTPUT;
if(!output?.startsWith('test-results/'))throw Error('A local output is required.');
const c=await connectAndroidWebView({adb:'D:/HD-DEV/android/sdk/platform-tools/adb.exe',serial:'emulator-5554',packageName:'com.hdmanager.app.acceptance',enableRuntime:false});
try{
  // Counts only, using the existing approved SDK session INSIDE the app. The
  // credential never leaves the page or enters shell/log/output. No force refresh.
  const result=await c.evaluate(`(async function(){
    function context(){var main=document.querySelector('main[data-hd-module]'),key=main&&Object.keys(main).find(function(k){return k.indexOf('__reactFiber$')===0}),fiber=key&&main[key],company=null,user=null;
      for(var d=0;fiber&&d<100;d++,fiber=fiber.return){var props=fiber.memoizedProps;if(props&&props.currentUser&&props.currentCompany)company=props.currentCompany;
        for(var h=fiber.memoizedState,i=0;h&&i<1000;h=h.next,i++){var v=h.memoizedState;if(v&&typeof v.getIdToken==='function'&&typeof v.getIdTokenResult==='function'&&v.auth)user=v;}}
      if(!company||!user)throw Error('Approved existing session required');return {company:company,user:user};}
    var original=context(),claims=(await original.user.getIdTokenResult()).claims;
    if(claims.accountType!=='employee'||claims.companyId!==original.company.id||original.user.auth.app.options.projectId!=='hd-manager-c5839')throw Error('Approved scoped Firebase session mismatch');
    var rows=[],names=['customers','products','orders','payments','notifications','orderRequests','warehouseDispatches','deliveryReports'],deadline=performance.now()+20000;
    for(var name of names){if(performance.now()>=deadline){rows.push({collection:name,status:'UNMEASURED_TIME_BUDGET'});continue;}var current=context();if(current.user.uid!==original.user.uid||current.company.id!==original.company.id)throw Error('Session changed during read');
      var controller=new AbortController(),timer=setTimeout(function(){controller.abort()},Math.min(12000,deadline-performance.now())),at=performance.now();
      try{var token=await current.user.getIdToken(),response=await fetch('https://firestore.googleapis.com/v1/projects/hd-manager-c5839/databases/(default)/documents/artifacts/hd-manager-production/public/data:runAggregationQuery',{
          method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},signal:controller.signal,
          body:JSON.stringify({structuredAggregationQuery:{structuredQuery:{from:[{collectionId:name}],where:{fieldFilter:{field:{fieldPath:'companyId'},op:'EQUAL',value:{stringValue:original.company.id}}}},aggregations:[{alias:'count',count:{}}]}})});
        token=null;if(!response.ok){rows.push({collection:name,status:'HTTP_'+response.status});continue;}
        var payload=await response.json(),value=Array.isArray(payload)&&payload.find(function(row){return row.result&&row.result.aggregateFields&&row.result.aggregateFields.count});
        var count=Number(value&&value.result.aggregateFields.count.integerValue);
        rows.push({collection:name,status:Number.isSafeInteger(count)&&count>=0?'COUNT_CONFIRMED':'INVALID_COUNT',count:Number.isSafeInteger(count)&&count>=0?count:null,roundTripMs:performance.now()-at});
      }catch(error){rows.push({collection:name,status:error.name==='AbortError'?'TIMEOUT':'READ_FAILED'});}finally{clearTimeout(timer);}
    }return rows;
  })()`);
  await mkdir(output,{recursive:true});await writeFile(output+'/result.json',JSON.stringify({at:new Date().toISOString(),rows:result,
    scope:'Read-only server aggregation counts for the same already-approved employee/tenant session. Eight sequential aggregation queries, no document payloads or production writes. Credentials stay inside the app; no credential/identity/tenant values exported. Round-trip timing is diagnostic, not server-only latency or capacity acceptance.'},null,2));console.log(JSON.stringify(result));
}finally{c.close()}
