import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {armCustomerStartupObservation} from '../scripts/helpers/customer-startup-observation.mjs';
function fixture(){
 let now=100,present=false,catalog=false,financial=false,debt='—',paid='—',callback;
 const frames=[],timers=new Map();let next=0,disconnected=false;
 const paragraph=label=>({textContent:label,nextElementSibling:{textContent:label==='Công nợ'?debt:paid}});
 const main={querySelectorAll:()=>[paragraph('Công nợ'),paragraph('Đã thanh toán')],querySelector:s=>s==='[data-hd-customer-bootstrap-status]'?!catalog:s==='[aria-busy="true"]'?!financial:null};
 const root={getClientRects:()=>[{}],querySelector:()=>main,querySelectorAll:()=>[{},{}],getAttribute:()=>financial?'ready':'loading'};
 const scope={performance:{now:()=>now},document:{documentElement:{},querySelector:()=>present?root:null},requestAnimationFrame:fn=>frames.push(fn),setTimeout:fn=>{const id=++next;timers.set(id,fn);return id},clearTimeout:id=>timers.delete(id),MutationObserver:class{constructor(fn){callback=fn}observe(){}disconnect(){disconnected=true}}};
 scope.window=scope;scope.__upgradeLoginClock={intentAt:100,identityCount:1,anchor:'trusted-login-window-pointerdown'};
 vm.runInNewContext('('+armCustomerStartupObservation.toString()+')({debt:80000,paid:40000})',scope);
 return{scope,frames,timers,get disconnected(){return disconnected},set(value){({present=present,catalog=catalog,financial=financial,debt=debt,paid=paid}=value);callback()},paint(){while(frames.length){now+=16;frames.shift()()}},tick(){const copy=[...timers.values()];timers.clear();copy.forEach(fn=>fn())}};
}
test('customer catalog can be interactive while money waits; data-ready requires stable confirmed exact money',async()=>{
 const f=fixture();f.set({present:true,catalog:false});f.paint();assert.equal(f.scope.__upgradeCustomerStartup.interactiveMs,null);
 f.set({catalog:true});f.paint();assert.ok(f.scope.__upgradeCustomerStartup.interactiveMs>0);assert.equal(f.scope.__upgradeCustomerStartup.dataReadyMs,null);
 f.set({financial:true,debt:'80.000 đ',paid:'40.000 đ'});f.paint();const result=await f.scope.__upgradeCustomerStartupPromise;
 assert.ok(result.dataReadyMs>result.interactiveMs);assert.equal(f.disconnected,true);assert.equal(f.timers.size,0);
});
test('ready-marked wrong zero money fails rather than waiting for a later correct value',async()=>{
 const f=fixture();f.set({present:true,catalog:true,financial:true,debt:'0 đ',paid:'0 đ'});f.paint();
 await assert.rejects(f.scope.__upgradeCustomerStartupPromise,/exact oracle/);assert.equal(f.scope.__upgradeCustomerStartup.dataReadyMs,null);
});
test('old or unobserved login cannot manufacture customer startup timing and cleanup is idempotent',()=>{
 const f=fixture();f.scope.__upgradeLoginClock.identityCount=0;f.set({present:true,catalog:true,financial:true,debt:'80.000 đ',paid:'40.000 đ'});f.paint();assert.equal(f.scope.__upgradeCustomerStartup.dataReadyMs,null);
 const stop=f.scope.__upgradeCustomerStartupStop;stop();stop();assert.equal(f.disconnected,true);assert.equal(f.timers.size,0);
});
