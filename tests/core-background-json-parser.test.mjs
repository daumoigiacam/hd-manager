import test from 'node:test';import assert from 'node:assert/strict';
import {createBackgroundJsonParser} from '../src/services/backgroundJsonParser.js';
import {build} from 'esbuild';import {chromium} from 'playwright-core';import http from 'node:http';
import {chromiumLaunchOptions} from './helpers/chromium-launch-options.mjs';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
function fixture(extra={}) {
 const sent=[];let terminated=0,fallbacks=0;
 const worker={postMessage:m=>sent.push(m),terminate:()=>terminated++};
 const parser=createBackgroundJsonParser({workerFactory:()=>worker,fallbackParse:text=>{fallbacks++;return JSON.parse(text)},...extra});
 return{parser,sent,worker,stats:()=>({terminated,fallbacks}),receive:message=>worker.onmessage({data:message.type==='parsed-json-chunk'?{...message,encoding:'raw-json',rows:message.rows.map(row=>JSON.stringify(row))}:message})};
}

test('REST row ACKs use the real task channel rather than silently falling back to nested timers',async()=>{
 const bundle=await build({entryPoints:['src/services/backgroundJsonParser.js'],bundle:true,write:false,format:'cjs',platform:'browser',target:'es2019',logLevel:'silent'});
 const channels=[],timers=[];
 class TaskChannel {
  constructor(){
   this.pending=[];this.closed=false;
   this.port1={onmessage:null,close:()=>{this.closed=true}};
   this.port2={postMessage:()=>this.pending.push(()=>this.port1.onmessage?.()),close:()=>{this.closed=true}};
   channels.push(this);
  }
 }
 const module={exports:{}};
 runInNewContext(bundle.outputFiles[0].text,{module,exports:module.exports,MessageChannel:TaskChannel,
  setTimeout:(callback,delay)=>{const timer={callback,delay};timers.push(timer);return timer},clearTimeout:()=>{}});
 const sent=[],worker={postMessage:message=>sent.push(message),terminate:()=>{}};
 const parser=module.exports.createBackgroundJsonParser({workerFactory:()=>worker});
 try{
  const result=parser.parse('[1,2]'),id=sent[0].id;
  worker.onmessage({data:{type:'parsed-json-start',id,count:2}});
  worker.onmessage({data:{type:'parsed-json-chunk',id,index:0,encoding:'raw-json',rows:['1']}});
  assert.equal(timers.filter(timer=>timer.delay===0).length,0,'a missing scheduler import must not be hidden by the timer fallback');
  assert.equal(channels.length,1);
  assert.equal(sent.filter(message=>message.type==='ack-json').length,0,'ACK must yield a real task');
  channels[0].pending.shift()();await Promise.resolve();
  assert.equal(sent.at(-1).type,'ack-json');assert.equal(sent.at(-1).nextIndex,1);
  worker.onmessage({data:{type:'parsed-json-chunk',id,index:1,encoding:'raw-json',rows:['2']}});
  assert.equal(channels.length,1,'chunks share one FIFO channel');
  channels[0].pending.shift()();await Promise.resolve();
  worker.onmessage({data:{type:'parsed-json-complete',id,count:2}});
  assert.deepEqual(Array.from(await result),[1,2]);
  assert.equal(channels[0].closed,true,'completion releases both ports');
 }finally{parser.close()}
});

