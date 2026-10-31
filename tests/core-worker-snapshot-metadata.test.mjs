import test from 'node:test';
import assert from 'node:assert/strict';
import {getRealtimeDataChangeCount,isServerConfirmedRealtimeSnapshot,shouldApplyRealtimeSnapshot}from'../src/services/realtimeFreshness.js';

test('worker metadata preserves unknown versus zero changes and cannot confirm cache or pending writes',()=>{
  const snapshot={kind:'hd-firestore-worker-snapshot-v1',metadata:{fromCache:false,hasPendingWrites:false},dataChangeCount:null};
  assert.equal(getRealtimeDataChangeCount(snapshot),null);
  for(const count of [0,1,500])assert.equal(getRealtimeDataChangeCount({...snapshot,dataChangeCount:count}),count);
  for(const count of [undefined,-1,0.5,'0',NaN])assert.equal(getRealtimeDataChangeCount({...snapshot,dataChangeCount:count}),null);
  assert.equal(isServerConfirmedRealtimeSnapshot(snapshot),true);
  assert.equal(isServerConfirmedRealtimeSnapshot({...snapshot,metadata:{fromCache:true,hasPendingWrites:false}}),false);
  assert.equal(isServerConfirmedRealtimeSnapshot({...snapshot,metadata:{fromCache:false,hasPendingWrites:true}}),false);
  assert.equal(shouldApplyRealtimeSnapshot({...snapshot,metadata:{fromCache:true,hasPendingWrites:false}}),false);
});
