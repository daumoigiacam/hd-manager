import test from 'node:test';import assert from 'node:assert/strict';
import {buildPricingEngineSnapshot} from '../src/services/pricingEngineService.js';
test('immutable pricing source reuse keeps current rule results, isolates returned rows and invalidates for source/day/company changes',()=>{
 let reads=0;
 const order={id:'o',get date(){reads++;return '2026-11-02'},items:[{productId:'p',productName:'Vịt',quantity:2,unit:'kg',price:50000,amount:100000}]};
 const base={currentCompany:{id:'a'},products:[{id:'p',name:'Vịt',unit:'kg',price:50000}],orders:[order],date:new Date('2026-11-02T12:00:00Z')};
 const expected=buildPricingEngineSnapshot(base);reads=0;
 const first=buildPricingEngineSnapshot({...base,reuseImmutableSales:true});assert.deepEqual(first,expected);assert(reads>0);
 first.salesRows[0].monthRevenue=-1;first.salesRows.push({productName:'caller mutation'});
 reads=0;const rules=[{targetMargin:35}];const next=buildPricingEngineSnapshot({...base,pricingRules:rules,reuseImmutableSales:true});
 assert.equal(reads,0,'editing rules/reopening must not scan the same order history');
 assert.deepEqual(next,buildPricingEngineSnapshot({...base,pricingRules:rules}));
 for(const patch of [{orders:[...base.orders]},{products:[...base.products]},{date:new Date('2026-11-03T12:00:00Z')},{currentCompany:{id:'b'}}]){
  reads=0;buildPricingEngineSnapshot({...base,...patch,reuseImmutableSales:true});assert(reads>0,'changed immutable inputs or scope/day require recalculation');
 }
});
test('uncached default continues to support callers that replace fields inside mutable source arrays',()=>{
 const line={productId:'p',quantity:2,unit:'kg',price:50000,amount:100000};
 const input={products:[{id:'p',name:'Vịt',unit:'kg',price:50000}],orders:[{id:'o',date:'2026-11-02',items:[line]}],date:new Date('2026-11-02T12:00:00Z')};
 const first=buildPricingEngineSnapshot(input);line.amount=200000;
 const second=buildPricingEngineSnapshot(input);assert.notEqual(first.totals.monthlyRevenue,second.totals.monthlyRevenue);
});
