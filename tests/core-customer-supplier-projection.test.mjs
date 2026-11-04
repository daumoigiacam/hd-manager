import test from 'node:test';
import assert from 'node:assert/strict';
import baseline from './fixtures/customer-suppliers.baseline.mjs';
import { appFunction } from './helpers/app-source-function.mjs';
import { createSupplierEntryIndex } from '../src/utils/supplierEntryIndex.js';
import { createBoundedCollationCompare } from '../src/services/collationCompareCache.js';

const normalizeLookupText=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').toLowerCase().trim();
const normalizeCustomerPhone=value=>String(value||'').replace(/\D/g,'').replace(/^84/,'0');
const frozen=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(frozen);Object.freeze(value)}return value};

test('actual indexed supplier projection matches frozen grouping, floating amounts, privacy flags and stable Vietnamese ordering',()=>{
  const names=['Đức','Duc','Hồng','hồng','Gà 2','Gà 10','An','AN','', '💬'];
  const customerSummaries=frozen(Array.from({length:117},(_,i)=>({id:'c'+i,name:names[i%names.length],displayName:names[i%names.length],phone:i%7?'090'+i:'',address:'Synthetic '+i,hasPurchaseReconciliation:i%3===0})));
  const safeCustomerWarehouseImports=frozen(Array.from({length:991},(_,i)=>({id:'i'+i,supplierName:names[i%names.length],supplierPhone:i%5?'090'+i%117:'',
    supplierCustomerId:i%4?'':'c'+i%129,amount:i%2?.1:.2,date:i%7?'2026-10-'+String(i%28+1).padStart(2,'0'):'invalid-date',createdAt:i*123,isArchived:i%23===0})));
  for(const canViewSupplierImports of [false,true])for(const canSeeCustomerPhone of [false,true])for(const canSeeCustomerLocation of [false,true]){
    const values={customerSummaries,safeCustomerWarehouseImports,canViewSupplierImports,canSeeCustomerPhone,canSeeCustomerLocation,normalizeLookupText,normalizeCustomerPhone,
      parseLooseMoneyValue:Number,getEntityTimestamp:item=>item.createdAt||0};
    const before=new Function(...Object.keys(values),'return '+baseline.toString())(...Object.values(values));
    const after=appFunction('supplierEntries',{...values,createSupplierEntryIndex,compareSupplierNames:createBoundedCollationCompare(new Intl.Collator('vi'))},{scope:'CustomerCRMView',memoCallback:true});
    assert.deepEqual(after(),before());
  }
});
