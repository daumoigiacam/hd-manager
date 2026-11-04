import test from 'node:test';
import assert from 'node:assert/strict';
import {appFunction} from './helpers/app-source-function.mjs';
import {runBefore} from './fixtures/debt-search-prepared-before.mjs';
import {hasSearchQuery,searchCustomers,createSearchRecordIndexAsync,getCustomerSearchFields} from '../src/services/searchEngine.js';

const customers=Object.freeze(Array.from({length:1000},(_,i)=>Object.freeze({
 id:`fiction-customer-${i}`,name:i%29===0?`Khách Giả Lập Ánh Sao ${i}`:`Synthetic Customer ${i}`,
 empId:`sales-${i%3}`,allowedDriverIds:i%2?['driver']:[],isArchived:i%37===0,
 address:`Quận ${i%12}`,phone:`090${String(i).padStart(7,'0')}`,
 ledger:Object.freeze({currentDebt:i%5?i*100:0,creditBalance:i%5?0:i*50}),
 debtTransactions:Object.freeze([{dateKey:`2026-10-${String(i%28+1).padStart(2,'0')}`}]),
 latestDebtTransactionAt:i%11,oldestDebtTransactionAt:i%7
})));

test('actual new debt callbacks preserve all pre-change IDs, order and monetary object identities across filters',async()=>{
 const initial=JSON.stringify(customers);let combinations=0;
 for(const debtViewFilter of ['all','debt','credit'])for(const debtSalesEmpId of ['all','sales-1'])for(const debtDateRange of [null,{start:'2026-10-08',end:'2026-10-21'}]){
  const accessibleCustomers=customers.filter(c=>!c.isArchived);
  const base=appFunction('debtBaseCustomers',{accessibleCustomers,debtViewFilter,debtSalesEmpId,debtDateRange},{memoCallback:true,scope:'DebtManagementView'})();
  const index=await createSearchRecordIndexAsync(base,getCustomerSearchFields);
  for(const debtTransactionSort of ['latest','oldest','debt_desc','debt_asc'])for(const query of ['', 'gia lap anh', 'Synthetic Customer 99','no-match-fictional']){
   const old=runBefore({accessibleCustomers,debtViewFilter,debtSalesEmpId,debtDateRange,debtTransactionSort,debouncedDebtSearchKeyword:query,hasTokenSearchQuery:hasSearchQuery,searchCustomerRecords:searchCustomers});
   const answer=await index.searchAsync(query);
   const actual=appFunction('filteredCustomers',{debtBaseCustomers:base,debtViewFilter,debtTransactionSort,debtSearchQuery:query,preparedDebtSearch:{results:answer},hasTokenSearchQuery:hasSearchQuery},{memoCallback:true,scope:'DebtManagementView'})();
   assert.deepEqual(actual.map(c=>c.id),old.map(c=>c.id));
   actual.forEach((row,i)=>{assert.strictEqual(row,old[i]);assert.strictEqual(row.ledger,old[i].ledger)});combinations++;
  }
 }
 assert.equal(combinations,192);assert.equal(JSON.stringify(customers),initial);
});

test('actual access filtering still excludes archived, foreign-assigned and unauthorized customers before search',()=>{
 for(const [all,assigned,driver,id]of[[true,false,false,'sales-1'],[false,true,false,'sales-1'],[false,true,true,'driver'],[false,false,false,'sales-1']]){
  const actual=appFunction('accessibleCustomers',{customerLedgers:customers,canViewAllDebtRecords:all,canViewAssignedDebtRecords:assigned,isDriver:driver,employee:{id}},{memoCallback:true,scope:'DebtManagementView'})();
  const expected=customers.filter(c=>!c.isArchived&&(all||(assigned&&(driver?c.allowedDriverIds.includes(id):c.empId===id))));
  assert.deepEqual(actual,expected);
 }
});
