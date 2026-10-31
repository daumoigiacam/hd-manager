import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {appFunction} from './helpers/app-source-function.mjs';
import {sortProjection,runCooperativeProjection} from '../src/services/cooperativeProjection.js';
const frozen=readFileSync(new URL('./fixtures/visible-requests.baseline.mjs',import.meta.url),'utf8');
const baseline=new Function('return '+frozen.slice(frozen.indexOf('export default ')+15))();
function bindings(sales){return {
  useMemo:f=>f(),sortProjection,requestProjectionAttempt:0,
  latestOrderRequests:Array.from({length:450},(_,i)=>({id:'r'+i,isArchived:i%31===0,salesEmpId:i%2?'a':'b',date:'2026-10-02',
    createdAt:i%7,customerId:'c',items:[{productId:'p',quantity:i,unitPrice:125000}]})),
  canEmployeeViewRequest:row=>!sales || row.salesEmpId==='a',resolveOrderRequestDateKey:row=>row.date,
  getVisibleRequest:(row,requestDateKey,customer,primaryProduct)=>({...row,requestDateKey,customer,primaryItem:row.items[0],primaryProduct}),
  requestCustomerLookup:new Map([['c',{id:'c',name:'Customer'}]]),requestProductLookup:new Map([['p',{id:'p',name:'Product'}]]),
  requestWorkingDate:'2026-10-02',canViewAllRequests:!sales,isSales:sales,salesVisibleEmployeeIdSet:new Set(['a']),
  getEntityTimestamp:row=>row.createdAt,
};}
test('cooperative request rows keep permissions, full product attributes/amounts and stable tied timestamps',async()=>{
  for(const sales of [false,true]){
    const input=bindings(sales),before=structuredClone(input.latestOrderRequests);let yields=0;
    const factory=appFunction('prepareVisibleRequests',input,{scope:'OrderRequestView'});
    const result=await runCooperativeProjection(factory,{maxOperations:1,yieldTask:async()=>{yields++;}});
    assert.deepEqual(result,baseline(input));assert.ok(yields>20);assert.deepEqual(input.latestOrderRequests,before);
    assert.ok(result.every(row=>!row.isArchived && (!sales || row.salesEmpId==='a')));
  }
});
test('new request source cancels old row preparation before partial publication',async()=>{
  const input=bindings(false),controller=new AbortController();let count=0,published=false;
  await assert.rejects(runCooperativeProjection(appFunction('prepareVisibleRequests',input,{scope:'OrderRequestView'}),{
    signal:controller.signal,maxOperations:1,yieldTask:async()=>{if(++count===2)controller.abort();},
  }).then(()=>{published=true;}),{name:'AbortError'});
  assert.equal(published,false);
});
