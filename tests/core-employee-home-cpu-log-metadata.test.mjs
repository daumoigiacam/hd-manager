import test from 'node:test';import assert from 'node:assert/strict';
import {sanitizeHomeCpuLog} from '../scripts/helpers/employee-home-cpu-log-metadata.mjs';
test('CPU log export keeps only bounded static code, timing and memory metadata',()=>{
 const out=sanitizeHomeCpuLog({runtime:'v22.23.2',profileComplete:true,samples:123,memoryBefore:{rssMiB:80,heapUsedMiB:-1,token:'PRIVATE'},
  frames:Array.from({length:30},()=>({module:'@grpc/grpc-js',file:'compression-filter.js',function:'GzipHandler',line:10,selfSampleMs:40,
   args:'PRIVATE',url:'https://PRIVATE',parents:Array.from({length:6},()=>({module:'node:zlib',function:'processCallback',password:'PRIVATE'}))})),raw:'PRIVATE'});
 assert.equal(out.frames.length,20);assert.equal(out.frames[0].parents.length,4);assert.equal(out.frames[0].module,'@grpc/grpc-js');assert.equal(out.runtime,'v22.23.2');
 assert.deepEqual(out.memoryBefore,{rssMiB:80});assert.equal(out.diagnosticOnly,true);assert.doesNotMatch(JSON.stringify(out),/PRIVATE|url|args|password/);
 const bad=sanitizeHomeCpuLog({runtime:'bad',samples:Infinity,frames:[{module:'https://PRIVATE',file:'../PRIVATE.js',function:'https://PRIVATE',selfSampleMs:-1}]});
 assert.deepEqual(bad,{frames:[{parents:[]}],diagnosticOnly:true});
});
