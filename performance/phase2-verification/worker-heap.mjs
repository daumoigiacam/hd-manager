export async function readWorkerHeaps(cdp){
 const result={targets:[],errors:[],status:'NOT_VERIFIED'};
 const owned=t=>t.type==='worker'&&(t.url.startsWith('https://localhost/')||t.url.startsWith('blob:https://localhost/'));
 let info;try{info=await cdp.send('Target.getTargets')}catch(error){result.errors.push(error.message);return result}
 let targets=info.targetInfos.filter(owned),automatic=false,discovery;
 const sessions=new Map();
 // Chromium 74 omits dedicated workers from getTargets even while they run.
 // Auto-attach announces existing children. Never pause their execution; own
 // this diagnostic session for this read only and disable it on every exit.
 if(!targets.length){
  discovery=cdp.onEvent(event=>{if(event.method==='Target.attachedToTarget'&&owned(event.params.targetInfo)&&!sessions.has(event.params.targetInfo.targetId)&&targets.length<16){
   sessions.set(event.params.targetInfo.targetId,event.params.sessionId);targets.push(event.params.targetInfo);
  }});
  try{automatic=true;await cdp.send('Target.setAutoAttach',{autoAttach:true,waitForDebuggerOnStart:false,flatten:false});await new Promise(r=>setTimeout(r,100))}
  catch(error){result.errors.push('Legacy target discovery: '+error.message)}
 }
 try{for(const target of targets){
  let sessionId,off,timer;
  try{
   sessionId=sessions.get(target.targetId)||(await cdp.send('Target.attachToTarget',{targetId:target.targetId,flatten:false})).sessionId;
   const value=await new Promise((resolve,reject)=>{
    timer=setTimeout(()=>reject(Error('Worker heap read timeout')),3000);
    off=cdp.onEvent(event=>{if(event.method!=='Target.receivedMessageFromTarget'||event.params.sessionId!==sessionId)return;
     const message=JSON.parse(event.params.message);if(message.id!==9001)return;message.error?reject(Error(JSON.stringify(message.error))):resolve(message.result)});
    cdp.send('Target.sendMessageToTarget',{sessionId,message:JSON.stringify({id:9001,method:'Runtime.getHeapUsage'})}).catch(reject);
   });
   result.targets.push({targetId:target.targetId,asset:target.url.split('/').at(-1),...value});
  }catch(error){result.errors.push({targetId:target.targetId,error:error.message})}
  finally{clearTimeout(timer);off?.();if(sessionId&&!automatic)try{await cdp.send('Target.detachFromTarget',{sessionId})}catch{/* already ended */}}
 }}finally{discovery?.();if(automatic)try{await cdp.send('Target.setAutoAttach',{autoAttach:false,waitForDebuggerOnStart:false,flatten:false})}catch(error){result.errors.push('Legacy detach: '+error.message)}}
 result.status=result.targets.length?'OBSERVED_TARGETS_ONLY':'NO_ELIGIBLE_WORKER_TARGETS_NOT_VERIFIED';
 return result;
}
