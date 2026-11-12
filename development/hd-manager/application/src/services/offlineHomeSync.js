export function createOfflineHomeSync({repository,transport,scope,isCurrent,online,onChange,onFatal}){
 let running=null,stopped=false,timer=null,controller=null,worker=null,workerGeneration=null,workerSeq=-1,attempts=0,lastNotify=0,cancelCalculation=null,sourceChanged=false;
 const resetWorker=()=>{worker?.terminate();worker=null;workerGeneration=null;workerSeq=-1;};
 let status=Object.freeze({state:'LOCAL_READY',applied:0,target:0});
 const publish=value=>{const old=status.state;status=Object.freeze({...status,...value});if(old!==status.state||Date.now()-lastNotify>=250){lastNotify=Date.now();onChange('home-status');}};
 const arm=delay=>{clearTimeout(timer);if(!stopped&&isCurrent())timer=setTimeout(()=>void sync().catch(()=>{}),delay);};
 async function calculate(feed,head,reuse){
  if(!reuse){resetWorker();worker=new Worker(new URL('./companyHomeWorker.js',import.meta.url));}
  let finish,fail;
  const completion=new Promise((resolve,reject)=>{finish=resolve;fail=reject;});
  // Install handlers before loading source batches: a worker module-load error
  // must not disappear while the SQLite stream is still being prepared.
  completion.catch(()=>{});
  const timeout=setTimeout(()=>fail(Error('Home calculation timed out')),120000);
  cancelCalculation=()=>{clearTimeout(timeout);fail(Error('Home calculation cancelled'));};
  worker.onmessage=event=>{clearTimeout(timeout);event.data.error?fail(Error(event.data.error)):finish(event.data.result);};
  worker.onerror=event=>{clearTimeout(timeout);fail(Error(event.message));};
  try{
  if(!reuse){worker.postMessage({type:'reset'});const send=(source,rows)=>{if(stopped||!isCurrent())throw Error('Home session closed');worker.postMessage({type:'source',source,rows});};if(feed.streamPackedSources){for(const source of head.sources)send(source,[]);await feed.streamPackedSources(head,packet=>{if(stopped||!isCurrent())throw Error('Home session closed');worker.postMessage({type:'packed',packet});});}else if(feed.streamAllSources)await feed.streamAllSources(head,send);else for(const source of head.sources)await feed.streamSource(head,source,rows=>send(source,rows));}
   worker.postMessage({type:'finish',id:1,tenantId:scope.tenantId,asOfDay:head.asOfDay});
   const result=await completion;if(result.retained){workerGeneration=head.generation;workerSeq=head.seq;}else resetWorker();return result;
  }finally{clearTimeout(timeout);}
 }
 function sync(){
  if(running)return running;if(stopped||!isCurrent()||!online())return Promise.resolve();
  running=(async()=>{
   controller=new AbortController();publish({state:'SYNCING',error:null});
   const head=await transport.homeHead(controller.signal,scope),feed=await repository.feed();let saved=await feed.checkpoint(head);
   const reuse=Boolean(worker&&workerGeneration===head.generation&&workerSeq===saved.applied_seq);
   if(!reuse)resetWorker();
   publish({applied:saved.applied_seq,target:head.seq});
   while(saved.applied_seq<head.seq){
    if(stopped||!isCurrent()||!online())throw Object.assign(Error('Home network unavailable'),{code:'network-error'});
    const page=await transport.homePage({generation:head.generation,after:saved.applied_seq,target:head.seq,limit:100},controller.signal,scope);
    const applied=await feed.applyPage(head,page);if(reuse)worker.postMessage({type:'delta',events:page.events});saved={...saved,applied_seq:applied};publish({applied});
    await new Promise(resolve=>setTimeout(resolve,0));
   }
   if(saved.reported_seq!==head.seq||saved.reported_day!==head.asOfDay||saved.reported_manifest_matches===false){
    const result=head.sourceProfile==='native-isolation-v1'
     ?{snapshot:{kind:'native-source-inventory-v1',coverage:head.coverage,provenance:head.provenance},counts:head.counts}
     :await calculate(feed,head,reuse);
    await feed.publish(head,result);onChange('home');
   }
   attempts=0;publish({state:'SYNCED',generation:head.generation,seq:head.seq,lastConfirmedAt:Date.now()});arm(30000);
  })().catch(async error=>{
   resetWorker();
   if(stopped||!isCurrent())throw error;
   publish({state:'SYNC_FAILED',error:error.message});
   if(['permission-denied','unauthenticated'].includes(error.code))await onFatal(error);
   else if(++attempts<=5)arm(Math.min(30000,1000*2**attempts)*(0.8+Math.random()*0.4));
   throw error;
  }).finally(()=>{cancelCalculation=null;controller=null;running=null;if(sourceChanged){sourceChanged=false;arm(0);}});
  return running;
 }
 // A verified business receipt can arrive after an in-flight head was read.
 // Coalesce that demand into one follow-up on THIS owner, rather than waiting
 // for the 30-second poll or starting another worker/connection.
 function notifySourceChanged(){if(stopped||!isCurrent()||!online())return;if(running){sourceChanged=true;return;}arm(0);}
 return {sync,notifySourceChanged,status:()=>status,stop(){stopped=true;sourceChanged=false;clearTimeout(timer);controller?.abort();cancelCalculation?.();resetWorker();}};
}
