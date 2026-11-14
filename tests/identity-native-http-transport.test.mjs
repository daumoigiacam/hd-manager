import test from 'node:test';
import assert from 'node:assert/strict';
import {createIdentityFetch} from '../development/hd-manager/application/src/services/identityHttpTransport.js';
const origin='https://app.hdconnect.net';
const fixture=(overrides={})=>createIdentityFetch({isNative:()=>true,appOrigin:()=>origin,nativeRequest:async()=>{throw Error('Unexpected native call');},fetchImpl:async()=>{throw Error('Unexpected browser call');},...overrides});
test('bundled same-origin Identity reaches native HTTPS with original method, query, JSON and auth',async()=>{
 let options;
 const request=fixture({nativeRequest:async value=>{options=value;return {status:401,headers:{'content-type':'application/json'},data:{success:false,message:'Denied'}};}});
 const response=await request(origin+'/api/identity/devices?scope=mine',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer test-only-not-a-real-token'},body:JSON.stringify({reason:'Kiểm tra'})});
 assert.equal(options.url,origin+'/api/identity/devices?scope=mine');assert.equal(options.method,'POST');
 assert.deepEqual(options.data,{reason:'Kiểm tra'});assert.equal(options.headers.authorization,'Bearer test-only-not-a-real-token');
 assert.equal(response.status,401);assert.deepEqual(await response.json(),{success:false,message:'Denied'});
});
test('web and unrelated URLs retain browser fetch without creating native HTTP work',async()=>{
 for(const [native,url] of [[false,origin+'/api/identity/login'],[true,'https://firestore.googleapis.com/v1/test'],[true,origin+'/assets/index.js'],[true,origin+'/api/other']]){
  let received;const init={method:'GET'};
  const request=fixture({isNative:()=>native,fetchImpl:async(...args)=>{received=args;return new Response('browser');}});
  assert.equal(await (await request(url,init)).text(),'browser');assert.deepEqual(received,[url,init]);
 }
});
test('aborted Identity request does not reach native bridge',async()=>{
 const controller=new AbortController();controller.abort();
 await assert.rejects(fixture()(origin+'/api/identity/login',{signal:controller.signal}),{name:'AbortError'});
});
test('timeout abort rejects promptly and removes listener even while native HTTP completes later',async()=>{
 const controller=new AbortController();let finish,added=0,removed=0;
 const add=controller.signal.addEventListener.bind(controller.signal),remove=controller.signal.removeEventListener.bind(controller.signal);
 controller.signal.addEventListener=(...args)=>{added++;return add(...args);};controller.signal.removeEventListener=(...args)=>{removed++;return remove(...args);};
 const request=fixture({nativeRequest:()=>new Promise(resolve=>{finish=resolve;})});
 const pending=request(origin+'/api/identity/login',{signal:controller.signal});controller.abort();
 await assert.rejects(pending,{name:'AbortError'});assert.equal(added,1);assert.equal(removed,1);
 finish({status:200,headers:{},data:{success:true}});
});
test('204 and native failures preserve semantics and remove abort subscription',async()=>{
 assert.equal((await fixture({nativeRequest:async()=>({status:204,headers:{},data:''})})(origin+'/api/identity/login',{method:'OPTIONS'})).status,204);
 const controller=new AbortController();let removed=0;const remove=controller.signal.removeEventListener.bind(controller.signal);
 controller.signal.removeEventListener=(...args)=>{removed++;return remove(...args);};
 await assert.rejects(fixture({nativeRequest:async()=>{throw Error('NETWORK_FAILURE');}})(origin+'/api/identity/login',{signal:controller.signal}),/NETWORK_FAILURE/);
 assert.equal(removed,1);
});
