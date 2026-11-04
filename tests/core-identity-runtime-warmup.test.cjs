const test=require('node:test'),assert=require('node:assert/strict');
const {createIdentityRuntimeWarmup}=require('../functions/identityRuntimeWarmup');
test('preflight warmup is single-flight, returns no credential/snapshot, and has bounded success/failure TTL',async()=>{
 let time=0,read=0,auth=0,release;
 const warm=createIdentityRuntimeWarmup({now:()=>time,ttlMs:100,retryMs:20,
  readProbe:()=>{read++;return new Promise(resolve=>{release=resolve})},getAccessToken:async()=>{auth++;return {access_token:'fixture-token'}}});
 const one=warm(),two=warm();assert.equal(one,two);await Promise.resolve();assert.equal(read,1);assert.equal(auth,1);
 time=1000;assert.equal(warm(),one,'elapsed TTL cannot duplicate an in-flight request');
 release({private:'must-not-escape'});assert.equal(await one,true);
 const next=warm();await Promise.resolve();assert.equal(read,2);release({});await next;
 assert.equal(await warm(),true);assert.equal(read,2);
 let failures=0;const failed=createIdentityRuntimeWarmup({now:()=>time,ttlMs:100,retryMs:20,readProbe:()=>{failures++;throw Error('private fixture')},getAccessToken:async()=>({})});
 assert.equal(await failed(),false);assert.equal(await failed(),false);assert.equal(failures,1);
 time+=21;assert.equal(await failed(),false);assert.equal(failures,2);
});
test('actual warmup declaration is a fixed read only, not a user-selected collection or signed session',()=>{
 const fs=require('node:fs'),{parse}=require('@babel/parser'),source=fs.readFileSync('functions/index.js','utf8');
 const tree=parse(source,{sourceType:'script'}),node=tree.program.body.flatMap(n=>n.type==='VariableDeclaration'?n.declarations:[]).find(n=>n.id.name==='warmIdentityRuntime');
 const code=source.slice(node.start,node.end);assert.match(code,/collection\('identity_rate_limits'\)\.doc\('hd-startup-read-only-probe-v1'\)\.get\(\)/);
 assert.match(code,/credential\.getAccessToken\(\)/);assert(!/\.set\(|\.update\(|createCustomToken|req\./.test(code));
 assert.match(source,/observeTiming:true,warmup:warmIdentityRuntime/);
});
