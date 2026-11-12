// Runs inside the tested WebView BEFORE the trusted event. No host round-trip
// participates in the interval. Result readiness is rechecked after two frames.
export function armUiTiming(config) {
  if(window.__upgradeArmedAbort)window.__upgradeArmedAbort();
  var started=null,firstValidAt=null,firstFrameAt=null,finishing=false,timer=null,deadline=performance.now()+30000;
  var eventName=config.kind==='search'?'input':'pointerdown';
  var expected=JSON.stringify(config.names||[]);
  if(config.kind==='search'){
    var initial=document.querySelector('main[data-hd-module=products] .hd-product-list');
    if(!initial||initial.getAttribute('data-hd-search-committed-query')===config.query)throw Error('Arm after a different committed query, never accept preexisting matching rows');
  }
  window.__upgradeArmedPromise=new Promise(function(resolve,reject){
    function stop(){observer.disconnect();clearTimeout(timer);document.removeEventListener(eventName,intent,true)}
    function valid(){
      if(started===null)return false;
      var main=document.querySelector('main[data-hd-module]');
      if(!main||main.getAttribute('data-hd-module')!==config.module||window.__hdModulePending(main))return false;
      if(config.kind==='search'){
        var list=main.querySelector('.hd-product-list'),input=document.querySelector(config.selector);
        if(!input||input.value!==config.query||!list||list.getAttribute('data-hd-search-committed-query')!==config.query||list.getAttribute('aria-busy')==='true'||list.getAttribute('data-hd-search-retained')==='true')return false;
        var names=Array.from(main.querySelectorAll('.hd-product-list__name')).map(function(e){return e.textContent.trim()});
        if(JSON.stringify(names)!==expected)return false;
      }
      return window.__hdSourceContract(main,config.module,window.__hdPlans).sourcesReady;
    }
    function check(){
      if(finishing)return;
      if(performance.now()>deadline){stop();reject(Error('Prearmed UI readiness timeout'));return;}
      if(valid()){
        if(firstValidAt===null)firstValidAt=performance.now();finishing=true;
        requestAnimationFrame(function(){firstFrameAt=performance.now();requestAnimationFrame(function(){
          if(!valid()){finishing=false;check();return;}
          var at=performance.now(),main=document.querySelector('main[data-hd-module]');stop();
          resolve({ms:at-started,intentAt:started,firstValidAt:firstValidAt,firstFrameAt:firstFrameAt,paintAt:at,domElements:main.querySelectorAll('*').length,clockRevision:'prearmed-trusted-intent-v3',exact:true});
        })});
      }else{clearTimeout(timer);timer=setTimeout(check,10);}
    }
    function intent(event){
      if(started!==null||!event.isTrusted)return;
      var target=event.target;
      if(!target||!target.closest||!target.closest(config.selector))return;
      if(config.kind==='search'&&target.value!==config.query)return;
      started=performance.now();deadline=started+30000;Promise.resolve().then(check);
    }
    var observer=new MutationObserver(check);observer.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['aria-busy','data-hd-search-committed-query','data-hd-module']});
    document.addEventListener(eventName,intent,true);window.__upgradeArmedAbort=stop;timer=setTimeout(check,100);
  });
  window.__upgradeArmedPromise.catch(function(){});
}
