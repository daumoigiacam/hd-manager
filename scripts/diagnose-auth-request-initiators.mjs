import {mkdir,readFile,writeFile} from 'node:fs/promises';import path from 'node:path';
import {TraceMap,originalPositionFor} from '@jridgewell/trace-mapping';import {connectAndroidWebView} from './helpers/android-webview-cdp.mjs';
const candidate=process.env.HD_ACCEPTANCE_CANDIDATE_OUTPUT;if(!candidate)throw Error('Verified candidate directory required');
const output=path.join(candidate,'auth-initiator-diagnostic');await mkdir(output,{recursive:true});
const c=await connectAndroidWebView({adb:'D:/HD-DEV/android/sdk/platform-tools/adb.exe',serial:'emulator-5554',packageName:'com.hdmanager.app.acceptance',enableRuntime:false});
const requests=[],responses=new Map();let stop;
const sanitizeStack=stack=>{
 const result=[];for(let depth=0;stack&&depth<8;depth++,stack=stack.parent){
  for(const f of stack.callFrames||[]){
   const asset=typeof f.url==='string'&&f.url.match(/^https:\/\/localhost\/assets\/([A-Za-z0-9_.-]+\.js)$/);
   if(asset)result.push({asset:asset[1],line:f.lineNumber,column:f.columnNumber,functionName:f.functionName});
  }
 }return result.slice(0,100);
};
try{
 stop=c.onEvent(event=>{
  if(event.method==='Network.requestWillBeSent'){
   const p=event.params;let url;try{url=new URL(p.request.url)}catch{return}
   if(!['identitytoolkit.googleapis.com','securetoken.googleapis.com'].includes(url.hostname))return;
   requests.push({key:p.requestId,endpoint:url.pathname,at:p.timestamp,stack:sanitizeStack(p.initiator?.stack)});
  }else if(event.method==='Network.responseReceived'){
   const p=event.params;if(requests.some(r=>r.key===p.requestId))responses.set(p.requestId,{at:p.timestamp,status:p.response.status});
  }
 });
 await c.send('Network.enable',{maxTotalBufferSize:1,maxResourceBufferSize:1,maxPostDataSize:1});
 await c.send('Page.enable');await c.send('Page.reload',{ignoreCache:false});
 await new Promise(resolve=>setTimeout(resolve,20000));
}finally{stop?.();try{await c.send('Network.disable')}catch{}c.close()}
const maps=new Map();
for(const r of requests){
 r.response=responses.get(r.key)||null;delete r.key;
 if(r.response)r.durationMs=(r.response.at-r.at)*1000;
 for(const f of r.stack){
  if(!maps.has(f.asset)){try{maps.set(f.asset,new TraceMap(JSON.parse(await readFile(path.join(candidate,'public','assets',f.asset+'.map'),'utf8'))))}catch{maps.set(f.asset,null)}}
  if(maps.get(f.asset))f.original=originalPositionFor(maps.get(f.asset),{line:f.line+1,column:f.column});
 }
}
await writeFile(output+'/result.json',JSON.stringify({at:new Date(),requests,
 scope:'Instrumented JS reload with the approved encrypted QA session. Only public Auth endpoint path, timestamps/status and sanitized application code stack locations retained. No request URL queries, headers, bodies, response content, identifiers or credentials. Not clean latency acceptance.'},null,2));
console.log(JSON.stringify(requests.map(r=>({endpoint:r.endpoint,durationMs:r.durationMs,stack:r.stack.slice(-10).map(f=>f.original||{asset:f.asset,line:f.line,column:f.column})}))));
