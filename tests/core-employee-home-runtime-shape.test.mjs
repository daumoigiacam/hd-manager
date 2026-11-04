import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const {sanitizeHomeRuntimeShape:sanitize,logHomeRuntimeShape:log,readHomeRuntimeShape:read}=createRequire(import.meta.url)('../functions/employeeHomeRuntimeShape');
test('startup metadata exports only finite known memory/space/flag fields and static runtime, not arguments or secrets',()=>{
 const safe=sanitize({runtime:'v22.23.4',heapLimitMiB:412,rssMiB:130,heapUsedMiB:NaN,availableParallelism:2,spaces:[{name:'new_space',sizeMiB:2,usedMiB:1,path:'PRIVATE'}, {name:'PRIVATE',sizeMiB:40}],flags:{maxOldSpaceMiB:364,maxSemiSpaceMiB:16,require:'PRIVATE'},NODE_OPTIONS:'PRIVATE',token:'PRIVATE'});
 assert.equal(safe.spaces.length,1);assert.equal(safe.spaces[0].name,'new_space');assert.equal(safe.heapLimitMiB,412);assert.equal(safe.flags.maxSemiSpaceMiB,16);assert.doesNotMatch(JSON.stringify(safe),/PRIVATE|NODE_OPTIONS|token|path|require/);
 assert.deepEqual(sanitize({runtime:'bad',rssMiB:-1,availableParallelism:0,spaces:null}).spaces,[]);
});
test('startup logger never samples or logs in CLI discovery, other projects/functions or ordinary app runtimes',()=>{
 let reads=0;const records=[],options={read:()=>{reads++;return {runtime:'v22.23.4',heapLimitMiB:412,spaces:[{name:'new_space',sizeMiB:2}]}},record:value=>records.push(value)};
 const allowed={GCLOUD_PROJECT:'hd-manager-c5839',FUNCTION_TARGET:'employeeHomeBootstrapRegional',K_SERVICE:'employeehomebootstrapregional'};
 for(const env of [{},{...allowed,GCLOUD_PROJECT:'demo-local'},{...allowed,FUNCTION_TARGET:'identityLoginRegional'},{...allowed,K_SERVICE:'other'}])assert.equal(log({...options,env}),false);
 assert.equal(reads,0);assert.equal(log({...options,env:allowed}),true);assert.equal(reads,1);assert.equal(records.length,1);assert.equal(records[0].heapLimitMiB,412);
 assert.equal(log({...options,env:allowed,read(){throw Error('PRIVATE_METADATA_ERROR')}}),false);
});
test('real local runtime shape contains bounded space metadata without requiring Firebase or opening an inspector',()=>{
 const metadata=sanitize(read());assert(metadata.heapLimitMiB>0);assert(metadata.spaces.some(s=>s.name==='new_space'));assert(Object.keys(metadata).every(k=>!['env','args','documents','headers'].includes(k)));
});
