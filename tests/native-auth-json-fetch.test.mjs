import test from 'node:test';import assert from 'node:assert/strict';
import {createNativeAuthJsonFetch} from '../performance/upgrade-20261103/rejected-pilots/nativeAuthJsonFetch.js';
const url='https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=public-key';
const init={method:'POST',headers:{'Content-Type':'application/json','X-Client-Version':'fixture'},body:'{"token":"synthetic-only"}'};
test('preserve SDK JSON/status/header contract and exact token body, with no duplicate fetch',async()=>{
 let options,calls=0;const f=createNativeAuthJsonFetch({fetchImpl:()=>{throw Error('unexpected fetch')},request:async o=>{options=o;calls++;return{status:400,headers:{'content-type':'application/json','content-encoding':'gzip'},data:{error:{message:'INVALID_CUSTOM_TOKEN'}}}}});
 const result=await f(url,init);assert.equal(result.ok,false);assert.equal(result.status,400);assert.equal((await result.json()).error.message,'INVALID_CUSTOM_TOKEN');assert.equal(result.headers.get('content-encoding'),null);assert.equal(options.data,init.body);assert.equal(options.headers['x-client-version'],'fixture');assert.equal(options.disableRedirects,true);assert.equal(calls,1);
});
test('Firestore streams, files, alternate ports, lookalike hosts, HTTP and explicit cookie inclusion stay on original fetch',async()=>{
 let count=0;const f=createNativeAuthJsonFetch({fetchImpl:async()=>{count++;return 'original'},request:()=>{throw Error('route broadened')}});
 for(const input of ['https://firestore.googleapis.com/v1/projects/demo/databases/(default)/documents:runQuery','https://identitytoolkit.googleapis.com.evil.test/v1/accounts:signInWithCustomToken','https://identitytoolkit.googleapis.com:444/v1/accounts:signInWithCustomToken','http://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken'])assert.equal(await f(input,init),'original');
 assert.equal(await f(url,{...init,credentials:'include'}),'original');assert.equal(await f(url,{...init,body:new Uint8Array(1)}),'original');assert.equal(count,6);
});
test('loopback auth only in explicit isolated emulator mode; identity URLs matched exactly',async()=>{
 const identity='http://127.0.0.1:5002/demo-qa/us-central1/identityLogin';let native=0,web=0;const make=emulator=>createNativeAuthJsonFetch({identityUrls:[identity],emulator,fetchImpl:async()=>{web++;return 'web'},request:async()=>{native++;return{status:200,data:{success:true}}}});
 await make(false)(identity,init);assert.equal(web,1);assert.equal((await(await make(true)(identity,init)).json()).success,true);await make(true)(identity+'/other',init);assert.equal(native,1);assert.equal(web,2);
});
test('abort before dispatch sends nothing; abort during native request never replays or returns late response',async()=>{
 let calls=0,resolve;const controller=new AbortController();const f=createNativeAuthJsonFetch({fetchImpl:()=>{throw Error('cannot replay')},request:()=>{calls++;return new Promise(r=>{resolve=r})}});
 controller.abort();await assert.rejects(f(url,{...init,signal:controller.signal}),{name:'AbortError'});assert.equal(calls,0);
 const active=new AbortController(),pending=f(url,{...init,signal:active.signal});await Promise.resolve();active.abort();await assert.rejects(pending,{name:'AbortError'});resolve({status:200,data:{idToken:'synthetic-only'}});await Promise.resolve();assert.equal(calls,1);
});
test('native failure propagates once and 204 has an empty body',async()=>{
 const failure=Error('offline');const f=createNativeAuthJsonFetch({fetchImpl:()=>{throw Error('cannot replay')},request:async()=>{throw failure}});await assert.rejects(f(url,init),e=>e===failure);
 const empty=createNativeAuthJsonFetch({fetchImpl:()=>{},identityUrls:['https://qa.example/identityLogin'],request:async()=>({status:204,data:''})});assert.equal(await(await empty('https://qa.example/identityLogin',{method:'OPTIONS'})).text(),'');
});