test('parallel REST pages receive separate asynchronous ACKs while an aborted page gets no late ACK',async()=>{
 const f=fixture();try{
  const controller=new AbortController();
  const cancelled=f.parser.parse('[0]',{signal:controller.signal});
  const rejected=assert.rejects(cancelled,{name:'AbortError'});
  const active=Array.from({length:7},(_,index)=>f.parser.parse(JSON.stringify([index+1])));
  const jobs=f.sent.filter(m=>typeof m.text==='string');
  jobs.forEach((job,index)=>{f.receive({type:'parsed-json-start',id:job.id,count:1});f.receive({type:'parsed-json-chunk',id:job.id,index:0,rows:[index]})});
  controller.abort();await rejected;
  const deadline=Date.now()+2000;
  while(f.sent.filter(m=>m.type==='ack-json').length<7&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,1));
  const acknowledgements=f.sent.filter(m=>m.type==='ack-json');
  assert.deepEqual(acknowledgements.map(m=>m.id),jobs.slice(1).map(m=>m.id));
  jobs.slice(1).forEach(job=>f.receive({type:'parsed-json-complete',id:job.id,count:1}));
  assert.deepEqual(await Promise.all(active),Array.from({length:7},(_,index)=>[index+1]));
 }finally{f.parser.close()}
});
test('worker JSON response preserves values, resolves matching requests only, and ignores aborted deliveries',async()=>{
 const f=fixture();try{
  const a=new AbortController(),cancelled=f.parser.parse('{"private":"old-scope"}',{signal:a.signal});a.abort();await assert.rejects(cancelled,{name:'AbortError'});
  const next=f.parser.parse('{"amount":12.5}');f.receive({type:'parsed-json',id:f.sent[0].id,value:{private:'old-scope'}});
  f.receive({type:'parsed-json',id:f.sent.find(m=>m.text==='{"amount":12.5}').id,value:{amount:12.5}});assert.deepEqual(await next,{amount:12.5});assert.equal(f.stats().fallbacks,0);
  const invalid=f.parser.parse('private malformed body');f.receive({type:'invalid-json',id:f.sent.find(m=>m.text==='private malformed body').id});await assert.rejects(invalid,e=>e instanceof SyntaxError&&!e.message.includes('private'));
 }finally{f.parser.close()}
});
test('bounded page transfer yields between acknowledgements and never publishes partial rows',async()=>{
 const f=fixture();try{
  let settled=false;const promise=f.parser.parse('[1,2,3,4,5]').then(value=>{settled=true;return value});const id=f.sent[0].id;
  f.receive({type:'parsed-json-start',id,count:5});f.receive({type:'parsed-json-chunk',id,index:0,rows:[1,2,3,4]});
  await Promise.resolve();assert.equal(settled,false);assert.equal(f.sent.filter(m=>m.type==='ack-json').length,0);
  await new Promise(r=>setTimeout(r,5));assert.deepEqual(f.sent.at(-1),{type:'ack-json',id,nextIndex:4});
  f.receive({type:'parsed-json-chunk',id,index:4,rows:[5]});await Promise.resolve();assert.equal(settled,false);
  f.receive({type:'parsed-json-complete',id,count:5});assert.deepEqual(await promise,[1,2,3,4,5]);assert.equal(f.stats().fallbacks,0);
 }finally{f.parser.close()}
});
test('partial transfer abort, duplicate or incomplete batches cannot publish and failed worker falls back atomically',async()=>{
 for(const mode of ['abort','duplicate','incomplete','overflow','error']){
  const f=fixture();try{
   const a=new AbortController(),promise=f.parser.parse('[1,2,3,4,5]',{signal:a.signal});const rejected=mode==='error'?null:assert.rejects(promise,{name:mode==='abort'?'AbortError':'SyntaxError'});const id=f.sent[0].id;
   f.receive({type:'parsed-json-start',id,count:5});f.receive({type:'parsed-json-chunk',id,index:0,rows:[1,2,3,4]});
   if(mode==='abort')a.abort();else if(mode==='duplicate')f.receive({type:'parsed-json-chunk',id,index:0,rows:[1]});
   else if(mode==='overflow')f.receive({type:'parsed-json-chunk',id,index:4,rows:[5,6]});
   else if(mode==='incomplete')f.receive({type:'parsed-json-complete',id,count:5});else f.worker.onerror();
   if(rejected)await rejected;else assert.deepEqual(await promise,[1,2,3,4,5]);
   await new Promise(r=>setTimeout(r,5));assert.equal(f.sent.filter(m=>m.type==='ack-json').length,0);
   assert.equal(f.stats().fallbacks,mode==='error'?1:0);
  }finally{f.parser.close()}
 }
});
test('unavailable or failed workers preserve exact JSON semantics through deferred fallback and bounded timeout',async()=>{
 const unavailable=createBackgroundJsonParser({workerFactory:()=>{throw Error('unsupported')}});
 try{assert.deepEqual(await unavailable.parse('[null,0,false,"Đức"]'),[null,0,false,'Đức']);await assert.rejects(unavailable.parse('secret malformed'),{name:'SyntaxError'})}finally{unavailable.close()}
 for(const mode of ['error','timeout']){const f=fixture({timeoutMs:10});try{
  const value=f.parser.parse('{"ok":true}');if(mode==='error')f.worker.onerror();
  assert.deepEqual(await value,{ok:true});assert.equal(f.stats().fallbacks,1);assert.equal(f.stats().terminated,1);
 }finally{f.parser.close()}}
});
test('parser disposal cancels outstanding work and cannot create a worker for an already aborted request',async()=>{
 const f=fixture();const a=new AbortController();a.abort();await assert.rejects(f.parser.parse('[]',{signal:a.signal}),{name:'AbortError'});assert.equal(f.sent.length,0);
 const value=f.parser.parse('[]');f.parser.close();await assert.rejects(value,{name:'AbortError'});await assert.rejects(f.parser.parse('[]'),{name:'AbortError'});
});

