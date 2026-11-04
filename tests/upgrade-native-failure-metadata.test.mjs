import test from'node:test';import assert from'node:assert/strict';import fs from'node:fs';import vm from'node:vm';
const source=fs.readFileSync('performance/phase2-verification/VerificationActivity.java','utf8');
const raw=source.match(/String script="([^\r\n]*)";/)?.[1];if(!raw)throw Error('Native diagnostic script boundary missing');const script=JSON.parse('"'+raw+'"');
test('native failure metadata distinguishes a stale React branch without marking anything ready',()=>{
 const stateNode={},oldRoot={stateNode},currentRoot={stateNode};stateNode.current=currentRoot;
 const props=ready=>({currentUser:{companyId:'synthetic-company'},serverConfirmedCollectionState:{tenantId:'synthetic-company',collections:{companies:true,employees:true,orders:ready}},homeReadinessCollections:['orders']});
 const oldProps=props(false),newProps=props(true),first={return:{memoizedProps:oldProps,return:oldRoot}},alternate={return:{memoizedProps:newProps,return:currentRoot}};first.alternate=alternate;
 const main={__reactFiber$fixture:first,getAttribute:()=> 'home'},scope={document:{querySelector:()=>main},window:{__hdModulePending:()=>false,__hdVerification:{errors:[],rejections:0}}};
 const result=vm.runInNewContext(script,scope);assert.equal(result.branches[0].rootIsCurrent,false);assert.ok(result.branches[0].missing.includes('orders'));assert.equal(result.branches[1].rootIsCurrent,true);assert.equal(result.branches[1].missing.length,0);assert.equal(oldProps.serverConfirmedCollectionState.collections.orders,false);
 assert.ok(!JSON.stringify(result).includes('synthetic-company'));assert.equal(result.pending,false);
});
test('missing view and unobservable branch cannot be interpreted as a verified readiness contract',()=>{
 const result=vm.runInNewContext(script,{document:{querySelector:()=>null}});assert.equal(result.module,null);assert.equal(result.branches.length,0);
});
