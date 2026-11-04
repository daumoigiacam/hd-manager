import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const {createEmployeeHomeCpuDiagnostic:create,summarizeHomeCpuProfile:summarize}=createRequire(import.meta.url)('../functions/employeeHomeCpuDiagnostic');
const profile={nodes:[{id:1,callFrame:{functionName:'(root)',url:''},children:[2,3,4]},
 {id:2,callFrame:{functionName:'read',url:'file:///workspace/employeeHomeGrpcSnapshot.js',lineNumber:20,columnNumber:1},args:{password:'PRIVATE_ARGUMENT'}},
 {id:3,callFrame:{functionName:'PRIVATE_FUNCTION',url:'https://private.example/node_modules/private/employeeHomeGrpcSnapshot.js'}},
 {id:4,callFrame:{functionName:'(garbage collector)',url:''}}],samples:[2,3,4,2],timeDeltas:[1000,2000,60000,NaN]};
test('CPU summary includes only bounded code/timing metadata, flags gaps and missing samples, strips URLs/args/private names',()=>{
 const summary=summarize(profile);assert.equal(summary.samples,4);assert.equal(summary.missingDeltas,1);assert.equal(summary.gapsOver50ms,1);
 assert.equal(summary.frames[0].function,'(garbage collector)');assert.equal(summary.frames.find(f=>f.function==='read').module,'app');
 assert.doesNotMatch(JSON.stringify(summary),/PRIVATE|private\.example|https:|args|password|workspace/);
 assert.throws(()=>summarize({nodes:[],samples:[],timeDeltas:null}),TypeError);
});
test('normal reads create no profiler; explicit source diagnostic runs once, preserves output and sanitizes memory',async()=>{
 let created=0,connected=0,disconnected=0,calls=0;const records=[];
 const diagnostic=create({record:r=>records.push(r),readMemory:()=>({rssMiB:100,heapLimitMiB:256,private:'PRIVATE_MEMORY'}),makeSession:()=>{created++;return {connect(){connected++},disconnect(){disconnected++},post(method,_params,callback){callback(null,method==='Profiler.stop'?{profile}:{})}}}});
 assert.equal(await diagnostic({nonce:'ordinary_nonce'},async()=>++calls),1);assert.equal(created,0);
 assert.equal(await diagnostic({nonce:'qaCpu_secure_random'},async()=>++calls),2);assert.equal(created,1);assert.equal(connected,1);assert.equal(disconnected,1);
 assert.equal(records.length,1);assert.equal(records[0].profileComplete,true);assert.equal(records[0].ok,true);assert.deepEqual(records[0].memoryBefore,{rssMiB:100,heapLimitMiB:256});assert.doesNotMatch(JSON.stringify(records),/PRIVATE|ordinary_nonce|qaCpu_secure_random/);
 await assert.rejects(diagnostic({nonce:'qaCpu_second'},async()=>++calls),{code:'home_cpu_diagnostic_already_used'});assert.equal(calls,2);
});
test('diagnosis preserves source error; unavailable profiler refuses to execute a source read and leaks no raw exception',async()=>{
 const records=[],diagnostic=create({record:r=>records.push(r),makeSession:()=>({connect(){},disconnect(){},post(method,_params,cb){cb(null,method==='Profiler.stop'?{profile}:{})}})});
 const original=Object.assign(new Error('PRIVATE_SOURCE_ERROR'),{code:'home_snapshot_timeout'});
 await assert.rejects(diagnostic({nonce:'qaCpu_diagnostic'},async()=>{throw original}),error=>error===original);assert.equal(records[0].ok,false);assert.equal(records[0].profileComplete,true);assert.doesNotMatch(JSON.stringify(records),/PRIVATE_SOURCE_ERROR/);
 let source=0;const unavailable=create({record(){},makeSession:()=>({connect(){throw Error('PRIVATE_SESSION_ERROR')},disconnect(){}})});
 await assert.rejects(unavailable({nonce:'qaCpu_diagnostic'},async()=>{source++}),{code:'home_cpu_diagnostic_unavailable'});assert.equal(source,0);
});