test('actual worker transfers validated original row text without losing negative zero, escapes or duplicate-key semantics', () => {
 const messages=[],self={navigator:{hardwareConcurrency:4},postMessage:message=>messages.push(message)};
 runInNewContext(readFileSync(new URL('../src/services/jsonParseWorker.js',import.meta.url),'utf8'),{self});
 const text=' \n[ -0, 1e400, 9007199254740993, {"same":1,"same":2,"__proto__":{"polluted":true}}, "[comma,] \\" \\\\ 🦆", {"nested":[[1,2],{"v":"\\uD800"}]} ]\t';
 const expected=JSON.parse(text);
 self.onmessage({data:{id:1,text}});
 const rows=[];let complete=false;
 for(let index=0;index<messages.length;index++){
  const message=messages[index];
  if(message.type==='parsed-json-chunk'){
   assert.equal(message.encoding,'raw-json');assert(message.rows.length>=1&&message.rows.length<=16);
   assert(message.rows.reduce((sum,row)=>sum+row.length,0)<=32768);
   assert(message.rows.every(row=>typeof row==='string'));
   rows.push(...message.rows.map(row=>JSON.parse(row)));
   self.onmessage({data:{id:1,type:'ack-json',nextIndex:rows.length}});
  }else if(message.type==='parsed-json-complete')complete=true;
 }
 assert.equal(complete,true);assert.deepEqual(rows,expected);assert(Object.is(rows[0],-0));assert.equal({}.polluted,undefined);
 for(const [index,body] of ['[1,]','["unterminated]','[] x','[ ,1]','[1}{2]'].entries()){
  const before=messages.length;self.onmessage({data:{id:index+2,text:body}});
  assert.equal(messages.length,before+1);assert.equal(messages.at(-1).type,'invalid-json','invalid outer framing must be rejected');
 }
});

