import test from 'node:test';import assert from 'node:assert/strict';
import {localQueueNeedsAttention} from '../src/layout/localQueueAttention.js';
test('only a completely acknowledged page may fold; errors, more pages and unknown or rejected receipts stay open',()=>{
 const accepted={id:'a',state:'SYNCED',receipt:{outcome:'accepted'},amount:67000};
 assert.equal(localQueueNeedsAttention({rows:[accepted]}),false);
 for(const state of ['PENDING_SYNC','SYNCING','SYNC_FAILED','CONFLICT_REQUIRES_REVIEW','LOCAL_ONLY','UNKNOWN'])assert.equal(localQueueNeedsAttention({rows:[{...accepted,state}]}),true);
 for(const receipt of [null,{outcome:'conflict'},{outcome:'rejected'}])assert.equal(localQueueNeedsAttention({rows:[{...accepted,receipt}]}),true);
 assert.equal(localQueueNeedsAttention({rows:[accepted],hasMore:true}),true);
 assert.equal(localQueueNeedsAttention({rows:[],error:true}),true);
 assert.equal(accepted.amount,67000);
});
