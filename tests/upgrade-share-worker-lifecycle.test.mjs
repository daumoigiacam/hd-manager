import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {build} from 'esbuild';

async function fixture(){
 const output=await build({stdin:{resolveDir:process.cwd(),contents:`import{createRecordedShareCanvas}from'./src/utils/shareCanvas.js';globalThis.create=createRecordedShareCanvas;`},bundle:true,write:false,format:'iife',target:'chrome74',plugins:[{name:'synthetic-worker-port',setup(b){b.onResolve({filter:/shareCanvasWorkerFactory\.js$/},()=>({path:'worker-port',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const createShareCanvasWorker=()=>globalThis.makeWorker();'}))}}]});
 let now=0,next=0;const timers=new Map(),workers=[],html=[];
 const context={Blob,console,Worker:function(){},OffscreenCanvas:class{constructor(w,h){this.width=w;this.height=h}getContext(){return{measureText:()=>({width:10}),fillRect(){}}}convertToBlob(){}},
  setTimeout:(callback,delay)=>{timers.set(++next,{at:now+delay,callback});return next},clearTimeout:id=>timers.delete(id),
  document:{createElement:()=>{const canvas={width:0,height:0,getContext:()=>({fillRect(){}}),toBlob:callback=>callback(new Blob(['pixels'],{type:'image/png'}))};html.push(canvas);return canvas}},
  makeWorker:()=>{const worker={messages:[],terminated:0,postMessage(message){this.messages.push(message)},terminate(){this.terminated++}};workers.push(worker);return worker},
 };
 vm.runInNewContext(output.outputFiles[0].text,context);
 return{context,workers,timers,html,advance(ms){now+=ms;for(const[id,job]of[...timers])if(job.at<=now){timers.delete(id);job.callback()}}};
}
test('successful canvas worker releases its idle native resource, can restart, and ignores a late old-worker response',async()=>{
 const h=await fixture(),first=h.context.create(100),promise=first.convertToBlob();
 const old=h.workers[0];old.onmessage({data:{id:old.messages[0].id,blob:new Blob(['first'])}});assert.equal(await(await promise).text(),'first');
 h.advance(14999);assert.equal(old.terminated,0);h.advance(1);assert.equal(old.terminated,1);assert.equal(h.timers.size,0);
 const second=h.context.create(100),pending=second.convertToBlob(),next=h.workers[1];
 old.onmessage({data:{id:next.messages[0].id,blob:new Blob(['wrong'])}});
 next.onmessage({data:{id:next.messages[0].id,blob:new Blob(['correct'])}});assert.equal(await(await pending).text(),'correct');
 h.advance(15000);assert.equal(next.terminated,1);assert.equal(h.timers.size,0);
});
test('a stuck worker has one finite deadline, releases all pending jobs and uses complete HTML fallback images',async()=>{
 const h=await fixture(),a=h.context.create(100,200),b=h.context.create(100,200);
 const jobs=[a.convertToBlob(),b.convertToBlob()];assert.equal(h.workers.length,1);
 h.advance(30000);const blobs=await Promise.all(jobs);assert.deepEqual(await Promise.all(blobs.map(blob=>blob.text())),['pixels','pixels']);
 assert.equal(a.encodingMode,'html-fallback');assert.equal(b.encodingMode,'html-fallback');assert.equal(h.workers[0].terminated,1);assert.equal(h.timers.size,0);
 assert.ok(h.html.every(canvas=>canvas.width===0&&canvas.height===0));
 const later=h.context.create(100,200);assert.equal(typeof later.convertToBlob,'undefined');assert.equal(h.workers.length,1);
});
