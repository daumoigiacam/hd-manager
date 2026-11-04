import test from 'node:test';
import assert from 'node:assert/strict';
import {createIdentityNetworkTimingCollector} from '../scripts/helpers/identity-network-timing.mjs';
test('identity network metadata retains only whitelisted loopback numeric phases, not any secret or URL query',()=>{
 const c=createIdentityNetworkTimingCollector();
 const request={method:'POST',url:'http://127.0.0.1:5002/demo-hdm-perf-verification/us-central1/identityLogin?secret=PRIVATE',headers:{Authorization:'PRIVATE'},postData:'PRIVATE'};
 c.onEvent({method:'Network.requestWillBeSent',params:{requestId:'1',timestamp:10,wallTime:100,request}});
 c.onEvent({method:'Network.responseReceived',params:{requestId:'1',timestamp:10.2,response:{status:200,headers:{Secret:'PRIVATE'},timing:{requestTime:10,sendStart:1,sendEnd:2,receiveHeadersEnd:180,extra:'PRIVATE'}}}});
 c.onEvent({method:'Network.loadingFinished',params:{requestId:'1',timestamp:10.3,encodedDataLength:80}});
 const value=c.snapshot();assert.equal(value.rows.length,1);assert.equal(value.active,0);assert.equal(value.rows[0].finishedTimestamp,10.3);assert.equal(value.rows[0].timing.receiveHeadersEnd,180);
 const serialized=JSON.stringify(value);for(const word of ['PRIVATE','Authorization','postData','requestId','extra','?secret'])assert.ok(!serialized.includes(word));
 c.onEvent({method:'Network.requestWillBeSent',params:{requestId:'2',request:{...request,url:'https://production.invalid/identityLogin'}}});assert.equal(c.snapshot().rows.length,1);
});
test('diagnostic remains bounded and failed/unfinished requests are explicit',()=>{
 const c=createIdentityNetworkTimingCollector();
 for(let i=0;i<100;i++)c.onEvent({method:'Network.requestWillBeSent',params:{requestId:String(i),timestamp:i,request:{url:'http://127.0.0.1:9199/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=PRIVATE',method:'POST'}}});
 assert.equal(c.snapshot().rows.length,32);assert.equal(c.snapshot().active,32);
 c.onEvent({method:'Network.loadingFailed',params:{requestId:'0',timestamp:80,errorText:'net::ERR_TIMED_OUT'}});
 c.onEvent({method:'Network.loadingFailed',params:{requestId:'1',timestamp:81,errorText:'PRIVATE'}});
 assert.equal(c.snapshot().active,30);assert.equal(c.snapshot().rows[0].error,'net::ERR_TIMED_OUT');assert.equal(c.snapshot().rows[1].error,'REDACTED');
});
