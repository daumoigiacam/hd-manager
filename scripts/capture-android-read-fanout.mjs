import { mkdir, writeFile } from 'node:fs/promises';
import { connectAndroidWebView } from './helpers/android-webview-cdp.mjs';
const output=process.env.HD_FANOUT_OUTPUT || 'test-results/android10-read-fanout';await mkdir(output,{recursive:true});
const cdp=await connectAndroidWebView({adb:'D:/HD-DEV/android/sdk/platform-tools/adb.exe',serial:'emulator-5554',packageName:'com.hdmanager.app.acceptance',port:9228});
const requests=new Map(), diagnostics=[];
const allowed = new Set(['companies','employees','customers','products','orders','payments','expenses','financials','attendance','performance','warehouseImports','warehouseDispatches','payrollPeriods','employeeReviews','customerComplaints','holidays','deliveryReports','notifications','messages','orderRequests','assets','assetCostLogs']);
const stop=cdp.onEvent(({method,params})=>{
  if(method==='Network.requestWillBeSent'){
    const url=new URL(params.request.url);if(url.hostname!=='firestore.googleapis.com')return;
    let query;const targets=[];
    try { query=JSON.parse(params.request.postData || '{}').structuredQuery; } catch {}
    if(!query && params.request.postData)try{
      for(const [key,value] of new URLSearchParams(params.request.postData))if(/^req\d+___data__$/.test(key)){
        const target=JSON.parse(value).addTarget;
        const name=target?.query?.structuredQuery?.from?.[0]?.collectionId;
        if(allowed.has(name))targets.push(name);
        for(const document of target?.documents?.documents || []){const name=document.split('/').at(-2);if(allowed.has(name))targets.push(name);}
      }
    }catch{}
    const collection=query?.from?.[0]?.collectionId;
    const entry={id:params.requestId,kind:url.pathname.endsWith(':runQuery')?'REST':'SDK',collection:allowed.has(collection)?collection:'unclassified',sdkTargets:[...new Set(targets)],limit:query?.limit,hasCursor:Boolean(query?.startAt),start:params.timestamp,wallTime:params.wallTime};
    requests.set(params.requestId,entry);
  } else if(method==='Network.responseReceived'){
    const entry=requests.get(params.requestId);if(entry)entry.status=params.response.status;
  } else if(method==='Network.loadingFinished'||method==='Network.loadingFailed'){
    const entry=requests.get(params.requestId);if(entry){entry.durationMs=(params.timestamp-entry.start)*1000;entry.bytes=params.encodedDataLength;entry.error=params.errorText;}
  } else if(method==='Runtime.consoleAPICalled' && ['error','warning'].includes(params.type)){
    // Never serialize arbitrary console arguments or plugin credential data.
    for(const arg of params.args || [])if(typeof arg.value==='string'){
      const assertion=arg.value.match(/INTERNAL ASSERTION FAILED[\s\S]*?\b(ca9|b815)\b/i);
      const listener=arg.value.match(/Realtime listener (?:failed|is recovering) for ([a-zA-Z_]+):/);
      if(assertion)diagnostics.push({kind:'firestore-assertion',code:assertion[1]});
      if(listener && allowed.has(listener[1]))diagnostics.push({kind:'listener-error',collection:listener[1]});
    }
  }
});
try{
  await cdp.send('Network.enable');
  const seconds=Number(process.env.HD_FANOUT_SECONDS || 60);if(!Number.isSafeInteger(seconds)||seconds<10||seconds>1200)throw Error('Invalid observation duration');
  for(let i=0;i<seconds;i++){
    await writeFile(`${output}/progress.json`,JSON.stringify({requests:[...requests.values()],diagnostics},null,2));
    await new Promise(resolve=>setTimeout(resolve,1000));
  }
  await writeFile(`${output}/result.json`,JSON.stringify({requests:[...requests.values()],diagnostics,scope:'Read-only live request metadata, attached after login; no credentials, query values, document contents or UI actions collected.'},null,2));
  console.log(JSON.stringify({requestCount:requests.size,diagnostics}));
}finally{stop();cdp.close();}
