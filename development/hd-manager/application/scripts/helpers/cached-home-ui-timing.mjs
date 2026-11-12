// ES2019, armed before a trusted Home click. Measures actual same-scope cached
// cards separately from fresh-source confirmation; neither substitutes for it.
export function armCachedHomeUiTiming(expected){
 if(window.__upgradeCachedHomeAbort)window.__upgradeCachedHomeAbort();
 window.__upgradeCachedHomePromise=new Promise(function(resolve,reject){
  var started=null,finishing=false,timer,observer,deadline=performance.now()+30000;
  function stop(){clearTimeout(timer);document.removeEventListener('pointerdown',intent,true);observer.disconnect()}
  function view(){var main=document.querySelector('main[data-hd-module=home]');if(!main||!main.getClientRects().length)return null;
   var grid=main.querySelector('.business-report-kpi-grid');if(!grid||!grid.getClientRects().length)return null;
   var values=Array.from(grid.querySelectorAll('.business-report-kpi')).map(function(e){return e.title});if(JSON.stringify(values)!==JSON.stringify(expected))return null;
   var contract=window.__hdSourceContract(main,'home',window.__hdPlans),stamp=main.querySelector('.business-report-freshness');
   var labeled=Boolean(stamp&&stamp.textContent.indexOf('Đang đối chiếu')!==-1);
   if(!contract.scopeMatches||!contract.sourcesReady&&!labeled)return null;
   return{sourcesReady:contract.sourcesReady,retainedDataLabeled:labeled,stamp:stamp?stamp.textContent:null,missingSources:contract.missing};
  }
  function check(){if(started===null||finishing)return;if(performance.now()>deadline){stop();reject(Error('Cached Home UI timeout'));return;}
   if(view()){finishing=true;requestAnimationFrame(function(){requestAnimationFrame(function(){var current=view();if(!current){finishing=false;check();return;}stop();resolve(Object.assign({ms:performance.now()-started,anchor:'trusted-home-pointerdown-to-cached-cards-two-frames'},current))})})}
   else{clearTimeout(timer);timer=setTimeout(check,10)}
  }
  function intent(event){if(started!==null||!event.isTrusted||!event.target.closest('button[aria-label="Trang chủ"]'))return;started=performance.now();deadline=started+30000;Promise.resolve().then(check)}
  observer=new MutationObserver(check);observer.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['data-hd-module','aria-busy']});document.addEventListener('pointerdown',intent,true);window.__upgradeCachedHomeAbort=stop;
 });window.__upgradeCachedHomePromise.catch(function(){});
}
