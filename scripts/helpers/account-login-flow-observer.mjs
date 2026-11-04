// Injected into old Android WebView74: keep the body free of optional chaining.
// Only aggregate readiness/timing and normalized role names leave the page.
export function installAccountLoginFlowObserver(config) {
 if(window.__hdAccountLoginFlow)window.__hdAccountLoginFlow.stop('rearmed');
 var s={version:3,expectedAccount:config.expectedAccount,origin:performance.timeOrigin,armedEpoch:Date.now(),attempts:[],
  inputAt:null,clickAt:null,clickTrusted:false,submitEpoch:null,shellAt:null,sourceReadyAt:null,homeReadyAt:null,
  enabledActionAt:null,twoFramesAfterReadyAt:null,accountType:null,roleGroup:null,missing:config.required.slice(),
  required:config.required.slice(),firstSourceAt:{},contractMatches:null,loginStillVisible:true,roleMatches:null,endReason:null,completedEpoch:null,
  longTasks:0,longTasksOver100:0,maxLongTaskMs:null};
 var pointerAt=null,mo=null,po=null,timer=null,expiry=null,submitTimeout=null,done=false,framesScheduled=false;
 function stamp(event){var n=performance.now(),v=event.timeStamp>1e12?event.timeStamp-s.origin:event.timeStamp;
  return event.isTrusted&&isFinite(v)&&v>=0&&v<=n&&n-v<60000?v:null}
 function button(event){var t=event.target,b=t&&t.closest&&t.closest('button');return b&&/^Vào Ứng Dụng$/i.test((b.innerText||'').trim())?b:null}
 function pointer(event){if(button(event))pointerAt=stamp(event)}
 function click(event){var b=button(event);if(!b||b.disabled||!event.isTrusted)return;
  if(s.clickAt!==null){
   if(!document.querySelector('input[type=tel]'))return;
   s.attempts.push({inputAt:s.inputAt,clickAt:s.clickAt,submitEpoch:s.submitEpoch,shellAt:s.shellAt,sourceReadyAt:s.sourceReadyAt,homeReadyAt:s.homeReadyAt,
    reason:'another-trusted-submit-on-login-screen',longTasks:s.longTasks,longTasksOver100:s.longTasksOver100});
   s.shellAt=null;s.sourceReadyAt=null;s.homeReadyAt=null;s.enabledActionAt=null;s.twoFramesAfterReadyAt=null;
   s.accountType=null;s.roleGroup=null;s.roleMatches=null;s.missing=s.required.slice();s.longTasks=0;s.longTasksOver100=0;s.maxLongTaskMs=null;
   s.firstSourceAt={};s.contractMatches=null;
   framesScheduled=false;clearTimeout(submitTimeout);
  }
  s.clickAt=performance.now();s.inputAt=pointerAt!==null&&s.clickAt-pointerAt<2000?pointerAt:stamp(event);
  s.clickTrusted=true;s.submitEpoch=Date.now();submitTimeout=setTimeout(function(){stop('submit-timeout')},180000);check();}
 function stop(reason){if(done)return;done=true;s.endReason=reason;s.completedEpoch=Date.now();
  if(mo)mo.disconnect();if(po)po.disconnect();clearInterval(timer);clearTimeout(expiry);clearTimeout(submitTimeout);
  document.removeEventListener('pointerdown',pointer,true);document.removeEventListener('click',click,true);}
 function check(){if(done||s.clickAt===null)return;
  var now=performance.now(),customerMain=document.querySelector('.customer-portal-main'),staffMain=document.querySelector('main[data-hd-module="home"]');
  var main=customerMain||staffMain;s.loginStillVisible=!!document.querySelector('input[type=tel]');
  if(!main)return;
  if(s.shellAt===null)s.shellAt=now;
  var key=Object.keys(main).find(function(k){return k.indexOf('__reactFiber$')===0}),f=key&&main[key],account=null,confirmed=null;
  for(var depth=0;f&&depth<100;depth++,f=f.return){
   var p=f.memoizedProps;
   if(p&&p.currentUser&&p.currentUser.companyId)account=p.currentUser;
   if(p&&p.serverConfirmedCollectionState)confirmed=p.serverConfirmedCollectionState;
   if(p&&Array.isArray(p.homeReadinessCollections)){
    var actual=['companies','employees'].concat(p.homeReadinessCollections);
    s.contractMatches=s.required.every(function(name){return actual.indexOf(name)>=0})&&actual.every(function(name){return s.required.indexOf(name)>=0});
   }
   for(var h=f.memoizedState,i=0;h&&i<1000;h=h.next,i++){
    var v=h.memoizedState;
    if(v&&typeof v==='object'&&v.collections&&Object.prototype.hasOwnProperty.call(v,'tenantId'))confirmed=v;
   }
  }
  if(account){
   s.accountType=account.accountType==='customer'?'customer':'employee';
   s.roleGroup=s.accountType==='customer'?'customer':/^(super_admin|owner|company_owner|business_owner|admin|manager)$/.test(account.role||'')?'management':'employee';
   s.roleMatches=s.expectedAccount==='customer'?s.accountType==='customer':s.accountType==='employee'&&s.roleGroup==='employee';
  }
  var tenantMatches=!!(account&&confirmed&&confirmed.tenantId===account.companyId);
  if(tenantMatches)s.required.forEach(function(name){if(confirmed.collections[name]===true&&s.firstSourceAt[name]===undefined)s.firstSourceAt[name]=now});
  s.missing=s.required.filter(function(name){return !tenantMatches||confirmed.collections[name]!==true});
  if(!s.missing.length&&s.sourceReadyAt===null)s.sourceReadyAt=now;
  var action=document.querySelector('.customer-portal-nav button:not([disabled]),[data-hd-navigation="bottom"] button:not([disabled])');
  if(action&&s.enabledActionAt===null)s.enabledActionAt=now;
  var content=customerMain||main.querySelector('.business-report-workspace,.hd-staff-greeting-surface');
  var busy=main.closest('[aria-busy="true"]')||main.querySelector('[aria-busy="true"],[data-hd-module-loading],[data-hd-report-refreshing],[data-hd-ledger-loading]');
  if(s.sourceReadyAt!==null&&content&&!busy&&!s.loginStillVisible&&s.roleMatches===true&&s.contractMatches!==false&&!framesScheduled){
   framesScheduled=true;s.homeReadyAt=now;
   requestAnimationFrame(function(){requestAnimationFrame(function(){
    // A new busy/source state between frames invalidates the provisional mark.
    if(done)return;
    if(!main.isConnected||main.querySelector('[aria-busy="true"],[data-hd-module-loading],[data-hd-report-refreshing],[data-hd-ledger-loading]')){framesScheduled=false;s.homeReadyAt=null;return}
    s.twoFramesAfterReadyAt=performance.now();stop('home-ready-observed');
   })});
  }
 }
 try{po=new PerformanceObserver(function(list){if(done||s.clickAt===null)return;list.getEntries().forEach(function(e){
  if(e.startTime+e.duration<s.clickAt)return;s.longTasks++;if(e.duration>=100)s.longTasksOver100++;s.maxLongTaskMs=Math.max(s.maxLongTaskMs||0,e.duration);
 })});po.observe({entryTypes:['longtask']});s.longTaskSupported=true}catch(e){s.longTaskSupported=false}
 mo=new MutationObserver(check);mo.observe(document,{childList:true,subtree:true,attributes:true,attributeFilter:['aria-busy']});
 timer=setInterval(check,50);expiry=setTimeout(function(){stop('unused-arm-expiry')},1800000);
 document.addEventListener('pointerdown',pointer,true);document.addEventListener('click',click,true);
 window.__hdAccountLoginFlow={state:s,stop:stop};return {armed:true,expectedAccount:s.expectedAccount,loginVisible:!!document.querySelector('input[type=tel]')};
}
