import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {parse} from '@babel/parser';
import {transformSync} from 'esbuild';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {BANK_PRIMARY_COLLECTIONS,getBankWorkspaceReadCollections} from '../src/services/bankWorkspaceReadPlan.js';
import {isBankTransactionIgnored,sortBankTransactionsByTransactionDate} from '../src/utils/bankTransactionView.js';
import {getListPage} from '../src/utils/listPage.js';

const source=fs.readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
const declaration=parse(source,{sourceType:'module',plugins:['jsx']}).program.body.find(node=>node.type==='FunctionDeclaration'&&node.id?.name==='BankPaymentCenterView');
assert(declaration,'canonical bank component');
const code=transformSync(source.slice(declaration.start,declaration.end),{loader:'jsx',jsx:'automatic',format:'cjs'}).code;
// Use the real official-cashflow predicate, paging hook, page calculation and
// pagination component. Only React state/effects and display adapters are isolated.
const shared=fs.readFileSync(new URL('../src/features/customers/productCRMShared.jsx',import.meta.url),'utf8');
const declarations=new Map();
for(const statement of parse(shared,{sourceType:'module',plugins:['jsx']}).program.body){
 const node=statement.type==='ExportNamedDeclaration'?statement.declaration:statement;
 if(node?.type==='VariableDeclaration')for(const row of node.declarations)if(row.id.name)declarations.set(row.id.name,row.init);
}
const policy={};
for(const name of ['CASHFLOW_APPROVAL_STATUS','UNCONFIRMED_PAYMENT_STATUSES','PAYMENT_INTENT_SOURCE_TYPES','isUnconfirmedPaymentIntent','requiresCashflowApproval','isCashflowOfficial']){
 const node=declarations.get(name);assert(node,name);
 policy[name]=Function(...Object.keys(policy),'return ('+shared.slice(node.start,node.end)+')')(...Object.values(policy));
}
const pagingSource=fs.readFileSync(new URL('../src/services/renderOptimization.js',import.meta.url),'utf8');
const paging=parse(pagingSource,{sourceType:'module'}).program.body
 .flatMap(node=>node.type==='ExportNamedDeclaration'&&node.declaration?.type==='VariableDeclaration'?node.declaration.declarations:[])
 .find(node=>node.id.name==='usePagedList');
assert(paging,'actual paging hook');
const pagerSource=fs.readFileSync(new URL('../src/design-system/ListPagination.jsx',import.meta.url),'utf8');
const pager=parse(pagerSource,{sourceType:'module',plugins:['jsx']}).program.body
 .find(node=>node.type==='ExportNamedDeclaration'&&node.declaration?.id?.name==='ListPagination').declaration;
const pagerCode=transformSync(pagerSource.slice(pager.start,pager.end),{loader:'jsx',jsx:'automatic',format:'cjs'}).code;
const ListPagination=Function('require','ChevronLeft','ChevronRight',pagerCode+';return ListPagination;')(createRequire(import.meta.url),()=>null,()=>null);
const env={React,useMemo:React.useMemo,useState:React.useState,useEffect:React.useEffect,useRef:React.useRef,
 useAppScreenBack:()=>{},ListPagination,isCashflowOfficial:policy.isCashflowOfficial,isBankTransactionIgnored,
 getInvoiceTransferProfile:()=>({}),getTodayString:()=> '2026-11-16',getEntityTimestamp:r=>r.at||0,
 sortBankTransactionsByTransactionDate,getPaymentDateKey:r=>r.date,getPaymentDateSource:r=>r.date,
 parseLooseMoneyValue:Number,formatCurrency:String,formatDateLabel:String,formatDateTimeLabel:String,
 resolveBankTransactionAmount:r=>r.amount,resolveBankTransactionContent:r=>r.content,resolveBankTransactionDate:r=>r.date,
 getCustomerDisplayName:r=>r?.name||'',getBankOptionLabel:String,ChevronLeft:()=>null};
function fixture(props={}){
 const slots=[];let index=0,tree;
 const state=initial=>{const slot=index++;if(!(slot in slots))slots[slot]=typeof initial==='function'?initial():initial;
  return[slots[slot],value=>{slots[slot]=typeof value==='function'?value(slots[slot]):value;}];};
 const hooks={useState:state,useMemo:calculate=>calculate(),useCallback:callback=>callback,getListPage,getDefaultListPageSize:()=>20};
 const usePagedList=Function(...Object.keys(hooks),'return ('+pagingSource.slice(paging.init.start,paging.init.end)+')')(...Object.values(hooks));
 const bindings={...env,useState:state,useMemo:calculate=>calculate(),useEffect:()=>{},useRef:initial=>state({current:initial})[0],usePagedList};
 const View=Function('require',...Object.keys(bindings),code+';return BankPaymentCenterView;')(createRequire(import.meta.url),...Object.values(bindings));
 const nodes=(node,predicate,out=[])=>{if(!node||typeof node!=='object')return out;if(predicate(node))out.push(node);React.Children.forEach(node.props?.children,child=>nodes(child,predicate,out));return out;};
 const render=()=>{index=0;tree=View(props);return renderToStaticMarkup(tree);};
 const page=label=>{const row=nodes(tree,node=>node.type===ListPagination&&node.props.label===label)[0];assert(row,label);return row.props.pagination;};
 return{render,page};
}
const render=props=>fixture(props).render();

