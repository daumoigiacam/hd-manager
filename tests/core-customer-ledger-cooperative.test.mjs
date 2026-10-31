import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {appFunction,appObject} from './helpers/app-source-function.mjs';
import {createCustomerLedgerMapBuilder,createCustomerRecordSelector} from '../src/utils/customerLedgerIndex.js';
import {runCooperativeProjection,sortProjection} from '../src/services/cooperativeProjection.js';
const setLiteral=name=>new Set(appObject(name).arguments[0].elements.map(n=>n.value));
const approvals=Object.fromEntries(appObject('CASHFLOW_APPROVAL_STATUS').properties.map(n=>[n.key.name,n.value.value]));
const isUnconfirmedPaymentIntent=appFunction('isUnconfirmedPaymentIntent',{
  PAYMENT_INTENT_SOURCE_TYPES:setLiteral('PAYMENT_INTENT_SOURCE_TYPES'),UNCONFIRMED_PAYMENT_STATUSES:setLiteral('UNCONFIRMED_PAYMENT_STATUSES')});
const requiresCashflowApproval=appFunction('requiresCashflowApproval',{CASHFLOW_APPROVAL_STATUS:approvals});
const isCashflowOfficial=appFunction('isCashflowOfficial',{isUnconfirmedPaymentIntent,requiresCashflowApproval,CASHFLOW_APPROVAL_STATUS:approvals});
const getPaymentDateKey=r=>r.paymentDate||r.date||'';
const compareLedgerItems=appFunction('compareLedgerItems',{getPaymentDateKey,getDateKeyFromAnyValue:v=>typeof v==='string'?v.slice(0,10):'',
  getEntityTimestamp:r=>Date.parse(r.createdAt||r.date)||0,getPaymentTimestamp:r=>Date.parse(getPaymentDateKey(r))||0});
const bindings={sortProjection,selectCustomerHistoryRows:createCustomerRecordSelector(),compareLedgerItems,getPaymentDateKey,isCashflowOfficial,
  buildCustomerOpeningDebtOrder:appFunction('buildCustomerOpeningDebtOrder',{getCustomerOpeningDebtAmount:r=>Math.max(0,r.openingDebtAmount||0),
    getCustomerOpeningDebtDate:r=>r.openingDebtDate||'2026-09-01',getCustomerDisplayName:r=>r.name||''})};
const ledger=appFunction('buildCustomerLedger',bindings);
const frozen=(name,env)=>{const text=readFileSync(new URL(`./fixtures/${name}.baseline.mjs`,import.meta.url),'utf8');
  return new Function(...Object.keys(env),'return '+text.slice(text.indexOf('export default ')+15))(...Object.values(env));};
const oldLedger=frozen('buildCustomerLedger',bindings);
function input(){return {customers:[{id:'c',companyId:'one',openingDebtAmount:11.1},{id:'other',companyId:'one'},{id:'c',companyId:'one',openingDebtAmount:3.2}],
  orders:Array.from({length:480},(_,i)=>({id:'o'+i%47,customerId:i%7?'c':'other',date:`2026-10-${String(1+i%28).padStart(2,'0')}`,
    amount:i%3?0.1:35.2,isArchived:i%19===0,items:[{quantity:2,unitPrice:3}]})),
  payments:Array.from({length:350},(_,i)=>({id:'p'+i,customerId:i%9?'c':'other',date:`2026-10-${String(1+i%28).padStart(2,'0')}`,
    paymentDate:i%13?'':`2026-09-30`,amount:i%3?0.2:14.6,matchedOrderId:i%3?'':'o'+i%47,
    allocateOldestFirst:i%5===0,allocationMode:i%7?'':'oldest_first',isArchived:i%17===0,
    approvalStatus:i%23?'approved':'pending_handover',status:i%29?'completed':'pending'}))};}
