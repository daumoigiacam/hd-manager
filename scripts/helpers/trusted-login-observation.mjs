// Test-only observer, armed before a real submit. Window capture precedes
// application/document handlers and loading-label mutations. No credential,
// token, input value or DOM node is retained. Never sets the app's readiness.
export function armTrustedLoginClock(selector) {
 if(window.__upgradeLoginClockStop)window.__upgradeLoginClockStop();
 var state=window.__upgradeLoginClock={revision:'prearmed-window-login-v3',intentAt:null,anchor:null,identityCount:0,identityEventAt:null};
 function target(e){return e.target&&typeof e.target.closest==='function'&&e.target.closest(selector)}
 function pointer(e){if(!e.isTrusted||!target(e)||state.identityCount)return;state.intentAt=performance.now();state.anchor='trusted-login-window-pointerdown'}
 function click(e){if(!e.isTrusted||!target(e)||state.identityCount)return;if(state.intentAt===null){state.intentAt=performance.now();state.anchor='trusted-login-window-click'}}
 function started(e){if(e.detail&&e.detail.name==='auth.identity_login.started'){state.identityCount++;state.identityEventAt=performance.now()}}
 window.addEventListener('pointerdown',pointer,true);window.addEventListener('click',click,true);window.addEventListener('hd-startup-event',started);
 window.__upgradeLoginClockStop=function(){window.removeEventListener('pointerdown',pointer,true);window.removeEventListener('click',click,true);window.removeEventListener('hd-startup-event',started);window.__upgradeLoginClockStop=null};
}

export function resolveTrustedLoginObservation(probe,clock) {
 if(!clock||clock.revision!=='prearmed-window-login-v3'||clock.identityCount!==1||!Number.isFinite(clock.intentAt)||!/^trusted-login-window-/.test(clock.anchor||'')||!Number.isFinite(probe.identityRequestAt)||probe.identityRequestAt<clock.intentAt||Math.abs(clock.identityEventAt-probe.identityRequestAt)>5)throw Error('Independent trusted login epoch is missing or mismatched');
 const result={...probe,anchor:clock.anchor,clockRevision:clock.revision,loginIntentAt:clock.intentAt};
 for(const key of ['shellMs','interactiveMs','dataReadyMs']){
  if(!Number.isFinite(probe[key])||probe[key]<0||!Number.isFinite(probe.loginIntentAt))throw Error('Missing actual Home observation');
  result[key]=probe.loginIntentAt+probe[key]-clock.intentAt;
  if(result[key]<0)throw Error('Home observation precedes trusted submit');
 }
 return result;
}
