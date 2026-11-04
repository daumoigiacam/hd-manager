(function(){
 if(location.hostname!=='localhost'&&location.hostname!=='127.0.0.1')throw Error('Verification probe requires isolated local origin');
 var s=window.__hdVerification={started:performance.now(),errors:[],rejections:0,longTasks:[],longTaskTotal:0,maxTaskMs:0,
  workersCreated:0,workersTerminated:0,workerCounters:{},networkBlocked:0,inputs:[],frames:[],stages:[],fixtureOnly:true};
 var nativeTelemetryEnabled=false;
 s.nativeTelemetryCounts={};s.nativeTelemetryCalls=0;
 s.setNativeTelemetryEnabled=function(enabled){nativeTelemetryEnabled=enabled===true;};
 function report(value){
  s.nativeTelemetryCounts[value.kind]=(s.nativeTelemetryCounts[value.kind]||0)+1;
  if(value.kind==='readiness')s.lastReadiness=value;
  if(value.kind==='heartbeat')s.lastHeartbeat=value;
  // Synchronous Java logging perturbs legacy WebView frame timing. Keep all
  // JS counters/errors/long tasks and the once-per-login native-ready anchor.
  // High-frequency bridge output is opt-in for overhead calibration only.
  if(nativeTelemetryEnabled&&window.HDVerification){s.nativeTelemetryCalls++;HDVerification.report(JSON.stringify(value));}
 }
 function allowed(url){try{var u=new URL(String(url),location.href);return u.origin===location.origin||u.hostname==='127.0.0.1'&&[8185,9199,5002].indexOf(Number(u.port))>=0||['data:','blob:'].indexOf(u.protocol)>=0}catch(e){return false}}
 var fetchOriginal=window.fetch;window.fetch=function(url,options){if(!allowed(url&&url.url||url)){s.networkBlocked++;return Promise.reject(Error('Fixture blocks external network'))}return fetchOriginal.call(this,url,options)};
 var open=XMLHttpRequest.prototype.open;XMLHttpRequest.prototype.open=function(method,url){if(!allowed(url)){s.networkBlocked++;throw Error('Fixture blocks external XHR')}return open.apply(this,arguments)};
 window.addEventListener('error',function(e){if(s.errors.length<50)s.errors.push(String(e.message))});
 window.addEventListener('unhandledrejection',function(){s.rejections++});
 window.addEventListener('hd-startup-event',function(e){s.stages.push({name:e.detail.name,at:performance.now()});if(s.stages.length>150)s.stages.shift()});
 var lastModule=null,readinessSent=false,lastReady=false,shellSeen=false,interactivePending=false,loginEpoch=0,nativeReadyValue=null,nativeReadySent=false;
 function deliverNativeReady(){if(nativeReadyValue&&!nativeReadySent&&window.HDVerification){try{HDVerification.homeDataReady(JSON.stringify(nativeReadyValue));nativeReadySent=true}catch(error){s.nativeDeliveryErrors=(s.nativeDeliveryErrors||0)+1}}}
 window.addEventListener('hd-startup-event',function(e){if(e.detail.name==='auth.identity_login.started'){loginEpoch++;s.identityRequestAt=performance.now();var intent=s.pendingLoginIntent;s.pendingLoginIntent=null;s.loginStart=intent?intent.at:s.identityRequestAt;s.loginAnchor=intent?intent.anchor:'identity-request-start';readinessSent=false;nativeReadyValue=null;nativeReadySent=false;shellSeen=false;interactivePending=false;s.homeShellMs=null;s.homeInteractiveMs=null;s.homeDataReadyMs=null}});
 var readinessPollingEnabled=true;
 s.setReadinessPollingEnabled=function(enabled){readinessPollingEnabled=enabled!==false;};
 setInterval(function(){
  if(!readinessPollingEnabled){deliverNativeReady();return;}
  var main=document.querySelector('main[data-hd-module]'),module=main&&main.getAttribute('data-hd-module');
  if(main&&!shellSeen){shellSeen=true;s.homeShellMs=performance.now()-(s.loginStart||0);report({kind:'home-shell',ms:s.homeShellMs,anchor:s.loginAnchor||'navigation-start'})}
  // Separate a usable shell from complete financial/source projections. This
  // criterion is explicit, not a substitute for measured input feedback.
  var actions=Array.prototype.filter.call(document.querySelectorAll('.hd-bottom-navigation button'),function(button){return !button.disabled&&button.getClientRects().length>0});
  if(module==='home'&&actions.length>=2&&s.homeInteractiveMs==null&&!interactivePending){
   interactivePending=true;var epoch=loginEpoch;
   requestAnimationFrame(function(){requestAnimationFrame(function(){
    interactivePending=false;var current=document.querySelector('main[data-hd-module="home"]');
    if(epoch===loginEpoch&&current&&current.getClientRects().length){s.homeInteractiveMs=performance.now()-(s.loginStart||0);report({kind:'home-interactive',ms:s.homeInteractiveMs,criterion:'visible Home and enabled bottom navigation after two animation frames',anchor:s.loginAnchor||'navigation-start'})}
   })});
  }
  var contract=main&&window.__hdSourceContract(main,module,window.__hdPlans),ready=Boolean(contract&&contract.sourcesReady&&!window.__hdModulePending(main));
  if(module!==lastModule||ready!==lastReady){lastModule=module;lastReady=ready;report({kind:'readiness',module:module,homeDataReady:ready,sourceContract:contract,pending:main?window.__hdModulePending(main):true})}
  if(module==='home'&&ready&&!readinessSent){readinessSent=true;var readyEpoch=loginEpoch;requestAnimationFrame(function(){requestAnimationFrame(function(){
   if(readyEpoch!==loginEpoch)return;
   var current=document.querySelector('main[data-hd-module]');
   if(!current||current.getAttribute('data-hd-module')!=='home'||!window.__hdSourceContract(current,'home',window.__hdPlans).sourcesReady||window.__hdModulePending(current)){readinessSent=false;return}
   s.homeDataReadyMs=performance.now()-(s.loginStart||0);nativeReadyValue={kind:'home-data-ready',homeDataReady:true,ms:s.homeDataReadyMs,homeShellMs:s.homeShellMs,homeInteractiveMs:s.homeInteractiveMs,anchor:s.loginAnchor||'navigation-start'};report(nativeReadyValue);deliverNativeReady();
  })})}
  // BridgeActivity can attach JavascriptInterface after an already-warm page
  // reaches Home. Retry delivery, preserving the ORIGINAL observed paint time.
  deliverNativeReady();
 },100);
 s.workerTransfer={sentAcks:0,received:Object.create(null),perCollection:Object.create(null),activeStreams:0};
 var WorkerOriginal=window.Worker;
 if(WorkerOriginal){function CountedWorker(){var worker=Reflect.construct(WorkerOriginal,Array.prototype.slice.call(arguments)),id=++s.workersCreated,terminated=false,terminate=worker.terminate;
  var postMessage=worker.postMessage,streams=new Map();
  function forgetStreams(){s.workerTransfer.activeStreams-=streams.size;streams.clear()}
  worker.postMessage=function(message){
   if(message&&message.type==='subscribe'&&typeof message.streamId==='string'&&typeof message.collectionName==='string'&&/^[A-Za-z][A-Za-z_]{0,63}$/.test(message.collectionName)&&!streams.has(message.streamId)&&streams.size<128){
    streams.set(message.streamId,message.collectionName);s.workerTransfer.activeStreams++;
   }else if(message&&message.type==='unsubscribe'&&streams.has(message.streamId)){streams.delete(message.streamId);s.workerTransfer.activeStreams--;}
   else if(message&&message.type==='close')forgetStreams();
   else if(message&&message.type==='ack'&&streams.has(message.streamId))s.workerTransfer.sentAcks++;
   return postMessage.apply(worker,arguments);
  };
  worker.addEventListener('message',function(e){
   var packet=e.data,collection=packet&&streams.get(packet.streamId);
   if(!collection||['begin','chunk','complete','cache','data-error'].indexOf(packet.type)===-1)return;
   var totals=s.workerTransfer,counts=totals.perCollection[collection];
   if(!counts){if(Object.keys(totals.perCollection).length>=128)return;counts=totals.perCollection[collection]={packets:0,chunks:0,rows:0,maxChunkRows:0};}
   totals.received[packet.type]=(totals.received[packet.type]||0)+1;counts.packets++;
   if(packet.type==='chunk'&&Array.isArray(packet.rows)){counts.chunks++;counts.rows+=packet.rows.length;counts.maxChunkRows=Math.max(counts.maxChunkRows,packet.rows.length);}
  });
  worker.addEventListener('message',function(e){if(e.data&&e.data.type==='__hdVerificationWorkerCounters')s.workerCounters[id]=e.data.counters});
  worker.terminate=function(){if(!terminated){terminated=true;s.workersTerminated++;delete s.workerCounters[id];forgetStreams()}return terminate.apply(worker,arguments)};return worker;}
  CountedWorker.prototype=WorkerOriginal.prototype;Object.setPrototypeOf(CountedWorker,WorkerOriginal);window.Worker=CountedWorker;}
 try{new PerformanceObserver(function(list){list.getEntries().forEach(function(e){s.longTaskTotal++;s.maxTaskMs=Math.max(s.maxTaskMs,e.duration);s.longTasks.push({start:e.startTime,duration:e.duration});if(s.longTasks.length>300)s.longTasks.shift();if(e.duration>=100)report({kind:'long-task',start:e.startTime,duration:e.duration,module:document.querySelector('main[data-hd-module]')&&document.querySelector('main[data-hd-module]').getAttribute('data-hd-module')});})}).observe({entryTypes:['longtask']})}catch(e){s.longTaskUnsupported=true}
 var pointer;
 document.addEventListener('pointerdown',function(e){s.pendingLoginIntent=null;pointer={at:performance.now(),trusted:e.isTrusted,tag:e.target.tagName}},true);
 document.addEventListener('click',function(click){var button=click.target&&typeof click.target.closest==='function'?click.target.closest('button'):null;if(click.isTrusted&&button&&button.textContent.trim()==='Vào Ứng Dụng'){s.pendingLoginIntent={at:pointer&&pointer.trusted?pointer.at:performance.now(),anchor:pointer&&pointer.trusted?'trusted-login-pointerdown':'trusted-login-click'}}if(!pointer)return;var event=pointer;pointer=null;requestAnimationFrame(function(){requestAnimationFrame(function(){var row={start:event.at,feedbackMs:performance.now()-event.at,trusted:event.trusted,tag:event.tag};s.frames.push(row);if(s.frames.length>100)s.frames.shift();report({kind:'input-feedback',value:row})})})},true);
 document.addEventListener('input',function(e){s.pendingLoginIntent=null;var at=performance.now(),trusted=e.isTrusted;requestAnimationFrame(function(){requestAnimationFrame(function(){s.inputs.push({feedbackMs:performance.now()-at,trusted:trusted});if(s.inputs.length>100)s.inputs.shift()})})},true);
 setInterval(function(){var main=document.querySelector('main[data-hd-module]'),heap=performance.memory;
  report({kind:'heartbeat',at:performance.now(),module:main&&main.getAttribute('data-hd-module'),nodes:document.getElementsByTagName('*').length,
   jsHeapReportedBytes:heap?heap.usedJSHeapSize:null,sdkListeners:window.__hdSdkListenerCounters||null,workerCounters:s.workerCounters,
   workersCreated:s.workersCreated,workersExplicitlyTerminated:s.workersTerminated,unTerminatedWorkerHandles:s.workersCreated-s.workersTerminated,
   longTasks:s.longTaskTotal,maxTaskMs:s.maxTaskMs,errors:s.errors.length,rejections:s.rejections,blockedExternalRequests:s.networkBlocked});
 },15000);
})();
