import test from'node:test';import assert from'node:assert/strict';
import{createOfflineSyncEngine}from'../src/data/offlineSyncEngine.js';
test('status observers cannot acknowledge an invalid receipt or interrupt a committed valid receipt',async()=>{
 const scope={tenantId:'a',principalId:'u'},command={commandId:'c',idempotencyKey:'c',payloadDigest:'digest',attempts:1};
 for(const valid of [false,true]){
  let claimed=false,applied=0,failed=0;const statuses=[],session={scope,isCurrent:()=>true,subscribe:()=>()=>{}};
  const repository={async claimDue(){if(claimed)return null;claimed=true;return command;},async countRetryable(){return 0;},async applyReceipt(){applied++;},async failLease(_scope,_command,value){assert.equal(value.code,'invalid-receipt');failed++;}};
  const engine=createOfflineSyncEngine({repository,session,online:()=>true,transport:{async send(){return{...command,...scope,tenantId:valid?'a':'b',outcome:'accepted'};}},onStatus:value=>{statuses.push(value);if(value.stage==='sending'||value.stage==='receipt-applied')throw Error('Observer failure');}});
  try{await engine.drain();assert.equal(applied,valid?1:0);assert.equal(failed,valid?0:1);assert.equal(statuses.filter(row=>row.stage==='receipt-applied').length,valid?1:0);}finally{engine.stop();}
 }
});
