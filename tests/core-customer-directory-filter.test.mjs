import test from 'node:test';
import assert from 'node:assert/strict';
import baseline from './fixtures/customer-directory-filter.baseline.mjs';
import {appFunction} from './helpers/app-source-function.mjs';
import {createBoundedCollationCompare} from '../src/services/collationCompareCache.js';
import {hasSearchQuery,rankCustomerSearchResults} from '../src/services/searchEngine.js';

const names=['Đức','Duc','Hồng','hồng','Gà 2','Gà 10','An','AN','Dũng','Dung','Túi','Thu','💬'];
const customers=Array.from({length:137},(_,i)=>Object.freeze({id:'c'+i,name:names[i%names.length],displayName:i%3?'':names[(i+1)%names.length],
  phone:'090000'+i,address:'Synthetic '+i,empId:'e'+i%3,totalRevenue:i%7+.1,currentDebt:i%4?i:0,creditBalance:i%4?0:i,
  customerProductIds:['p'+i%3],orders:Array.from({length:i%9},(_,j)=>({date:j%2?'2026-10-24':'2026-10-23',createdAt:'2026-10-24T08:00:00Z'})),
  payments:[{date:'2026-10-24',createdAt:'2026-10-24T09:00:00Z'}]}));
const create=values=>new Function(...Object.keys(values),'return '+baseline.toString())(...Object.values(values));
for(const mode of ['default','revenue','revenue_desc','revenue_asc','date'])test('actual directory retains exact stable order/search/filters: '+mode,()=>{
  const compareCustomerNames=createBoundedCollationCompare(new Intl.Collator('vi'));
  for(const keyword of ['','ga','hồng','nonexistent'])for(const canSeeCustomerDebt of [false,true])for(const canSeeCustomerStats of [false,true]){
    const values={customerSummaries:customers,debouncedCustomerSearch:keyword,customerStatusFilter:canSeeCustomerStats?'debt':'credit',
      customerSortFilter:mode,customerDateFilter:'2026-10-24',customerManagerFilter:canSeeCustomerDebt?'e1':'all',
      canSeeCustomerStats,canSeeCustomerDebt,canSeeCustomerLocation:canSeeCustomerDebt,
      activeProductForPricingLookup:new Map([['p1',{name:'Gà'}]]),employees:[{id:'e1',name:'Synthetic manager',phone:'0900000'}],
      hasTokenSearchQuery:hasSearchQuery,rankCustomerSearchResults,buildCustomerNameAliases:c=>[c.name,c.displayName],
      getCustomerLocationShareText:c=>c.address,getTodayString:()=> '2026-10-24',
      getDateKeyFromAnyValue:v=>String(v||'').slice(0,10),getEntityTimestamp:r=>Date.parse(r.createdAt||r.date)||0};
    const before=create(values),after=appFunction('filteredCustomers',{...values,compareCustomerNames},{scope:'CustomerCRMView',memoCallback:true});
    assert.deepEqual(after(),before());
  }
});

test('date activity scanning is bounded per customer in the real callback rather than repeated by sort comparisons',()=>{
  let reads=0;
  const values={customerSummaries:customers,debouncedCustomerSearch:'',customerStatusFilter:'all',customerSortFilter:'date',customerDateFilter:'2026-10-24',customerManagerFilter:'all',
    hasTokenSearchQuery:()=>false,canSeeCustomerStats:true,canSeeCustomerDebt:true,
    getDateKeyFromAnyValue:v=>{reads++;return String(v||'').slice(0,10)},getEntityTimestamp:r=>Date.parse(r.createdAt||r.date)||0,
    compareCustomerNames:createBoundedCollationCompare(new Intl.Collator('vi'))};
  const actual=appFunction('filteredCustomers',values,{scope:'CustomerCRMView',memoCallback:true});
  actual();assert.equal(reads,customers.reduce((sum,c)=>sum+c.orders.length+c.payments.length+1,0));
});
