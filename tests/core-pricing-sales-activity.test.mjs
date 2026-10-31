import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {appFunction} from './helpers/app-source-function.mjs';
import {runCooperativeProjection,createProjectionCache} from '../src/services/cooperativeProjection.js';
const env={getPricingSalesGroupKey:(line,parent,product)=>line.group||product.group||parent.group||'',
 getPricingSalesGroupLabel:(line,parent,product)=>line.label||product.label||parent.label||'',
 getEntityTimestamp:doc=>doc.timestamp||0,getPricingInputTimestamp:doc=>doc.fallback||0};
env.normalizeLookupText=appFunction('normalizeLookupText');
env.getPricingDocumentLineItems=appFunction('getPricingDocumentLineItems');
const build=appFunction('buildPricingSalesGroupsByActivity',env);
const frozen=readFileSync(new URL('./fixtures/pricing-sales-activity.baseline.mjs',import.meta.url),'utf8');
const baseline=new Function(...Object.keys(env),'return '+frozen.slice(frozen.indexOf('export default ')+15))(...Object.values(env));
function input(){return {products:[{id:'p',group:'duck',label:'Vịt'}],
 orders:Array.from({length:1200},(_,i)=>({timestamp:i%11,state:i%31?'done':'Đã hủy',isArchived:i%43===0,
 items:[{productId:'p'},{group:'custom',label:'Group '+i},{label:'Missing group'}]})),
 orderRequests:[{timestamp:100,items:[{group:'tie',label:'first'}]},{fallback:100,rows:[{group:'tie',label:'last'}]},
 {timestamp:200,status:'cancelled',items:[{group:'tie',label:'must skip'}]},{productId:'p',timestamp:0}]};}
test('activity projection yields per line while preserving newest labels, ties, cancellations and inputs',async()=>{
 for(const x of [input(),{orders:null,orderRequests:null,products:null},{orders:[{items:[],rows:[{group:'ignored',label:'ignored'}]}]}]){
 const before=structuredClone(x);let turns=0;
 assert.deepEqual(build(x),baseline(x));
 const result=await runCooperativeProjection(()=>build({...x,cooperative:true}),{maxOperations:16,yieldTask:async()=>{turns++}});
 assert.deepEqual(result,baseline(x));assert.deepEqual(x,before);
 if(x.orders?.length>100){assert.ok(turns>100);assert.equal(result.tie.groupName,'last');}
 }
});
test('cancelled activity cannot publish partial groups; completed cache isolates sources and identity',async()=>{
 const x=input(),controller=new AbortController();let turns=0,published=false;
 await assert.rejects(runCooperativeProjection(()=>build({...x,cooperative:true}),{signal:controller.signal,maxOperations:16,
 yieldTask:async()=>{if(++turns===5)controller.abort()}}).then(()=>published=true),{name:'AbortError'});
 assert.equal(published,false);const cache=createProjectionCache(),sources=[x.orders,x.orderRequests,x.products];
 const complete=cache(sources,'company/actor/day');complete.value=build(x);complete.complete=true;
 assert.equal(cache(sources,'company/actor/day'),complete);
 assert.equal(cache(sources,'other-company/actor/day').complete,false);
 assert.equal(cache(sources,'company/other-actor/day').complete,false);
 assert.equal(cache([[...x.orders],x.orderRequests,x.products],'company/actor/day').complete,false);
});
test('incomplete activity cannot save partial group rules or share partial table',async()=>{
 for(const name of ['handleSavePricingRules','handleShareTodayPriceTable']){
 const bindings=new Proxy({pricingActivityReady:false},{get(t,k){if(k in t)return t[k];throw Error('Partial calculation touched '+String(k))}});
 // Only the readiness guard is available; touching any later value must fail.
 await appFunction(name,{pricingActivityReady:bindings.pricingActivityReady},{scope:'SimplePricingEngineView'})();
 }
});
