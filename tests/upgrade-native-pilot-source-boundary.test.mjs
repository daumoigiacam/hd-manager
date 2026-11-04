import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyNativePilotWebBoundary} from '../scripts/helpers/native-pilot-source-boundary.mjs';
const identity=()=>({files:[{file:'assets/index-a.js',bytes:10,sha256:'one'},{file:'index.html',bytes:8,sha256:'two'},{file:'version.json',bytes:79,sha256:'three'}]});
const version=()=>({buildId:'same-demo-build',builtAt:'2026-11-03T12:00:00.000Z'});
test('retain truthful differing build timestamps while requiring identical runtime assets and buildId',()=>{
 const before=identity(),after=identity(),a=version(),b={...version(),builtAt:'2026-11-03T14:00:00.000Z'};
 after.files[2].sha256='new-timestamp';
 const result=verifyNativePilotWebBoundary(before,after,a,b);
 assert.equal(result.sameRuntimeAssets,true);assert.equal(result.versionTimestampOnly.after,b.builtAt);
});
test('JS, HTML, asset additions/removals and build identity changes cannot be masked by a timestamp exemption',()=>{
 for(const mutate of [x=>x.files[0].sha256='changed',x=>x.files[1].bytes++,x=>x.files.pop(),x=>x.files.push({file:'extra.js',bytes:1,sha256:'x'})]){
  const after=identity();mutate(after);
  assert.throws(()=>verifyNativePilotWebBoundary(identity(),after,version(),version()));
 }
 assert.throws(()=>verifyNativePilotWebBoundary(identity(),identity(),version(),{...version(),buildId:'another'}));
 assert.throws(()=>verifyNativePilotWebBoundary(identity(),identity(),version(),{...version(),hiddenFlag:true}));
});
