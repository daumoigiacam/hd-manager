import test from 'node:test';import assert from 'node:assert/strict';
import {createCollectionCommitWitness} from '../src/services/collectionCommitWitness.js';

test('REST server receipt/queued transitions cannot claim ready before the exact collection commits',()=>{
 let states={},current=true;const confirmed=[],scheduled=[];
 const witness=createCollectionCommitWitness({isCurrent:()=>current,getCommittedStates:()=>states,onCommitted:name=>confirmed.push(name),
  schedule:callback=>{scheduled.push(callback);return callback},cancel:()=>{}});
 const a=Object.freeze([{amount:1}]),b=Object.freeze([{amount:2}]);
 const first=witness.begin('expenses');witness.expectCommit('expenses',first,a);witness.publicationScheduled();
 assert.deepEqual(confirmed,[]);const second=witness.begin('expenses');witness.expectCommit('expenses',first,a);
 states={expenses:a};witness.confirmCommitted();assert.deepEqual(confirmed,[],'obsolete source cannot satisfy newer generation');
 witness.expectCommit('expenses',second,b);witness.publicationScheduled();states={expenses:b};witness.confirmCommitted();
 assert.deepEqual(confirmed,['expenses']);witness.confirmCommitted();assert.deepEqual(confirmed,['expenses']);
 const noop=witness.begin('expenses');witness.expectCommit('expenses',noop,b);witness.publicationScheduled();
 assert.deepEqual(confirmed,['expenses','expenses'],'no-op state needs no extra React render');
 const abandoned=witness.begin('orders');witness.expectCommit('orders',abandoned,a);current=false;states.orders=a;
 scheduled.forEach(callback=>callback());witness.confirmCommitted();assert.equal(confirmed.length,2);
 witness.close();assert.equal(witness.begin('orders'),null);
});

test('closing before publication clears pending identities and any scheduled confirmation',()=>{
 let cancelled=0;const confirmed=[],value=[];
 const witness=createCollectionCommitWitness({getCommittedStates:()=>({orders:value}),onCommitted:name=>confirmed.push(name),
  schedule:()=>10,cancel:id=>{assert.equal(id,10);cancelled++}});
 const generation=witness.begin('orders');witness.publicationScheduled();witness.close();
 witness.expectCommit('orders',generation,value);witness.confirmCommitted();
 assert.equal(cancelled,1);assert.deepEqual(confirmed,[]);assert.equal(witness.isPublicationCurrent('orders',generation),false);
});
