const test=require('node:test'),assert=require('node:assert/strict');
const {createAuthRequestTiming}=require('../functions/authRequestTiming');
const {readFileSync}=require('node:fs'),{parse}=require('@babel/parser');
test('bounded successful-login diagnostics contain only allowlisted numeric durations',async()=>{
 let time=0;const timing=createAuthRequestTiming({now:()=>time});
 const object={password:'fixture-only',token:'must-not-appear'};
 assert.equal(await timing.measure('lookup',()=>{time+=10;return object}),object);
 await timing.measure('arbitrary-untrusted-name',()=>{time+=20;return 'must-not-appear'});
 await timing.measure('lookup',()=>{time+=5});
 const header=timing.header();assert.equal(header,'lookup;dur=15.0, total;dur=35.0');
 assert(!/fixture|token|password|arbitrary/.test(header));
});
test('actual HTTP wrapper emits timings only for successful enabled requests, never errors or unrelated endpoints',async()=>{
 const source=readFileSync('functions/index.js','utf8'),tree=parse(source,{sourceType:'script'});
 const node=tree.program.body.flatMap(n=>n.type==='VariableDeclaration'?n.declarations:[]).find(n=>n.id.name==='runIdentityRequest').init;
 const build=(bindings)=>new Function(...Object.keys(bindings),`return (${source.slice(node.start,node.end)})`)(...Object.values(bindings));
 for(const [method,enabled,success,throws]of [['POST',true,true,false],['POST',true,false,false],['POST',true,false,true],['POST',false,true,false],['GET',true,true,false],['OPTIONS',true,true,false]]){
  const headers={};let called=false;const res={set:(name,value)=>{headers[name]=value},status:()=>({send:()=>{}})};
  const wrapper=build({applyCors:()=>{},createAuthRequestTiming,sendJson:(_res,status,data)=>({status,data}),console:{error:()=>{}}});
  const result=await wrapper(async(_request,observe)=>{called=true;if(throws)throw Error('must-not-appear');
   if(observe)await observe('lookup',async()=>({private:'fixture'}));return {success,statusCode:success?200:401};
  },{observeTiming:enabled})({method,body:{observeTiming:'client-cannot-choose-diagnostics'}},res);
  const shouldEmit=method==='POST'&&enabled&&success&&!throws;
  assert.equal(Object.hasOwn(headers,'Server-Timing'),shouldEmit);
  if(shouldEmit){assert.match(headers['Server-Timing'],/^lookup;dur=\d+\.\d, total;dur=\d+\.\d$/);assert.equal(headers['Access-Control-Expose-Headers'],'Server-Timing');}
  if(method==='GET'||method==='OPTIONS')assert.equal(called,false);
  if(throws)assert.equal(result.status,500);
 }
});
test('timing preserves exact errors and parallel results without serializing operations',async()=>{
 let time=0,release;const timing=createAuthRequestTiming({now:()=>time}),error=Error('private fixture error');
 const first=timing.measure('sign',()=>new Promise(resolve=>{release=resolve}));
 time=10;await assert.rejects(timing.measure('claims',()=>{throw error}),e=>e===error);
 time=20;release('signed');assert.equal(await first,'signed');
 assert.equal(timing.header(),'claims;dur=0.0, sign;dur=20.0, total;dur=20.0');
 assert(!timing.header().includes(error.message));
});
