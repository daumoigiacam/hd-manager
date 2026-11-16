import test from 'node:test';
import assert from 'node:assert/strict';
import {financeReadIdentity} from '../src/features/finance/offlineFinanceModel.js';

test('background read revision retains only the exact runtime, directory owner and query',()=>{
 const runtime={scope:{tenantId:'a'}},directoryOwner={};
 const first=financeReadIdentity(null,runtime,directoryOwner,'today');
 // A caller can refresh its view wrapper without replacing the data owner.
 assert.equal(financeReadIdentity(first,runtime,directoryOwner,'today'),first);
 assert.notEqual(financeReadIdentity(first,runtime,{},'today'),first);
 assert.notEqual(financeReadIdentity(first,{scope:{tenantId:'a'}},directoryOwner,'today'),first);
 assert.notEqual(financeReadIdentity(first,runtime,directoryOwner,'yesterday'),first);
 assert.notEqual(financeReadIdentity(first,{scope:{tenantId:'b'}},directoryOwner,'today'),first);
});
