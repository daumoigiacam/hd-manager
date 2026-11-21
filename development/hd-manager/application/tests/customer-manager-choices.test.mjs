import test from 'node:test';
import assert from 'node:assert/strict';
import {customerManagerChoices} from '../src/utils/customerManagerChoices.js';
test('the manager select includes the actual saved owner/current assignee and never silently displays another employee',()=>{
  const sales=[{id:'sales',name:'NVKD'}],employees=[...sales,{id:'owner',name:'Chủ doanh nghiệp'}];
  assert.equal(customerManagerChoices(sales,employees,'sales'),sales);
  assert.deepEqual(customerManagerChoices(sales,employees,'owner'),employees);
  assert.equal(customerManagerChoices(sales,employees,'legacy').at(-1).id,'legacy');
  assert.equal(sales.length,1);
});
