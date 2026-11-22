import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parse} from '@babel/parser';
import {createCustomerRecordSelector} from '../src/utils/customerLedgerIndex.js';

function extract(file,name,env){const source=fs.readFileSync(new URL(file,import.meta.url),'utf8'),tree=parse(source,{sourceType:'module',plugins:['jsx']});let found;
  function walk(n){if(!n||typeof n!=='object')return;if(n.type==='VariableDeclarator'&&n.id?.name===name)found=n.init;
    for(const v of Object.values(n))if(Array.isArray(v))v.forEach(walk);else if(v?.type)walk(v);}
  walk(tree);assert.ok(found,name);return Function(...Object.keys(env),`return (${source.slice(found.start,found.end)});`)(...Object.values(env));}
const ledger=extract('../src/features/customers/productCRMShared.jsx','buildCustomerLedger',{
  selectCustomerHistoryRows:createCustomerRecordSelector(),buildCustomerOpeningDebtOrder:()=>null,
  compareLedgerItems:(a,b)=>String(a.date).localeCompare(String(b.date))||String(a.id).localeCompare(String(b.id)),
  getPaymentDateKey:r=>r.date||'',isCashflowOfficial:r=>!r.requiresApproval||r.approvalStatus==='approved'});
const customer={id:'customer-a',name:'QA customer'},other={id:'customer-b',name:'Other QA'};
const orders=[{id:'older',customerId:customer.id,date:'2026-11-20',amount:100},
  {id:'target',customerId:customer.id,date:'2026-11-21',amount:200,paidAmount:99999}];
const payments=[{id:'oldest',customerId:customer.id,date:'2026-11-22',amount:20,allocateOldestFirst:true},
  {id:'matched',customerId:customer.id,date:'2026-11-22',amount:50,matchedOrderId:'target',allocationMode:'matched_order_first'},
  {id:'pending',customerId:customer.id,date:'2026-11-22',amount:99999,matchedOrderId:'target',requiresApproval:true,approvalStatus:'pending_handover'},
  {id:'archived',customerId:customer.id,date:'2026-11-22',amount:99999,isArchived:true},
  {id:'foreign',customerId:other.id,date:'2026-11-22',amount:99999}];
function builder(allOrders=orders,allPayments=payments,context={current:null}){return extract('../src/features/legacy/MessageCenterView.jsx','buildChatOrderText',{
  attachmentSelectionContext:context,
  customerById:new Map([[customer.id,customer],[other.id,other]]),orders:allOrders,payments:allPayments,buildCustomerLedger:ledger,
  formatDateLabel:String,formatCurrency:String,getEntityTimestamp:()=>0});}

test('order attachment uses the actual allocated ledger, ignores stale paid snapshots and excludes pending/archive/other customer money',()=>{
  const before=structuredClone({orders,payments});const text=builder()(orders[1]);
  assert.match(text,/Tổng: 200 đ/);assert.match(text,/Đã thu: 50 đ/);assert.match(text,/Còn nợ: 150 đ/);
  assert.deepEqual({orders,payments},before);
});

test('a receipt arriving while the picker is open is reflected at selection time without changing the selected order',()=>{
  const context={current:{sources:{order:orders,customer:[customer],payments}}};const build=builder(orders,payments,context);
  context.current.sources.payments=[...payments,{id:'live',customerId:customer.id,date:'2026-11-22',amount:25,matchedOrderId:'target',allocationMode:'matched_order_first'}];
  const text=build(orders[1]);assert.match(text,/Đã thu: 75 đ/);assert.match(text,/Còn nợ: 125 đ/);
});

test('order attachment reflects new confirmed receipts, caps paid allocation and does not send an unreconciled or archived order',()=>{
  const text=builder(orders,[...payments,{id:'next',customerId:customer.id,date:'2026-11-22',amount:180,matchedOrderId:'target',allocationMode:'matched_order_first'}])(orders[1]);
  assert.match(text,/Đã thu: 200 đ/);assert.match(text,/Còn nợ: 0 đ/);
  assert.throws(()=>builder()({id:'missing',customerId:customer.id}),/Chưa đối soát/);
  assert.throws(()=>builder([{...orders[1],isArchived:true}])({...orders[1],isArchived:true}),/Chưa đối soát/);
});