test('cooperative ledger preserves frozen allocations, matched duplicate IDs, chronology, credits and every decimal',async()=>{
  const rows=input(),before=structuredClone(rows);
  for(const customer of rows.customers)for(const orders of [rows.orders,rows.orders.slice(21),[...rows.orders].reverse()]){
    let turns=0;const expected=oldLedger(customer,orders,rows.payments);
    assert.deepEqual(ledger(customer,orders,rows.payments),expected);
    assert.deepEqual(await runCooperativeProjection(()=>ledger(customer,orders,rows.payments,{cooperative:true}),
      {maxOperations:16,yieldTask:async()=>{turns++;}}),expected);assert.ok(turns>10);
  }
  assert.deepEqual(rows,before);
});
test('cooperative indexed maps keep full ledgers isolated through moved/deleted records and tenant/day changes',async()=>{
  const indexed=createCustomerLedgerMapBuilder(ledger),baseline=createCustomerLedgerMapBuilder(oldLedger);const rows=input();
  for(const [customers,orders,payments,day]of [[rows.customers,rows.orders,rows.payments,'one'],
    [rows.customers,rows.orders.map((r,i)=>i? r:{...r,customerId:'other',amount:100}),rows.payments.slice(10),'one'],
    [rows.customers.map(c=>({...c,companyId:'two',openingDebtAmount:9})),[],[],'two'],[rows.customers,rows.orders,rows.payments,'next-day']]){
    assert.deepEqual(await runCooperativeProjection(()=>indexed(customers,orders,payments,day,{cooperative:true}),{yieldTask:async()=>{}}),
      baseline(customers,orders,payments,day));
  }
});
test('cancelled large-customer allocation cannot publish a partial map or poison the complete ledger cache',async()=>{
  const rows=input(),before=structuredClone(rows),build=createCustomerLedgerMapBuilder(ledger),controller=new AbortController();let turns=0,published=false;
  await assert.rejects(runCooperativeProjection(()=>build(rows.customers,rows.orders,rows.payments,'day',{cooperative:true}),
    {signal:controller.signal,maxOperations:16,yieldTask:async()=>{if(++turns===120)controller.abort();}}).then(()=>{published=true;}),{name:'AbortError'});
  assert.equal(published,false);assert.deepEqual(rows,before);
  const complete=await runCooperativeProjection(()=>build(rows.customers,rows.orders,rows.payments,'day',{cooperative:true}),{yieldTask:async()=>{}});
  assert.deepEqual(complete,createCustomerLedgerMapBuilder(oldLedger)(rows.customers,rows.orders,rows.payments,'day'));
});
test('reconciled projection retains supplier matching order, deduplication, repayments and original reconciliation formula',async()=>{
  const rows=input();const env={buildCustomerLedgerMap:(...args)=>createCustomerLedgerMapBuilder(ledger)(...args.slice(0,3),'day',args[3]),
    normalizeCustomerPhone:v=>String(v||'').replace(/\D/g,''),normalizeLookupText:v=>String(v||'').toLowerCase(),getCustomerDisplayName:c=>c.name||'',
    buildCustomerSupplierPurchaseLedger:(c,imports)=>({totalPurchaseDebt:imports.reduce((sum,r)=>sum+r.amount,0),imports}),
    getCustomerDebtRepayments:(c,expenses)=>expenses.filter(e=>e.customerId===c.id&&isCashflowOfficial(e)&&e.companyId===c.companyId),
    applyCustomerSupplierReconciliation:appFunction('applyCustomerSupplierReconciliation',{roundMoneyValue:Math.round,parseLooseMoneyValue:v=>Number(v)||0})};
  const build=appFunction('buildCustomerReconciledLedgerMap',env),old=frozen('buildCustomerReconciledLedgerMap',env);
  const customers=rows.customers.map(c=>({...c,name:'Same',phone:'0123'}));
  const imports=[{supplierCustomerId:'c',supplierPhone:'0123',supplierName:'Same',amount:100},{supplierPhone:'0123',amount:19},
    {supplierName:'Same',amount:17},{supplierCustomerId:'c',isArchived:true,amount:9999}];
  const expenses=[{sourceType:'customer_debt_repayment',customerId:'c',companyId:'one',amount:7,status:'completed'},
    {sourceType:'customer_debt_repayment',customerId:'c',companyId:'foreign',amount:999,status:'completed'}];
  const args=[customers,rows.orders,rows.payments,imports,expenses],before=structuredClone(args);
  assert.deepEqual(await runCooperativeProjection(()=>build(...args,{cooperative:true}),{yieldTask:async()=>{}}),old(...args));
  assert.deepEqual(args,before);
});