test('transaction admission retains every original background source without requesting invoice history first',()=>{
 assert.deepEqual(BANK_PRIMARY_COLLECTIONS,['bankTransactions']);
 assert.deepEqual([...getBankWorkspaceReadCollections(true)].sort(),['bankTransactions','bankAccounts','customers','orders','payments','payment_reconciliations'].sort());
 assert.equal(new Set(getBankWorkspaceReadCollections(true)).size,6);
 assert.match(source,/bankBackgroundRequested=bankListCommittedOwner===readOwnerKey/);
 assert.match(source,/if\(readOwnerRef.current===readOwnerKey\)setBankListCommittedOwner\(readOwnerKey\)/);
 assert.match(source,/transactionDataAvailable=\{hasRetainedModuleSources\(\{tenantId:currentUser\?\.companyId,ownerKey:currentReadOwnerKey/);
});
test('missing bank/history sources never render an empty-result assertion or a made-up zero',()=>{
 const html=render({});
 assert(html.includes('Đang tải giao dịch ngân hàng'));assert(html.includes('Đang tải lịch sử thanh toán'));
 assert(!html.includes('Chưa có giao dịch ngân hàng'));assert(!html.includes('Chưa có khoản thanh toán QR'));
 assert(!html.includes('0 đ'));assert.equal((html.match(/—/g)||[]).length,2);
 assert(!html.includes('data-hd-essential-data-ready="true"'));
});
test('100 committed transactions display a bounded first page before unrelated payment history and preserve source objects',()=>{
 const bankTransactions=Array.from({length:100},(_,n)=>({id:'bank'+n,amount:1000+n,content:'ENTRY '+n,date:'2026-11-16',status:n<3?'matched':'pending'}));
 const before=JSON.stringify(bankTransactions);
 const partial=render({bankTransactions,transactionDataAvailable:true});
 assert(partial.includes('ENTRY 0'));assert(partial.includes('ENTRY 19'));assert(!partial.includes('ENTRY 20'));
 assert(partial.includes('data-hd-essential-data-ready="true"'));assert(partial.includes('Đang tải lịch sử thanh toán'));
 assert(partial.includes('>3</span>'));assert.equal(JSON.stringify(bankTransactions),before);
 const ready=render({bankTransactions,transactionDataAvailable:true,paymentDataAvailable:true,sourceFresh:true,
   payments:[{id:'p1',date:'2026-11-16',amount:500,method:'bank'}]});
 assert(ready.includes('500 đ'));assert(!ready.includes('Đang tải lịch sử thanh toán'));
});

test('all 100 transaction records remain sorted and reachable through the actual five pages, including reconciled and ignored records',()=>{
 const bankTransactions=Array.from({length:100},(_,n)=>({id:'bank'+n,amount:1000+n,content:`ENTRY_${String(n).padStart(3,'0')}`,
  transactionDateTime:new Date(Date.UTC(2026,10,16,0,n)).toISOString(),date:'2026-11-16',
  ...(n%3===0?{reconciledPaymentId:'payment-'+n}:n%3===1?{status:'ignored'}:{status:'cancelled'})}));
 const original=JSON.stringify(bankTransactions),f=fixture({bankTransactions,transactionDataAvailable:true});
 f.render();assert.equal(f.page('Trang giao dịch ngân hàng').total,100);
 const seen=[];
 for(let page=0;page<5;page++){
  f.page('Trang giao dịch ngân hàng').setPage(page);const html=f.render(),pagination=f.page('Trang giao dịch ngân hàng');
  assert.equal(pagination.page,page);assert.equal(pagination.pageCount,5);assert.equal(pagination.items.length,20);
  for(const row of pagination.items)assert(html.includes(row.content));
  assert.equal((html.match(/ENTRY_\d{3}/g)||[]).length,20);
  seen.push(...pagination.items.map(row=>row.id));
 }
 assert.deepEqual(seen,Array.from({length:100},(_,n)=>'bank'+(99-n)));
 assert.equal(new Set(seen).size,100);assert.equal(JSON.stringify(bankTransactions),original);
});

test('source type cannot hide an official transfer receipt; today total is 49000 + 10000 + 20000 and matched codes render',()=>{
 const payments=[
  {id:'manual',sourceType:'order_direct_payment',method:'Chuyển khoản',amount:49000,matchedOrderId:'manual-order',matchedOrderCode:'HDMANUAL'},
  {id:'debt',sourceType:'debt_order_payment',method:'Chuyển khoản',amount:10000,matchedOrderId:'debt-order',matchedOrderCode:'HDC1C0MU'},
  {id:'general',sourceType:'manual_receipt',paymentMethod:'Chuyển khoản',amount:20000,matchedOrderId:'fallback-order-id'},
 ].map((row,n)=>({...row,date:'2026-11-16',at:n+1,approvalStatus:'approved',customerName:'BANK_'+row.id}));
 const before=JSON.stringify(payments),f=fixture({payments,orders:[],transactionDataAvailable:true,paymentDataAvailable:true,sourceFresh:true});
 const html=f.render();
 assert(html.includes('79000 đ'));assert.equal(f.page('Trang lịch sử thanh toán ngân hàng').total,3);
 for(const value of ['BANK_manual','BANK_debt','BANK_general','HDMANUAL','HDC1C0MU','fallback-order-id'])assert(html.includes(value),value);
 assert(!html.includes('Chưa gắn đơn'));assert.equal(JSON.stringify(payments),before);
});

test('pending, rejected, archived, cash and every actual payment-intent variant are excluded from history and totals',()=>{
 const base={date:'2026-11-16',sourceType:'manual_receipt',method:'Chuyển khoản',amount:999999,approvalStatus:'approved'};
 const excluded=[
  {...base,requiresApproval:true,approvalStatus:'pending_handover'},
  {...base,requiresApproval:true,approvalStatus:'rejected'},
  {...base,isArchived:true},
  {...base,method:'Tiền mặt'},
  ...[...policy.PAYMENT_INTENT_SOURCE_TYPES].map(sourceType=>({...base,sourceType})),
  ...[...policy.UNCONFIRMED_PAYMENT_STATUSES].map(status=>({...base,status})),
  ...['isPaymentIntent','paymentIntent','isCustomerDebtPaymentIntent'].map(flag=>({...base,[flag]:true})),
 ].map((row,n)=>({...row,id:'excluded-'+n,customerName:'EXCLUDED_'+n}));
 const accepted={...base,id:'posted',amount:79000,customerName:'POSTED_RECEIPT'};
 const f=fixture({payments:[accepted,...excluded],paymentDataAvailable:true,sourceFresh:true});
 const html=f.render();assert.equal(f.page('Trang lịch sử thanh toán ngân hàng').total,1);
 assert(html.includes('POSTED_RECEIPT'));assert(html.includes('79000 đ'));assert(!html.includes('EXCLUDED_'));assert(!html.includes('999999'));
 const empty=fixture({payments:excluded,paymentDataAvailable:true,sourceFresh:true});
 const noReceipts=empty.render();assert.equal(empty.page('Trang lịch sử thanh toán ngân hàng').total,0);assert(noReceipts.includes('0 đ'));
});

test('all 25 official payments are reachable on 20/5 pages and total uses the full history on both pages',()=>{
 const payments=Array.from({length:25},(_,n)=>({id:'payment-'+n,customerName:`PAYMENT_${String(n).padStart(2,'0')}`,
  sourceType:'debt_order_payment',method:'Chuyển khoản',amount:1000+n,date:'2026-11-16',at:n+1,approvalStatus:'approved'}));
 const before=JSON.stringify(payments),f=fixture({payments,paymentDataAvailable:true,sourceFresh:true}),seen=[];
 for(let page=0;page<2;page++){
  if(page)f.page('Trang lịch sử thanh toán ngân hàng').setPage(page);
  const html=f.render(),pagination=f.page('Trang lịch sử thanh toán ngân hàng');
  assert.equal(pagination.total,25);assert.equal(pagination.pageCount,2);assert.equal(pagination.items.length,page===0?20:5);
  assert(html.includes('25300 đ'));assert(html.includes('aria-label="Trang lịch sử thanh toán ngân hàng"'));
  assert.equal((html.match(/PAYMENT_\d{2}/g)||[]).length,page===0?20:5);
  for(const row of pagination.items)assert(html.includes(row.customerName));
  seen.push(...pagination.items.map(row=>row.id));
 }
 assert.deepEqual(seen,Array.from({length:25},(_,n)=>'payment-'+(24-n)));
 assert.equal(new Set(seen).size,25);assert.equal(JSON.stringify(payments),before);
});

test('ignored/cancelled display takes precedence over stale auto-reconciliation error labels without hiding records',()=>{
 const bankTransactions=['ignored','cancelled','canceled'].map((status,n)=>({id:'ignored-'+n,status,autoReconcileStatus:'no_order_code_match',
  content:'IGNORED_'+n,amount:1000,date:'2026-11-16'}));
 const f=fixture({bankTransactions,transactionDataAvailable:true,sourceFresh:true});const html=f.render();
 assert.equal(f.page('Trang giao dịch ngân hàng').total,3);
 assert.equal((html.match(/>Đã bỏ qua<\/span>/g)||[]).length,3);assert(!html.includes('Cần xử lý'));
 for(const row of bankTransactions)assert(html.includes(row.content));
});
