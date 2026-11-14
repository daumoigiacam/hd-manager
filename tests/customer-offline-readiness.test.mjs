import test from 'node:test';
import assert from 'node:assert/strict';
import {customerReadiness} from '../development/hd-manager/application/src/features/customers/customerReadiness.js';
import {createCustomerPageCoordinator} from '../development/hd-manager/application/src/data/customerPageCoordinator.js';

test('Cloud-only CRM cannot confuse Online success with authorized Offline data',()=>{
  assert.equal(customerReadiness({online:true}),'cloud');
  assert.equal(customerReadiness({online:false}),'offline-not-configured');
  assert.equal(customerReadiness({online:false,localFirstRequired:true}),'authorization-unavailable');
  assert.equal(customerReadiness({localFirstRequired:true,setupError:'grant failed'}),'authorization-unavailable');
  assert.equal(customerReadiness({localFirstRequired:true}),'restoring');
  assert.equal(customerReadiness({online:false,localFirstRequired:true,runtimeCurrent:true,supplementsRequested:true}),'sqlite');
  assert.equal(customerReadiness({online:true,localFirstRequired:true,runtimeCurrent:true}),'sqlite');
});
test('Customer page readiness waits for durable commit; failed commit is retried with the old cursor',async()=>{
  let saved={after:'',hasMore:true},commit,fail=false,fetches=0;
  const coordinator=createCustomerPageCoordinator({isCurrent:()=>true,
    fetchPage:async()=>{fetches++;return {records:[{document:{id:'c1'}}],after:'c1',hasMore:false};},
    repository:{serverCursor:async()=>saved,ingestPage:async(records,cursor)=>{
      assert.equal(records[0].document.id,'c1');
      if(fail)throw Error('disk commit failed');
      await new Promise(resolve=>{commit=resolve;});saved=cursor;
    }}});
  let ready=false;
  const pending=coordinator.refresh().then(value=>{ready=true;return value;});
  while(!commit)await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(ready,false);assert.equal(saved.after,'');
  commit();await pending;assert.equal(ready,true);assert.equal(saved.after,'c1');
  fail=true;await assert.rejects(coordinator.refresh(),/disk commit failed/);
  assert.equal(saved.after,'c1');
  fail=false;commit=null;const retry=coordinator.refresh();
  while(!commit)await new Promise(resolve=>setTimeout(resolve,0));
  commit();await retry;assert.equal(fetches,3);assert.equal(saved.after,'c1');
});
