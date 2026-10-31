import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parse} from 'acorn';
import {simple} from 'acorn-walk';
import vm from 'node:vm';
import {normalizeTrustedInputTimestamp} from '../scripts/helpers/browser-interaction-timing.mjs';
const source=readFileSync(new URL('../scripts/audit-android-webview.mjs',import.meta.url),'utf8');let expression;
simple(parse(source,{ecmaVersion:'latest',sourceType:'module'}),{VariableDeclarator(n){if(n.id.name==='instrumentation')expression=source.slice(n.init.start,n.init.end)}});
function install(lightweight){
 const code=vm.runInNewContext(expression,{normalizeTrustedInputTimestamp,lightweight});
 let clock=20,busy=true,mutation;const listeners=new Map(),frames=[];
 const main={firstElementChild:{},isConnected:true,querySelector:()=>busy?{}:null};
 Object.defineProperty(main,'innerText',{get(){throw Error('Layout-forcing innerText read')}});
 main.getBoundingClientRect=()=>{throw Error('Forced layout query')};
 const window={__androidInteraction:{expected:'bank_payments',started:null,ready:null,feedback:null,feedbackScheduled:false,inputAt:null,inputCapturedAt:null}};
 const document={querySelector:()=>main,addEventListener:(type,fn,capture)=>listeners.set(type+':'+!!capture,fn),removeEventListener:(type,_fn,capture)=>listeners.delete(type+':'+!!capture)};
 vm.runInNewContext(code,{window,document,performance:{now:()=>clock,timeOrigin:100000},
  requestAnimationFrame:callback=>frames.push(callback),MutationObserver:class{constructor(fn){mutation=fn}observe(){}disconnect(){mutation=null}}});
 return {window,listeners,click(){listeners.get('pointerdown:true')({timeStamp:10,isTrusted:true});listeners.get('click:true')();listeners.get('click:false')()},
  flush(){for(let i=0;i<8&&frames.length;i++){clock+=16;frames.splice(0).forEach(fn=>fn())}},unbusy(){busy=false;mutation()},mutation:()=>mutation};
}
test('lightweight actual observer measures trusted feedback without forcing layout and still waits for background busy',()=>{
 const p=install(true);p.click();p.flush();const t=p.window.__androidInteraction;
 assert.equal(t.inputAt,10);assert.equal(t.inputCapturedAt,20);assert.equal(t.pointerdownQueueMs,10);
 assert.ok(Number.isFinite(t.inputToFeedbackMs));assert.equal(t.ready,null,'busy source cannot be called ready');
 p.unbusy();p.flush();assert.ok(t.ready>t.feedback);assert.ok(t.inputToReadyMs>t.inputToFeedbackMs);
 p.window.__hdAndroidAuditProbe.restore();assert.equal(p.mutation(),null);assert.equal(p.listeners.size,0);
});
test('legacy mode is retained unchanged; poisoned layout getter demonstrates why its overhead is kept separate',()=>{
 const p=install(false);assert.throws(()=>p.click(),/Layout-forcing innerText/);p.window.__hdAndroidAuditProbe.restore();
});
