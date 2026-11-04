import fs from 'node:fs/promises';
import {connectAndroidWebView} from './helpers/android-webview-cdp.mjs';
const output=process.env.HD_LOGIN_NETWORK_OUTPUT;
if(!output?.startsWith('test-results/')||output.includes('..'))throw Error('A local output is required');
await fs.mkdir(output,{recursive:true});
const c=await connectAndroidWebView({adb:'D:/HD-DEV/android/sdk/platform-tools/adb.exe',serial:'emulator-5554',packageName:'com.hdmanager.app.acceptance',enableRuntime:false});
const rows=[],active=new Map();
const classify=name=>{try{const u=new URL(name);
 if(u.hostname==='asia-southeast1-hd-manager-c5839.cloudfunctions.net'&&u.pathname==='/identityLoginRegional')return 'regional-identity-login';
 if(u.hostname==='identitytoolkit.googleapis.com'&&/\/accounts:signInWithCustomToken$/.test(u.pathname))return 'firebase-custom-token';
 if(u.hostname==='identitytoolkit.googleapis.com'&&/\/accounts:lookup$/.test(u.pathname))return 'firebase-user-lookup';
}catch{}return null};
try{
 c.onEvent(event=>{
  const p=event.params;
  if(event.method==='Network.requestWillBeSent'){
   const endpoint=classify(p.request.url);if(!endpoint||p.request.method!=='POST')return;
   const row={endpoint,start:p.timestamp};rows.push(row);active.set(p.requestId,row);
  }else if(event.method==='Network.responseReceived'){
   const row=active.get(p.requestId);if(!row)return;row.status=p.response.status;
   const timings=p.response.timing||{};
   row.connection=Object.fromEntries(['dnsStart','dnsEnd','connectStart','connectEnd','sslStart','sslEnd','sendStart','sendEnd','receiveHeadersEnd'].filter(k=>Number.isFinite(timings[k])).map(k=>[k,timings[k]]));
   const key=Object.keys(p.response.headers).find(k=>k.toLowerCase()==='server-timing');
   if(key){row.serverStages=String(p.response.headers[key]).split(',').map(s=>s.trim().match(/^(rate|lookup|password|device|claims|sign|commit|migration|total);dur=(\d+(?:\.\d+)?)$/)).filter(Boolean).map(m=>({phase:m[1],durationMs:Number(m[2])}));}
  }else if(event.method==='Network.loadingFinished'){
   const row=active.get(p.requestId);if(!row)return;row.durationMs=(p.timestamp-row.start)*1000;delete row.start;active.delete(p.requestId);
  }else if(event.method==='Network.loadingFailed'){
   const row=active.get(p.requestId);if(!row)return;row.failed=true;delete row.start;active.delete(p.requestId);
  }
 });
 await c.send('Network.enable',{maxTotalBufferSize:0,maxResourceBufferSize:0,maxPostDataSize:0});
 console.log('LOGIN_NETWORK_METADATA_DIAGNOSTIC_ARMED');
 const deadline=Date.now()+240000;let reason='diagnostic-window-expired';
 while(Date.now()<deadline){
  const state=await c.evaluate('window.__hdAccountLoginFlow&&window.__hdAccountLoginFlow.state');
  if(state?.endReason){reason=state.endReason;break}
  await new Promise(resolve=>setTimeout(resolve,500));
 }
 for(const row of rows)delete row.start;
 const result={at:new Date().toISOString(),status:'DIAGNOSTIC_NOT_CLEAN_ACCEPTANCE',reason,rows,
  scope:'Metadata-only CDP network diagnostic. No response bodies, request bodies, authorization headers, phone/account IDs, API keys, JWTs or arbitrary header values captured/exported. Only allowlisted endpoint kinds and numeric server/transport stages. This instrumented run is diagnostic, not clean performance acceptance.'};
 await fs.writeFile(output+'/result.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{try{await c.send('Network.disable')}catch{}c.close()}