test('array framing avoids duplicate deep parsing and the real receiver rejects every malformed row atomically',async()=>{
 const source=readFileSync(new URL('../src/services/jsonParseWorker.js',import.meta.url),'utf8');
 let duplicateParses=0;
 const worker={postMessage:message=>queueMicrotask(()=>self.onmessage({data:message})),terminate:()=>{}};
 const self={navigator:{hardwareConcurrency:4},postMessage:message=>queueMicrotask(()=>worker.onmessage?.({data:message}))};
 runInNewContext(source,{self,Map,Number,SyntaxError,JSON:{parse:text=>{duplicateParses++;return JSON.parse(text)}}});
 const parser=createBackgroundJsonParser({workerFactory:()=>worker,fallbackParse:()=>{throw Error('Unexpected fallback')}});
 try{
  const valid=['[]','[ \r\n\t ]','[1e400,-0,1.2500,{"a":1,"a":2},"🦆\\uD800"]',
   JSON.stringify(Array.from({length:101},(_,i)=>({i,text:'a, [ ] \\" 🦆',nested:[i,{ok:true}]})))];
  for(const text of valid)assert.deepEqual(await parser.parse(text),JSON.parse(text));
  assert.equal(duplicateParses,0,'the array page must not be parsed/allocated in the worker before its rows are validated');
  const malformed=['[1,]','[,1]','[1,,2]','[1 2]','[01]','[NaN]','[undefined]','[true,false,broken]',
   '[{"ok":1},{"bad":}]','["\\x20"]','["unescaped\nnewline"]','[1][2]','[] x','[1','[[1]]]',
   '[{]}]','[\u00a0]','[\uFEFF]','[1,\u00a0]'];
  for(const text of malformed){
   assert.throws(()=>JSON.parse(text),SyntaxError);
   let published=false;
   await assert.rejects(parser.parse(text).then(value=>{published=true;return value}),{name:'SyntaxError'});
   assert.equal(published,false);
  }
  assert.deepEqual(await parser.parse('[{"afterFailure":true}]'),[{afterFailure:true}]);
 }finally{parser.close()}
});

test('invalid text-row encodings fail atomically and do not schedule another acknowledgement', async () => {
 for(const packet of [{encoding:'raw-json',rows:['{"invalid":']},{encoding:'raw-json',rows:[{}]}, {encoding:'other',rows:['1']},
  {encoding:'raw-json',rows:Array(17).fill('1')},{encoding:'raw-json',rows:['"'+'x'.repeat(17000)+'"','"'+'y'.repeat(17000)+'"']}]){
  const f=fixture();try{
   const promise=f.parser.parse('[1]'),rejected=assert.rejects(promise,{name:'SyntaxError'}),id=f.sent[0].id;
   f.receive({type:'parsed-json-start',id,count:1});
   f.worker.onmessage({data:{type:'parsed-json-chunk',id,index:0,...packet}});
   await rejected;await new Promise(resolve=>setTimeout(resolve,5));
   assert.equal(f.sent.filter(message=>message.type==='ack-json').length,0);
  }finally{f.parser.close()}
 }
});

