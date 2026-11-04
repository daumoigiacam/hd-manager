import test from 'node:test';
import assert from 'node:assert/strict';
import {currentDebtAnswer,debtDiagnosticBasePage} from '../scripts/helpers/debt-search-observation.mjs';
import {getCustomerSearchFields} from '../src/services/searchEngine.js';

test('debt diagnostic reads only committed current-root rows in old and prepared cohorts',()=>{
 const original=globalThis.document;
 try{
  const staleRows=[{id:'old',name:'Stale',ledger:{currentDebt:999}}],rows=[{id:'new',name:'Current',ledger:{currentDebt:80}}];
  for(const prepared of [false,true]){
   const deps=prepared?[rows,'current',rows,'latest','all']:[rows,null,'all','latest','all','current'];
   const current={child:{memoizedProps:{canViewAssignedDebt:true,customers:rows},memoizedState:{memoizedState:[rows,deps],next:null}}};
   const old={memoizedProps:{canViewAssignedDebt:true,customers:staleRows},memoizedState:{memoizedState:[staleRows,[staleRows,null,'all','latest','all','old']],next:null},stateNode:{current}};
   const main={'__reactFiber$test':old};globalThis.document={querySelector:()=>main};
   assert.deepEqual(currentDebtAnswer(),{query:'current',rows:[{id:'new',name:'Current',debt:80}],base:rows,filter:'all'});
   old.stateNode.current=null;assert.equal(currentDebtAnswer(),null,'no fallback to an obsolete DOM expando branch');
  }
 }finally{if(original===undefined)delete globalThis.document;else globalThis.document=original;}
});

test('bounded diagnostic pages retain the complete search oracle but exclude transaction trees',()=>{
 const previous=globalThis.window;
 try{
  const row={id:'fiction-only',name:'Giả Lập',plainName:'gia lap',displayName:'Display',customerHonorific:'Chị',shopName:'Shop',storeName:'Store',businessName:'Business',companyName:'Company',contactName:'Contact',contactPerson:'Person',searchAliases:['alias'],phone:'0900000000',phoneNumber:'0900000001',zaloContact:'zalo',zaloPhone:'0900000002',code:'FIC',customerCode:'FIC2',address:'Address',locationInput:'Input',area:'Area',region:'Region',route:'Route',routeName:'RouteName',branches:[{name:'B',phone:'01'}],customerBranches:[{address:'B2'}],deliveryBranches:[{code:'B3'}],customerGroup:'Group',group:'G',groupName:'Name',managerName:'Manager',note:'Note',notes:'Notes',searchText:'Search',ledger:{currentDebt:80,creditBalance:20,transactions:[{large:'omitted'}]},debtTransactions:[{large:'omitted'}]};
  globalThis.window={__upgradeDebtAnswer:()=>({base:[row,row]})};
  const page=debtDiagnosticBasePage(1,1);assert.equal(page.length,1);
  assert.deepEqual(getCustomerSearchFields(page[0]),getCustomerSearchFields(row));
  assert.deepEqual(page[0].ledger,{currentDebt:80,creditBalance:20});
  assert.equal('debtTransactions' in page[0],false);
 }finally{if(previous===undefined)delete globalThis.window;else globalThis.window=previous;}
});
