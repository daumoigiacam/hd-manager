import test from 'node:test';
import assert from 'node:assert/strict';
import {appFunction} from './helpers/app-source-function.mjs';
import {createProjectionCache} from '../src/services/cooperativeProjection.js';
import {buildFrozenDebtDirectory} from './fixtures/debt-directory-pre-cache.mjs';

function fixture(){
 const customers=Object.freeze([Object.freeze({id:'a',empId:'manager',name:'A'}),Object.freeze({id:'b',empId:'missing',name:'B'})]);
 const employees=Object.freeze([Object.freeze({id:'manager',name:'First'}),Object.freeze({id:'manager',name:'Duplicate'})]);
 const debtLedgerIndex=Object.freeze({a:Object.freeze({balance:125,orders:Object.freeze([Object.freeze({id:'o',date:'2026-10-01',ts:3})]),payments:Object.freeze([Object.freeze({id:'p',date:'2026-10-02',ts:7})])}),b:Object.freeze({balance:0,orders:Object.freeze([]),payments:Object.freeze([])})});
 let calls=0;
 const bindings={customers,employees,debtLedgerIndex,debtDirectoryScope:'company:a:all',debtCustomerDirectoryCache:createProjectionCache(),
  getDateKeyFromAnyValue:v=>{calls++;return typeof v==='string'?v:''},getEntityTimestamp:v=>{calls++;return v.ts||0},
  getPaymentDateKey:v=>v.date||'',getPaymentTimestamp:v=>v.ts||0,
  buildCustomerDebtLimitStatus:(_customer,ledger)=>({exceeded:ledger.balance>100})};
 const run=()=>appFunction('customerLedgers',bindings,{memoCallback:true,scope:'DebtManagementView'})();
 return{bindings,run,calls:()=>calls};
}

test('actual debt directory equals the frozen pre-cache calculation and reopens without rescanning transaction dates',()=>{
 const f=fixture(),expected=buildFrozenDebtDirectory(f.bindings),first=f.run(),calls=f.calls();
 assert.deepEqual(first,expected);assert.equal(first[0].ledger,f.bindings.debtLedgerIndex.a);
 assert.equal(first[0].managerName,'First');assert.equal(first[1].managerName,'Chưa gán');
 assert.equal(first[0].latestDebtTransactionAt,7);assert.equal(first[0].oldestDebtTransactionAt,3);
 assert.equal(f.run(),first);assert.equal(f.calls(),calls,'reopening must not map every order/payment again');
});

test('ledger, customer and employee replacements and authorization scopes cannot reuse a stale directory',()=>{
 const f=fixture();let previous=f.run();
 for(const key of ['debtLedgerIndex','customers','employees']){
  f.bindings[key]=Array.isArray(f.bindings[key])?[...f.bindings[key]]:{...f.bindings[key]};
  const next=f.run();assert.notEqual(next,previous);assert.deepEqual(next,buildFrozenDebtDirectory(f.bindings));previous=next;
 }
 f.bindings.debtDirectoryScope='company:b:assigned';const other=f.run();assert.notEqual(other,previous);
 f.bindings.debtDirectoryScope='company:b:revoked';assert.notEqual(f.run(),other);
 const changed={...f.bindings.debtLedgerIndex,a:{...f.bindings.debtLedgerIndex.a,balance:900,orders:[{id:'new',date:'2026-10-03',ts:12}]}};
 f.bindings.debtLedgerIndex=changed;assert.deepEqual(f.run(),buildFrozenDebtDirectory(f.bindings));assert.equal(previous[0].ledger.balance,125);
});
