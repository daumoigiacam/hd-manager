import test from'node:test';import assert from'node:assert/strict';
import{cashflowQueueGroups}from'../src/features/finance/cashflowQueuePresentation.js';
test('folded history never hides pending, failed, conflicting or missing receipts and never changes amounts or IDs',()=>{
 const rows=['PENDING_SYNC','SYNCING','SYNC_FAILED','CONFLICT_REQUIRES_REVIEW','LOCAL_ONLY','SYNCED','SYNCED'].map((state,index)=>({id:'qa'+index,state,input:{amount:1000+index},receipt:index===6?{outcome:'accepted'}:null}));
 const before=JSON.stringify(rows),result=cashflowQueueGroups(rows);
 assert.equal(result.pending.length,6);assert.deepEqual(result.confirmed,[rows[6]]);assert.equal(JSON.stringify(rows),before);
 assert.deepEqual([...result.pending,...result.confirmed].map(row=>row.id).sort(),rows.map(row=>row.id).sort());
});
