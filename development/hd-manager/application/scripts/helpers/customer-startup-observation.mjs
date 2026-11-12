// Customer portal has no employee main[data-hd-module] source contract. Observe
// its actual catalog and financial readiness independently; never set either.
export function armCustomerStartupObservation(expected) {
 if(window.__upgradeCustomerStartupStop)window.__upgradeCustomerStartupStop();
 var state=window.__upgradeCustomerStartup={revision:'customer-current-financial-ui-v1',shellMs:null,interactiveMs:null,dataReadyMs:null,financial:null};
 var queued=false,stopped=false,timer,deadline=performance.now()+60000,observer;
 function stop(){if(stopped)return;stopped=true;clearTimeout(timer);observer.disconnect();window.__upgradeCustomerStartupStop=null}
 function snapshot(){
  var root=document.querySelector('.customer-portal-shell'),main=root&&root.querySelector('.customer-portal-main');
  if(!root||!main||!root.getClientRects().length)return null;
  function value(label){var p=Array.from(main.querySelectorAll('p')).find(function(p){return p.textContent.trim()===label});return p&&p.nextElementSibling?p.nextElementSibling.textContent.trim():null}
  return{shell:true,interactive:root.querySelectorAll('.customer-portal-nav button:not([disabled])').length>=2&&!main.querySelector('[data-hd-customer-bootstrap-status]'),financialReady:root.getAttribute('data-hd-customer-financial-source')==='ready'&&!main.querySelector('[aria-busy="true"]'),debt:value('Công nợ'),paid:value('Đã thanh toán')};
 }
 window.__upgradeCustomerStartupPromise=new Promise(function(resolve,reject){
  function check(){
   if(stopped||queued)return;
   if(performance.now()>deadline){stop();reject(Error('Customer startup observation deadline'));return}
   var clock=window.__upgradeLoginClock;
   if(!clock||!Number.isFinite(clock.intentAt)||!/^trusted-login-window-/.test(clock.anchor||'')||clock.identityCount!==1){clearTimeout(timer);timer=setTimeout(check,100);return}
   var before=snapshot();if(!before){clearTimeout(timer);timer=setTimeout(check,100);return}
   queued=true;requestAnimationFrame(function(){requestAnimationFrame(function(){
    queued=false;if(stopped)return;var current=snapshot();
    if(current&&JSON.stringify(current)===JSON.stringify(before)){
     var ms=performance.now()-clock.intentAt;
     if(state.shellMs===null)state.shellMs=ms;
     if(current.interactive&&state.interactiveMs===null)state.interactiveMs=ms;
     if(current.interactive&&current.financialReady){
      function money(value){var text=String(value||'').replace(/[^\d-]/g,'');return text?Number(text):NaN}
      if(money(current.debt)!==expected.debt||money(current.paid)!==expected.paid){state.financial=current;stop();reject(Error('Customer financial ready state failed exact oracle'));return}
      state.dataReadyMs=ms;state.financial={debt:current.debt,paid:current.paid};stop();resolve(state);return;
     }
    }
    clearTimeout(timer);timer=setTimeout(check,100);
   })});
  }
  observer=new MutationObserver(check);observer.observe(document.documentElement,{subtree:true,childList:true,attributes:true,characterData:true});
  window.__upgradeCustomerStartupStop=stop;check();
 });window.__upgradeCustomerStartupPromise.catch(function(){});
}
