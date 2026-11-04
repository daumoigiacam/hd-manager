import test from 'node:test';import assert from 'node:assert/strict';
import {bindScopedReadPublication}from'../src/services/scopedReadPublication.js';
test('previous principal cannot queue or commit a deferred read into a new session',()=>{
 const queued=[];let current=true;const publish=bindScopedReadPublication(update=>queued.push(update),()=>current);
 publish([{id:'old-actor-private'}]);assert.equal(queued.length,1);current=false;const next=[{id:'new-actor-private'}];assert.equal(queued[0](next),next);publish([]);assert.equal(queued.length,1);
});
test('same owner preserves exact value/function state-update semantics and does not invoke obsolete updaters',()=>{
 let current=true,calls=0,state=[];const queued=[],publish=bindScopedReadPublication(update=>queued.push(update),()=>current);
 const rows=[{id:'safe'}];publish(rows);state=queued.shift()(state);assert.equal(state,rows);
 publish(previous=>{calls++;assert.equal(previous,rows);return previous});assert.equal(queued.shift()(state),rows);assert.equal(calls,1);
 publish(()=>{calls++;throw Error('obsolete read must never execute')});current=false;assert.equal(queued.shift()(rows),rows);assert.equal(calls,1);
});
