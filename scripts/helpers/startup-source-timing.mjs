// Bounded diagnostic metadata only; never stores rows, tokens, or input values.
// Self-contained ES2019 because Runtime.evaluate is not passed through Vite.
export function armStartupSourceTiming(){
 const scope=window,Original=scope.Worker,rows=[],active=new Set();
 const state=scope.__upgradeStartupSources={rows:rows,dropped:0};
 function record(row){if(rows.length<256)rows.push(Object.assign({at:performance.now()},row));else state.dropped++}
 function InstrumentedWorker(){
  const worker=Reflect.construct(Original,Array.prototype.slice.call(arguments)),streams=new Map(),post=worker.postMessage;
  function message(event){const p=event.data,name=p&&streams.get(p.streamId);if(name&&['begin','complete','cache','data-error'].indexOf(p.type)!==-1)record({collection:name,phase:p.type,count:p.count,revision:p.revision,chunks:p.chunks})}
  worker.addEventListener('message',message);
  worker.postMessage=function(packet){
   if(packet&&packet.type==='subscribe'&&typeof packet.collectionName==='string'&&/^[A-Za-z][A-Za-z_]{0,63}$/.test(packet.collectionName)&&streams.size<128){streams.set(packet.streamId,packet.collectionName);record({collection:packet.collectionName,phase:'subscribe'})}
   if(packet&&packet.type==='unsubscribe'&&streams.has(packet.streamId)){record({collection:streams.get(packet.streamId),phase:'unsubscribe'});streams.delete(packet.streamId)}
   if(packet&&packet.type==='close'){streams.forEach(function(name){record({collection:name,phase:'unsubscribe'})});streams.clear()}
   return post.apply(this,arguments);
  };
  active.add({worker:worker,post:post,message:message});return worker;
 }
 InstrumentedWorker.prototype=Original.prototype;Object.setPrototypeOf(InstrumentedWorker,Original);scope.Worker=InstrumentedWorker;
 let last=null;
 const timer=setInterval(function(){
  const main=document.querySelector('main[data-hd-module="home"]');if(!main)return;
  const c=scope.__hdSourceContract(main,'home',scope.__hdPlans),pending=scope.__hdModulePending(main),missing=c.missing||c.missingCollections||[];
  const key=JSON.stringify({ready:c.sourcesReady,pending:pending,missing:missing});
  if(key!==last){last=key;record({phase:'home-contract',sourcesReady:c.sourcesReady,pending:pending,missing:missing})}
 },100);
 scope.__upgradeStartupSourcesRestore=function(){clearInterval(timer);scope.Worker=Original;active.forEach(function(entry){entry.worker.removeEventListener('message',entry.message);entry.worker.postMessage=entry.post});active.clear();delete scope.__upgradeStartupSourcesRestore};
}
