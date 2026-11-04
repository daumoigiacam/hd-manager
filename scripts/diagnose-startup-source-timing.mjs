import {mkdir,writeFile} from 'node:fs/promises';
import {connectAndroidWebView} from './helpers/android-webview-cdp.mjs';
const output=process.env.HD_STARTUP_SOURCE_OUTPUT;
const mode=process.argv[2]||'reload';if(!['reload','arm','collect'].includes(mode))throw Error('Use reload, arm, or collect.');
if(!output?.startsWith('test-results/'))throw Error('A local output is required.');
await mkdir(output,{recursive:true});
const c=await connectAndroidWebView({adb:'D:/HD-DEV/android/sdk/platform-tools/adb.exe',serial:'emulator-5554',packageName:'com.hdmanager.app.acceptance',enableRuntime:false});
let registration;
try{
 const source=`(function(){
  if(window.__hdSourceTiming)window.__hdSourceTiming.restore();
  var NativeWorker=window.Worker,originalFetch=window.fetch,streams={},jsonJobs=[],rest=[],workers=[],confirmedAt={},shellAt=null,started=performance.timeOrigin,workerRestorers=[];
  var previousPhaseFlag=window.__HD_SOURCE_PHASE_TIMING__,publicationPhases=[],projectionPhases=[];
  window.__HD_SOURCE_PHASE_TIMING__=true;
  function phaseEvent(event){var e=event.detail,d=e&&e.detail;
   if(e&&e.name==='projection.personal_home.phase'&&d&&projectionPhases.length<256){
    var phase={at:e.atEpochMs-started,run:d.run,phase:d.phase};
    ['durationMs','calculationMs','rows','chunks'].forEach(function(key){if(typeof d[key]==='number')phase[key]=d[key]});projectionPhases.push(phase);return;
   }
   if(!e||e.name!=='data.source.phase'||!d||publicationPhases.length>=2048)return;
   publicationPhases.push({collection:d.collection,phase:d.phase,at:e.atEpochMs-started,durationMs:typeof d.durationMs==='number'?d.durationMs:null});
  }
  window.addEventListener('hd-startup-event',phaseEvent);
  var safeName=function(value){return typeof value==='string'&&/^[A-Za-z_]+$/.test(value)?value:'unknown'};
  window.Worker=new Proxy(NativeWorker,{construct:function(target,args){
   var w=Reflect.construct(target,args),index=workers.length,label=/firestoreReadWorker/.test(String(args[0]))?'firestore':/jsonParseWorker/.test(String(args[0]))?'rest-json':'other';
   workers.push({index:index,kind:label});var original=w.postMessage;
   var wrappedPost=function(message){
    if(label==='firestore'&&message&&message.type==='subscribe')streams[index+':'+message.streamId]={collection:safeName(message.collectionName),subscribeAt:performance.now(),chunks:0,rows:0,acks:0};
    if(label==='firestore'&&message&&message.type==='ack'){var row=streams[index+':'+message.streamId];if(row)row.acks++}
    return original.apply(this,arguments);
   };w.postMessage=wrappedPost;
   var jobs={};
   var receive=function(event){var m=event.data;if(!m)return;var now=performance.now();
    if(label==='firestore'){var row=streams[index+':'+m.streamId];if(!row)return;
     if(m.type==='source-started'&&row.startedAt===undefined)row.startedAt=now;
     if(m.type==='begin'&&row.beginAt===undefined){row.beginAt=now;row.expectedRows=m.count;row.mode=m.mode}
     if(m.type==='chunk'){row.chunks++;row.rows+=Array.isArray(m.rows)?m.rows.length:0}
     if(m.type==='complete'&&row.completeAt===undefined)row.completeAt=now;
     if(m.type==='fallback'||m.type==='data-error')row.failure=true;
    }else if(label==='rest-json'){
     if(m.type==='parsed-json-start'){jobs[m.id]={beginAt:now,expectedRows:m.count,chunks:0,rows:0};jsonJobs.push(jobs[m.id])}
     var job=jobs[m.id];if(!job)return;
     if(m.type==='parsed-json-chunk'){job.chunks++;job.rows+=Array.isArray(m.rows)?m.rows.length:0}
     if(m.type==='parsed-json-complete'){job.completeAt=now;delete jobs[m.id]}
    }
   };w.addEventListener('message',receive);
   workerRestorers.push(function(){w.removeEventListener('message',receive);if(w.postMessage===wrappedPost)w.postMessage=original});return w;
  }});
  window.fetch=function(input,options){var entry=null;
   if(typeof input==='string'&&/firestore.googleapis.com\\/v1\\//.test(input)&&/:runQuery(?:\\?|$)/.test(input)){
    try{var body=JSON.parse(options&&options.body||'{}');entry={collection:safeName(body.structuredQuery&&body.structuredQuery.from&&body.structuredQuery.from[0]&&body.structuredQuery.from[0].collectionId),startAt:performance.now()};rest.push(entry)}catch(e){}
   }
   return originalFetch.apply(this,arguments).then(function(response){if(entry){entry.headersAt=performance.now();entry.status=response.status}return response},function(error){if(entry)entry.failed=true;throw error});
  };
  var timer=setInterval(function(){var main=document.querySelector('main[data-hd-module]');if(!main)return;if(shellAt===null)shellAt=performance.now();
   var key=Object.keys(main).find(function(k){return k.indexOf('__reactFiber$')===0}),fiber=key&&main[key];
   for(var d=0;fiber&&d<100;d++,fiber=fiber.return){var props=fiber.memoizedProps;if(props&&props.serverConfirmedCollectionState){var flags=props.serverConfirmedCollectionState.collections||{};Object.keys(flags).forEach(function(name){if(flags[name]===true&&confirmedAt[name]===undefined)confirmedAt[name]=performance.now()});break}}
  },50);
  window.__hdSourceTiming={read:function(){return {origin:started,elapsedMs:performance.now(),shellAt:shellAt,streams:Object.keys(streams).map(function(k){return streams[k]}),jsonJobs:jsonJobs,rest:rest,confirmedAt:confirmedAt,publicationPhases:publicationPhases,projectionPhases:projectionPhases}},restore:function(){clearInterval(timer);workerRestorers.splice(0).forEach(function(restore){restore()});window.Worker=NativeWorker;window.fetch=originalFetch;window.removeEventListener('hd-startup-event',phaseEvent);if(previousPhaseFlag===undefined)delete window.__HD_SOURCE_PHASE_TIMING__;else window.__HD_SOURCE_PHASE_TIMING__=previousPhaseFlag;delete window.__hdSourceTiming}};
 })()`;
 if(mode==='reload'){
  await c.send('Page.enable');registration=(await c.send('Page.addScriptToEvaluateOnNewDocument',{source})).identifier;
  await c.send('Page.reload',{ignoreCache:false});
 }else if(mode==='arm'){
  if(!await c.evaluate('!!document.querySelector("input[type=tel]")'))throw Error('Runtime arm requires the login screen.');
  await c.evaluate(source);
 }
 console.log('SOURCE_TIMING_ARMED');
 if(mode==='arm'){
  await writeFile(output+'/armed.json',JSON.stringify({at:new Date().toISOString(),mode,scope:'Runtime source timing armed before the next manually authenticated login; no page reload or credentials collected.'},null,2));
 }else{
 const until=Date.now()+(mode==='collect'?240000:90000);let result;
 do{await new Promise(resolve=>setTimeout(resolve,500));result=await c.evaluate('window.__hdSourceTiming&&window.__hdSourceTiming.read()');
  if(result&&Object.keys(result.confirmedAt).length>=15&&result.shellAt!==null&&result.elapsedMs-result.shellAt>45000)break;
 }while(Date.now()<until);
 if(!result)throw Error('Source timing context unavailable.');
 await writeFile(output+'/result.json',JSON.stringify({at:new Date().toISOString(),...result,
  mode,scope:'Instrumented source transfer diagnostic. Runtime arm/collect observes the next manual login without reloading. Reload mode is same-process restoration. Collection names, transfer counts, timings/status only. No document values, URLs, request headers, tokens, user identifiers or credentials exported. Wrapper preserves original worker/fetch results and errors. Not clean acceptance or cold-process login.'},null,2));
 console.log(JSON.stringify({shellAt:result.shellAt,streams:result.streams,restPages:result.rest.length,jsonChunks:result.jsonJobs.reduce((n,j)=>n+j.chunks,0),confirmedAt:result.confirmedAt}));
 }
}finally{
 if(registration)try{await c.send('Page.removeScriptToEvaluateOnNewDocument',{identifier:registration})}catch{}
 if(mode!=='arm')try{await c.evaluate('window.__hdSourceTiming&&window.__hdSourceTiming.restore()')}catch{}
 c.close();
}
