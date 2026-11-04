// QA timing only, no application readiness/state writes. Keep the old 100 ms
// sampled probe alongside this event-driven clock; a clock change is NOT an
// application performance improvement. Inject before the trusted login intent.
export function armEventHomeStartupClock(selector){
 if(window.__upgradeEventHomeStop)window.__upgradeEventHomeStop();
 var state=window.__upgradeEventHomeClock={revision:'event-home-paint-v1',startedAt:null,uiMs:null,dataMs:null,checks:0,fallbackChecks:0};
 var frame=false,uiFrame=false,dataFrame=false,stopped=false,timer=null,deadline=null;
 function usable(){var main=document.querySelector('main[data-hd-module="home"]');
  if(!main||!main.getClientRects().length)return null;
  var actions=Array.prototype.filter.call(document.querySelectorAll('.hd-bottom-navigation button'),function(button){return !button.disabled&&button.getClientRects().length>0});
  return actions.length>=2?main:null;
 }
 function complete(main){return Boolean(main&&window.__hdSourceContract(main,'home',window.__hdPlans).sourcesReady&&!window.__hdModulePending(main))}
 function stop(){if(stopped)return;stopped=true;state.stopped=true;observer.disconnect();clearTimeout(timer);clearTimeout(deadline);window.removeEventListener('pointerdown',intent,true)}
 function schedule(){if(stopped||state.startedAt===null||frame)return;frame=true;requestAnimationFrame(function(){frame=false;check()})}
 function check(){if(stopped||state.startedAt===null)return;state.checks++;
  var main=usable();
  // check() itself runs in the first frame; recheck in the following frame.
  if(main&&state.uiMs===null&&!uiFrame){uiFrame=true;requestAnimationFrame(function(){uiFrame=false;if(stopped)return;if(usable())state.uiMs=performance.now()-state.startedAt;schedule()})}
  if(complete(main)&&state.dataMs===null&&!dataFrame){dataFrame=true;requestAnimationFrame(function(){dataFrame=false;if(stopped)return;if(complete(usable()))state.dataMs=performance.now()-state.startedAt;schedule()})}
  if(state.uiMs!==null&&state.dataMs!==null)stop();
 }
 function fallback(){if(stopped)return;state.fallbackChecks++;schedule();timer=setTimeout(fallback,100)}
 function intent(event){if(!event.isTrusted||state.startedAt!==null||!event.target||!event.target.closest(selector))return;
  state.startedAt=performance.now();deadline=setTimeout(function(){state.timedOut=true;stop()},30000);schedule();timer=setTimeout(fallback,100);
 }
 var observer=new MutationObserver(schedule);observer.observe(document.documentElement,{subtree:true,childList:true,attributes:true,
  attributeFilter:['data-hd-module','aria-busy','data-hd-home-read-model-ready','disabled','hidden']});
 window.addEventListener('pointerdown',intent,true);window.__upgradeEventHomeStop=stop;
}
