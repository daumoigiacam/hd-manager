const test=require('node:test'),assert=require('node:assert/strict');
const {createHostedOfflineApi}=require('../functions/offlineHostedApi.cjs');
const response=()=>({headers:{},statusCode:200,headersSent:false,set(k,v){this.headers[k]=v;return this;},status(code){this.statusCode=code;return this;},json(body){this.body=body;this.headersSent=true;return this;}});
const request=(path='/.well-known/jwks.json',method='GET',origin='https://app.example.com')=>({path,method,get:name=>name==='origin'?origin:undefined});
test('host initializes one backend for concurrent JWK requests; no private key read',async()=>{
 let created=0,closed=0;const publicKey={kty:'RSA',n:'public-only'};
 const host=createHostedOfflineApi({configuration:()=>({}),getSigningKey:()=>{throw Error('must not read signer for discovery');},createBackend:async()=>{created++;await Promise.resolve();return{environment:{appOrigin:'https://app.example.com',publicKey},close:async()=>{closed++;}};}});
 const a=response(),b=response();await Promise.all([host.handler(request(),a),host.handler(request(),b)]);assert.equal(created,1);assert.deepEqual(a.body,{keys:[publicKey]});assert.deepEqual(b.body,a.body);await host.close();assert.equal(closed,1);
});
test('discovery allows exact Capacitor origin, rejects foreign origins/methods',async()=>{
 const host=createHostedOfflineApi({configuration:()=>({}),createBackend:async()=>({environment:{appOrigin:'https://app.example.com',publicKey:{}},close:async()=>{}})});
 for(const[origin,method,status]of [['https://localhost','GET',200],['https://attacker.example.com','GET',403],['https://app.example.com','POST',405]]){const r=response();await host.handler(request('/api/offline/.well-known/jwks.json',method,origin),r);assert.equal(r.statusCode,status);}await host.close();
});
test('all business requests delegate unchanged to the verified backend',async()=>{
 let saved;const host=createHostedOfflineApi({configuration:()=>({}),createBackend:async()=>({environment:{},handler:async(req,res)=>{saved=req;res.status(401).json({code:'unauthenticated'});},close:async()=>{}})}),req=request('/sync','POST'),res=response();await host.handler(req,res);assert.equal(saved,req);assert.equal(res.statusCode,401);await host.close();
});
test('configuration failure is sanitized, retryable and never becomes a fake 200',async()=>{
 let count=0;const host=createHostedOfflineApi({configuration:()=>{count++;throw Error('sensitive server configuration');},createBackend:()=>assert.fail()}),a=response(),b=response();await host.handler(request(),a);await host.handler(request(),b);assert.equal(count,2);assert.equal(a.statusCode,503);assert.deepEqual(a.body,{code:'unavailable'});assert.equal(JSON.stringify(a).includes('sensitive'),false);await host.close();
});
