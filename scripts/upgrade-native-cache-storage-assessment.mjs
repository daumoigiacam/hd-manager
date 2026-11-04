import fs from'node:fs/promises';import{connectAndroidWebView}from'./helpers/android-webview-cdp.mjs';
const out='test-results/performance-upgrade-20261103/native-existing-cache-store-assessment.json';
try{await fs.access(out);throw Error('Preserve prior assessment')}catch(error){if(error.code!=='ENOENT')throw error}
const c=await connectAndroidWebView({adb:'D:/HD-DEV/android/sdk/platform-tools/adb.exe',serial:'emulator-5554',packageName:'com.hdmanager.caplab.diag',port:9251});
const r={at:new Date().toISOString(),status:'RUNNING',productionRequests:0,qualification:'Existing NativeBiometric private KV store, ONLY new random qa-only-home-cache key in fictional Acceptance package. No existing keys/credentials read or changed. Fictional2KiB payload; assesses native storage IPC only, not real cache scope, App render time or cold data acceptance.'};
try{
 if(!await c.evaluate('Boolean(window.__hdVerification&&window.__hdVerification.fixtureOnly)'))throw Error('Fictional package required');
 r.measurement=await c.evaluate(`(async function(){
  var C=window.Capacitor;if(!C||typeof C.nativePromise!=='function')throw Error('Native plugin bridge unavailable');
  var key='qa-only-home-cache-'+crypto.randomUUID(),value=JSON.stringify({schema:'fictional-cache-store-assessment-v1',data:'x'.repeat(1984)}),rows=[];
  try{for(var i=0;i<10;i++){
   var start=performance.now();await C.nativePromise('NativeBiometric','setData',{key:key,value:value,accessControl:0});var written=performance.now();
   var result=await C.nativePromise('NativeBiometric','getData',{key:key}),read=performance.now();if(result.value!==value)throw Error('Private test-key value mismatch');
   rows.push({writeMs:written-start,readMs:read-written,totalMs:read-start,bytes:value.length});
  }}finally{await C.nativePromise('NativeBiometric','deleteData',{key:key})}
  var removed=false;try{await C.nativePromise('NativeBiometric','getData',{key:key})}catch(error){removed=true}if(!removed)throw Error('QA test-key cleanup not confirmed');
  return{rows:rows,exactRoundTrip:true,testKeyRemoved:true};
 })()`);
 r.status='EXISTING_PRIVATE_STORE_OBSERVED_NOT_INTEGRATED';
}catch(error){r.status='FAILED';r.error=error.message;process.exitCode=1}finally{c.close();r.endedAt=new Date().toISOString();await fs.writeFile(out,JSON.stringify(r,null,2));console.log(JSON.stringify(r))}
