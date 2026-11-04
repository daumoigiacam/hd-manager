import test from 'node:test';import assert from 'node:assert/strict';
import {qaHeapFunction,qaHeapOptions,prepareQaHeapPatch as prepare,verifyQaHeapPatch as verify,assertQaHeapService as guard} from '../scripts/helpers/employee-home-heap-config.mjs';
const fixture=()=>({name:qaHeapFunction,state:'ACTIVE',environment:'GEN_2',buildConfig:{runtime:'nodejs22',entryPoint:'employeeHomeBootstrapRegional'},serviceConfig:{availableMemory:'512M',availableCpu:'1',minInstanceCount:0,maxInstanceCount:1,maxInstanceRequestConcurrency:1,timeoutSeconds:15,serviceAccountEmail:'synthetic-only',environmentVariables:{KEEP:'PRIVATE_VALUE',FUNCTION_TARGET:'employeeHomeBootstrapRegional'},secretEnvironmentVariables:[{key:'SECRET_REFERENCE',secret:'synthetic-only'}]}});
test('QA heap patch changes only one target map entry and rollback restores exact unrelated configuration',()=>{
 const before=fixture(),copy=structuredClone(before),patch=prepare(before,'apply');assert.deepEqual(before,copy);assert.deepEqual(Object.keys(patch),['name','serviceConfig']);assert.deepEqual(Object.keys(patch.serviceConfig),['environmentVariables']);assert.equal(patch.serviceConfig.environmentVariables.KEEP,'PRIVATE_VALUE');assert.equal(patch.serviceConfig.environmentVariables.NODE_OPTIONS,qaHeapOptions);
 const after={...before,serviceConfig:{...before.serviceConfig,...patch.serviceConfig}};assert.deepEqual(verify(before,after,'apply'),{verified:true,otherEnvironmentUnchanged:true,resourceAndSecuritySettingsUnchanged:true});
 const restored={...after,serviceConfig:{...after.serviceConfig,...prepare(after,'rollback').serviceConfig}};assert.deepEqual(restored,before);assert(verify(after,restored,'rollback').verified);
});
test('heap configuration refuses another function, resource increase, unexpected options and unrelated environment/security mutations',()=>{
 for(const change of [v=>v.name='projects/other/functions/identityLogin',v=>v.buildConfig.runtime='nodejs20',v=>v.serviceConfig.maxInstanceCount=2,v=>v.serviceConfig.availableMemory='1Gi',v=>v.serviceConfig.availableCpu='2',v=>v.serviceConfig.maxInstanceRequestConcurrency=2,v=>v.state='DEPLOYING']){const f=fixture();change(f);assert.throws(()=>guard(f))}
 const existing=fixture();existing.serviceConfig.environmentVariables.NODE_OPTIONS='--require=PRIVATE_PATH';assert.throws(()=>prepare(existing,'apply'));assert.throws(()=>prepare(existing,'rollback'));
 const before=fixture(),after=structuredClone(before);after.serviceConfig.environmentVariables.NODE_OPTIONS=qaHeapOptions;after.serviceConfig.environmentVariables.KEEP='CHANGED';assert.throws(()=>verify(before,after,'apply'));
 after.serviceConfig.environmentVariables.KEEP='PRIVATE_VALUE';after.serviceConfig.secretEnvironmentVariables=[];assert.throws(()=>verify(before,after,'apply'));
});