test('four-core worker coalesces small rows with bounded text rather than one ACK per record',()=>{
 const packets=[],self={navigator:{hardwareConcurrency:4,deviceMemory:2},postMessage:packet=>packets.push(packet)};
 runInNewContext(readFileSync(new URL('../src/services/jsonParseWorker.js',import.meta.url),'utf8'),{self});
 const records=Array.from({length:101},(_,i)=>({id:i,amount:i-50,text:'Vịt 🦆'}));
 self.onmessage({data:{id:8,text:JSON.stringify(records)}});const result=[];let chunks=0;
 while(packets.at(-1).type==='parsed-json-chunk'){
  const packet=packets.at(-1);chunks++;assert(packet.rows.length<=16);assert(packet.rows.reduce((n,row)=>n+row.length,0)<=32768);
  result.push(...packet.rows.map(row=>JSON.parse(row)));self.onmessage({data:{type:'ack-json',id:8,nextIndex:result.length}});
 }
 assert.deepEqual(result,records);assert.equal(chunks,7,'101 small rows need seven ACK groups instead of101');
 assert.equal(packets.at(-1).type,'parsed-json-complete');
 const large=[{text:'x'.repeat(20000)},{text:'y'.repeat(20000)},{text:'z'.repeat(40000)},{text:'small'}];
 self.onmessage({data:{id:9,text:JSON.stringify(large)}});let count=0;
 while(packets.at(-1).type==='parsed-json-chunk'){
  const packet=packets.at(-1);assert.equal(packet.rows.length,1,'large rows stay isolated; a long record cannot absorb another row');
  assert.deepEqual(JSON.parse(packet.rows[0]),large[count++]);self.onmessage({data:{type:'ack-json',id:9,nextIndex:count}});
 }
 assert.equal(count,4);
});
test('actual classic JSON worker parses Unicode, numbers and prototype-named fields without main-thread fallback',{timeout:30000},async()=>{
 const worker=await build({entryPoints:['src/services/jsonParseWorker.js'],bundle:true,write:false,format:'iife',target:'es2019'});
 const client=await build({stdin:{resolveDir:process.cwd(),contents:`import{createBackgroundJsonParser}from'./src/services/backgroundJsonParser.js';const p=createBackgroundJsonParser({workerFactory:()=>new Worker('/worker.js'),fallbackParse:()=>{throw Error('unexpected fallback')}});window.parse=p.parse;window.closeParser=p.close;`},bundle:true,write:false,format:'iife',target:'es2019',logLevel:'silent'});
 const server=http.createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/'?'text/html':'text/javascript');res.end(req.url==='/worker-low.js'?'Object.defineProperty(self.navigator,"hardwareConcurrency",{value:4});\n'+worker.outputFiles[0].text:req.url==='/worker.js'?worker.outputFiles[0].contents:req.url==='/client.js'?client.outputFiles[0].contents:'<script src="/client.js"></script>')});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch(chromiumLaunchOptions());
 try{const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}`);
  const result=await page.evaluate(async()=>{const value=await window.parse('{"name":"Vịt 🦆","amount":12.5,"__proto__":{"polluted":true}}');return{name:value.name,amount:value.amount,own:Object.hasOwn(value,'__proto__'),polluted:{}.polluted===undefined,field:value['__proto__'].polluted}});
  assert.deepEqual(result,{name:'Vịt 🦆',amount:12.5,own:true,polluted:true,field:true});
  assert.deepEqual(await page.evaluate(async()=>{const rows=Array.from({length:101},(_,i)=>({id:i,amount:i+0.25,name:'Vịt 🦆',nested:[null,false,{ok:true}]}));const result=await window.parse(JSON.stringify(rows));const empty=await window.parse('[]');return {equal:JSON.stringify(result)===JSON.stringify(rows),length:result.length,empty}}),{equal:true,length:101,empty:[]});
  assert.deepEqual(await page.evaluate(()=>new Promise((resolve,reject)=>{const w=new Worker('/worker-low.js'),rows=[];let chunks=0,max=0;const timer=setTimeout(()=>{w.terminate();reject(Error('Bounded text worker did not finish'))},10000);w.onerror=reject;w.onmessage=e=>{const m=e.data;if(m.type==='parsed-json-chunk'){if(m.encoding!=='raw-json'||m.rows.some(row=>typeof row!=='string')){reject(Error('Expected original JSON text rows'));return;}rows.push(...m.rows.map(row=>JSON.parse(row)));chunks++;max=Math.max(max,m.rows.length);w.postMessage({type:'ack-json',id:5,nextIndex:rows.length})}else if(m.type==='parsed-json-complete'){clearTimeout(timer);w.terminate();resolve({chunks,max,exact:JSON.stringify(rows)==='[0,1,2,3,4,5,6,7,8]'})}};w.postMessage({id:5,text:'[0,1,2,3,4,5,6,7,8]'})})),{chunks:1,max:9,exact:true});
  assert.equal(await page.evaluate(async()=>{try{await window.parse('secret malformed');return false}catch(e){return e.name==='SyntaxError'&&e.message==='Invalid JSON response.'}}),true);
  await page.evaluate(()=>window.closeParser());
 }finally{await browser.close();await new Promise(r=>server.close(r))}
});
