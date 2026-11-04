import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {armTrustedLoginClock,resolveTrustedLoginObservation} from '../scripts/helpers/trusted-login-observation.mjs';

test('window capture preserves trusted submit across document/probe resets without reading credentials',()=>{
 let now=100;const handlers=new Map();const scope={performance:{now:()=>now}};scope.window=scope;
 scope.addEventListener=(name,fn)=>handlers.set(name,fn);scope.removeEventListener=(name,fn)=>{if(handlers.get(name)===fn)handlers.delete(name)};
 vm.runInNewContext('('+armTrustedLoginClock.toString()+')("[data-upgrade-login]")',scope);
 const target={closest:s=>s==='[data-upgrade-login]'?{}:null};
 handlers.get('pointerdown')({isTrusted:false,target});assert.equal(scope.__upgradeLoginClock.intentAt,null);
 handlers.get('pointerdown')({isTrusted:true,target});now=700;handlers.get('click')({isTrusted:true,target});
 // Document-level code may clear its own pending state or change the label.
 scope.__hdVerification={pendingLoginIntent:null};now=800;
 handlers.get('hd-startup-event')({detail:{name:'auth.identity_login.started'}});
 const clock=scope.__upgradeLoginClock;
 assert.equal(clock.intentAt,100);assert.equal(clock.identityCount,1);
 const raw={anchor:'identity-request-start',identityRequestAt:800,loginIntentAt:800,shellMs:200,interactiveMs:250,dataReadyMs:1200};
 const fixed=resolveTrustedLoginObservation(raw,clock);
 assert.equal(fixed.shellMs,900);assert.equal(fixed.interactiveMs,950);assert.equal(fixed.dataReadyMs,1900);
 assert.equal(raw.shellMs,200,'raw failed probe is preserved');
 scope.__upgradeLoginClockStop();assert.equal(handlers.size,0);
});

test('independent clock rejects absent, untrusted, stale and multiple-attempt epochs or fabricated readiness',()=>{
 const probe={identityRequestAt:800,loginIntentAt:800,shellMs:200,interactiveMs:250,dataReadyMs:1200};
 const clock={revision:'prearmed-window-login-v3',intentAt:100,anchor:'trusted-login-window-click',identityCount:1,identityEventAt:800};
 for(const patch of [{intentAt:null},{anchor:'synthetic'},{identityCount:2},{identityEventAt:900},{intentAt:1000}])assert.throws(()=>resolveTrustedLoginObservation(probe,{...clock,...patch}));
 assert.throws(()=>resolveTrustedLoginObservation({...probe,dataReadyMs:null},clock));
 assert.throws(()=>resolveTrustedLoginObservation({...probe,loginIntentAt:NaN},clock));
});
