// Diagnostic injection into the owned fictional APK only; not a shipping engine.
export function installTwoLaneWorkerPilot(createProxy,createAdmission,options){
 options=options||{};
 if(!window.__hdVerification||!window.__hdVerification.fixtureOnly)throw Error('Fictional APK required');
 var initialConcurrency=options.initialConcurrency===4?4:2;
 var Original=window.Worker,proxies=[],meta={proxies:0,childWorkers:0,errors:0,fallbacks:0,initialConcurrency:initialConcurrency,peakInitialActive:0};
 function PilotWorker(){
  var args=Array.prototype.slice.call(arguments),url=String(args[0]);
  if(url.indexOf('/firestoreReadWorker-')<0)return Reflect.construct(Original,args);
  meta.proxies++;
  var owner=createAdmission({concurrency:initialConcurrency,maxPending:16});
  function peak(){meta.peakInitialActive=Math.max(meta.peakInitialActive,owner.getSnapshot().active)}
  var admission={enqueue:function(){var value=owner.enqueue.apply(owner,arguments);peak();return value},settle:function(){var value=owner.settle.apply(owner,arguments);peak();return value},getSnapshot:owner.getSnapshot,close:owner.close};
  var proxy=createProxy({createWorker:function(){meta.childWorkers++;return Reflect.construct(Original,args)},initialAdmission:admission,expenseLane:options.expenseLane===1?1:0,initialConcurrency:initialConcurrency});
  proxy.addEventListener('error',function(){meta.errors++});
  proxy.addEventListener('message',function(event){if(event.data&&['fallback','init-failed','auth-invalid','data-error'].indexOf(event.data.type)!==-1)meta.fallbacks++});
  proxies.push(proxy);return proxy;
 }
 PilotWorker.prototype=Original.prototype;Object.setPrototypeOf(PilotWorker,Original);window.Worker=PilotWorker;
 window.__upgradeTwoLanePilot={read:function(){return JSON.parse(JSON.stringify(meta))},restore:function(){if(window.Worker===PilotWorker)window.Worker=Original;proxies.forEach(function(p){p.terminate()});proxies.length=0}};
}
