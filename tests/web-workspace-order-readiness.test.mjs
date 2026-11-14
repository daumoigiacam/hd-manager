import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createOrderProductAdapter} from '../development/hd-manager/application/src/features/orders/orderProductAdapter.js';
import {hasCommittedServerSnapshot} from '../development/hd-manager/application/src/services/realtimeReadFreshness.js';
const stale=()=>Object.assign(Error('feed changed'),{code:'stale-checkpoint'});
const fixture=page=>createOrderProductAdapter({business:{page},capabilities:null});
test('first page retries one concurrent feed publication, without changing its query',async()=>{
 const calls=[],adapter=fixture(async(source,query)=>{calls.push({source,query});if(calls.length===1)throw stale();return {items:[{id:'o1',document:{amount:420,code:'QA'}}],metadata:{checkpoint:'new'}};});
 const result=await adapter.page({search:'gà',from:'2026-11-01',to:'2026-11-14'});
 assert.equal(calls.length,2);assert.deepEqual(calls[0],calls[1]);assert.equal(result.rows[0].amount,420);assert.equal(result.metadata.checkpoint,'new');
});
test('cursor, authorization failure and repeated checkpoint races remain visible',async()=>{
 for(const [after,error,expectedCalls] of [[{id:'page-2'},stale(),1],[null,Object.assign(Error('deny'),{code:'permission-denied'}),1],[null,stale(),2]]){
  let calls=0;const adapter=fixture(async()=>{calls++;throw error;});await assert.rejects(()=>adapter.page({after}),e=>e===error);assert.equal(calls,expectedCalls);
 }
});
test('the complete online order view requests every source required by its ledger gate',()=>{
 const source=readFileSync(new URL('../development/hd-manager/application/src/App.jsx',import.meta.url),'utf8');
 const plan=source.match(/orders:\s*\[([^\]]+)\]/)[1];
 const required=source.match(/const mainLedgerSourcesReady[\s\S]*?collections:\s*\[([^\]]+)\]/)[1];
 const names=text=>[...text.matchAll(/'([^']+)'/g)].map(x=>x[1]);
 for(const name of names(required))assert(names(plan).includes(name),'Orders would wait forever for '+name);
});
test('a received but cancelled publication cannot suppress the next report read',()=>{
 const current={principalId:'a',tenantId:'t1',ownerKey:'session1',collection:'deliveryReports',pending:false,
  readiness:{actorUid:'a',serverConfirmed:{tenantId:'t1',ownerKey:'session1',collections:{deliveryReports:true}}}};
 assert.equal(hasCommittedServerSnapshot(current),true);
 assert.equal(hasCommittedServerSnapshot({...current,pending:true}),false);
 assert.equal(hasCommittedServerSnapshot({...current,readiness:{...current.readiness,serverConfirmed:{...current.readiness.serverConfirmed,collections:{deliveryReports:false}}}}),false);
 for(const change of [{principalId:'b'},{tenantId:'t2'},{ownerKey:'session2'},{collection:'orders'},{readiness:null}])assert.equal(hasCommittedServerSnapshot({...current,...change}),false);
});
