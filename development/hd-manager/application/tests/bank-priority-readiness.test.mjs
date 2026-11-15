import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {parse} from '@babel/parser';
import {transformSync} from 'esbuild';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {BANK_PRIMARY_COLLECTIONS,getBankWorkspaceReadCollections} from '../src/services/bankWorkspaceReadPlan.js';

const source=fs.readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
const declaration=parse(source,{sourceType:'module',plugins:['jsx']}).program.body.find(node=>node.type==='FunctionDeclaration'&&node.id?.name==='BankPaymentCenterView');
assert(declaration,'canonical bank component');
const code=transformSync(source.slice(declaration.start,declaration.end),{loader:'jsx',jsx:'automatic',format:'cjs'}).code;
// Exercise the actual component's readiness branches. Formatting/date/paging
// adapters below isolate rendering; this test does not certify ledger formulas.
const env={React,useMemo:React.useMemo,useState:React.useState,useEffect:React.useEffect,useRef:React.useRef,
 useAppScreenBack:()=>{},usePagedList:rows=>({items:rows.slice(0,20)}),ListPagination:()=>null,
 getInvoiceTransferProfile:()=>({}),getTodayString:()=> '2026-11-16',getEntityTimestamp:r=>r.at||0,
 sortBankTransactionsByTransactionDate:rows=>rows,getPaymentDateKey:r=>r.date,getPaymentDateSource:r=>r.date,
 parseLooseMoneyValue:Number,formatCurrency:String,formatDateLabel:String,formatDateTimeLabel:String,
 resolveBankTransactionAmount:r=>r.amount,resolveBankTransactionContent:r=>r.content,resolveBankTransactionDate:r=>r.date,
 getCustomerDisplayName:r=>r?.name||'',getBankOptionLabel:String,ChevronLeft:()=>null};
const View=Function('require',...Object.keys(env),code+';return BankPaymentCenterView;')(createRequire(import.meta.url),...Object.values(env));
const render=props=>renderToStaticMarkup(React.createElement(View,props));

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
