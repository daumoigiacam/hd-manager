// Core supplies its EXISTING DB, session, secure authorizer, shared Outbox and
// authenticated transport. Defining the getter performs no import, DB or I/O.
export function createMessagingRuntime(options){
 let pending=null,disposed=false;
 return Object.assign(function messagingRepository(){
  if(disposed||!options.session.isCurrent())return Promise.reject(Object.assign(Error('Messaging owner closed'),{code:'permission-denied'}));
  if(!pending)pending=import('./offlineMessagingRepository.js').then(async({createOfflineMessagingRepository})=>{
   const listeners=new Set();let stopped=false,active=null,timer=null,controller=null,sequence=0;
   let state=Object.freeze({state:'IDLE',error:null});
   const publish=()=>{options.changed?.('messages');for(const fn of [...listeners]){try{fn();}catch{}}};
   const status=(value,error=null)=>{state=Object.freeze({state:value,error:error?{code:error.code||'unavailable',message:error.message}:null});publish();};
   const current=()=>!disposed&&!stopped&&options.session.isCurrent();
   const online=options.online||(()=>globalThis.navigator?.onLine!==false);
   const document=options.document??globalThis.document;
   const schedule=options.schedule||setTimeout,cancel=options.cancel||clearTimeout;
   const repository=await createOfflineMessagingRepository({...options,onChange:publish,onQueued:()=>options.notifyConnectivity()});
   if(!current()){repository.close();throw Object.assign(Error('Messaging owner changed during open'),{code:'permission-denied'});}
   function cancelWork(){sequence++;controller?.abort();controller=null;if(timer!==null)cancel(timer);timer=null;}
   async function refresh(request,{more=false}={}){
    if(!current())throw Object.assign(Error('Messaging owner closed'),{code:'permission-denied'});
    if(!online())throw Object.assign(Error('Messaging device is offline'),{code:'network-error'});
    const localController=new AbortController(),ticket=sequence;
    controller?.abort();controller=localController;
    const queryKey=request.family+':'+(request.conversationId||'');
    let cursor=null;
    if(more){const checkpoint=await repository.checkpoint();cursor=checkpoint.cursors[queryKey];if(!cursor)return false;}
    status('REFRESHING');
    try{
     const page=await options.transport.page({...request,queryKey,cursor,limit:40},localController.signal,options.session.scope);
     if(!current()||ticket!==sequence||localController.signal.aborted)return false;
     await repository.ingestPage(page);status('LOCAL_READY');return true;
    }catch(error){if(!localController.signal.aborted&&current())status(['permission-denied','source-unavailable','invalid-argument'].includes(error.code)?'BLOCKED':'OFFLINE',error);throw error;}
    finally{if(controller===localController)controller=null;}
   }
   function activate(request){
    if(!current())throw Object.assign(Error('Messaging owner closed'),{code:'permission-denied'});
    cancelWork();const owner={request};active=owner;
    const visible=()=>current()&&active===owner&&document?.visibilityState!=='hidden'&&online();
    const run=async()=>{
     if(!visible())return;
     const ticket=sequence;
     try{
      let checkpoint;try{checkpoint=await repository.checkpoint();}catch(error){if(error.code!=='source-unavailable')throw error;}
      if(!owner.initialized){await refresh(request);owner.initialized=true;}
      if(!visible()||ticket!==sequence)return;
      checkpoint=await repository.checkpoint();
      const call=new AbortController();controller=call;
      const page=await options.transport.delta({...request,generation:checkpoint.generation,checkpoint:checkpoint.checkpoint,limit:100,waitMs:20000},call.signal,options.session.scope);
      if(!visible()||ticket!==sequence||call.signal.aborted)return;
      await repository.ingestPage(page);status('LOCAL_READY');
      if(visible())timer=schedule(()=>{timer=null;void run();},0);
     }catch(error){
      if(!visible()||ticket!==sequence||error.name==='AbortError')return;
      const blocked=['permission-denied','unauthenticated','source-unavailable','invalid-argument'].includes(error.code);
      status(blocked?'BLOCKED':'OFFLINE',error);
      if(!blocked&&visible())timer=schedule(()=>{timer=null;void run();},3000);
     }finally{if(ticket===sequence)controller=null;}
    };
    const visibility=()=>{cancelWork();if(visible())void run();};
    document?.addEventListener('visibilitychange',visibility);
    options.events?.addEventListener?.('online',visibility);
    void run();
    return()=>{if(active!==owner)return;active=null;cancelWork();document?.removeEventListener('visibilitychange',visibility);options.events?.removeEventListener?.('online',visibility);};
   }
   let releaseSession=()=>{};
   const close=()=>{if(stopped)return;stopped=true;active?.release?.();active=null;cancelWork();releaseSession();listeners.clear();repository.close();};
   // Keep the actual effect cleanup, including visibility/online listeners.
   const activateOwned=request=>{active?.release?.();const release=activate(request);if(active)active.release=release;return release;};
   releaseSession=options.session.subscribe(()=>{if(!options.session.isCurrent())close();});
   return Object.freeze({...repository,activate:activateOwned,refresh,status:()=>state,subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn);},close});
  }).catch(error=>{pending=null;throw error;});
  return pending;
 },{async close(){disposed=true;if(pending){try{(await pending).close();}catch{}}}});
}
