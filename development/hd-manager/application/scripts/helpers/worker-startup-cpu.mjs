// Diagnostic-only sampler for the owned fictional APK. Never pauses a worker;
// profiles retain function/URL/line/timing metadata, not object/string contents.
export async function armWorkerStartupCpu(cdp,{ownedSyntheticApk=false}={}){
 if(!ownedSyntheticApk)throw Error('Owned synthetic APK required');
 const sessions=new Map(),pending=new Map(),errors=[];let nextId=91000,closed=false;
 const send=(sessionId,method,params={})=>new Promise((resolve,reject)=>{
  const id=++nextId,key=sessionId+':'+id,timer=setTimeout(()=>{pending.delete(key);reject(Error('Worker diagnostic timeout '+method))},5000);
  pending.set(key,{resolve,reject,timer});
  cdp.send('Target.sendMessageToTarget',{sessionId,message:JSON.stringify({id,method,params})}).catch(error=>{clearTimeout(timer);pending.delete(key);reject(error)});
 });
 const off=cdp.onEvent(event=>{
  if(event.method==='Target.receivedMessageFromTarget'){
   const message=JSON.parse(event.params.message),key=event.params.sessionId+':'+message.id,job=pending.get(key);
   if(job){clearTimeout(job.timer);pending.delete(key);message.error?job.reject(Error(message.error.message)):job.resolve(message.result)}
  }
  if(closed||event.method!=='Target.attachedToTarget')return;
  const {targetInfo,sessionId}=event.params;
  if(targetInfo.type!=='worker'||!/^https:\/\/localhost\/|^blob:https:\/\/localhost\//.test(targetInfo.url)||sessions.size>=8||sessions.has(sessionId))return;
  const entry={sessionId,asset:targetInfo.url.split('/').at(-1),started:false};sessions.set(sessionId,entry);
  entry.ready=(async()=>{await send(sessionId,'Profiler.enable');await send(sessionId,'Profiler.setSamplingInterval',{interval:1000});await send(sessionId,'Profiler.start');entry.started=true})().catch(error=>errors.push(error.message));
 });
 await cdp.send('Target.setAutoAttach',{autoAttach:true,waitForDebuggerOnStart:false,flatten:false});
 return {async stop(){
  closed=true;const profiles=[];
  try{for(const entry of sessions.values()){
   await entry.ready;if(!entry.started)continue;
   try{const result=await send(entry.sessionId,'Profiler.stop');profiles.push({asset:entry.asset,profile:result.profile});await send(entry.sessionId,'Profiler.disable')}catch(error){errors.push(error.message)}
  }}finally{off();for(const job of pending.values()){clearTimeout(job.timer);job.reject(Error('Diagnostic closed'))}pending.clear();try{await cdp.send('Target.setAutoAttach',{autoAttach:false,waitForDebuggerOnStart:false,flatten:false})}catch(error){errors.push(error.message)}}
  return{profiles,errors,qualification:'Worker CPU profiler is diagnostic only, not clean startup/latency acceptance; names/locations/timing only.'};
 }};
}
