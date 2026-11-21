import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {parse} from '@babel/parser';
import {selectRetainedReadProjection as select} from '../src/hooks/useRetainedReadProjection.js';

const identity=JSON.stringify(['session-a','company-a','employee-a','permissions-v1']);
const value={snapshots:[{id:'invoice-1',amount:67000}]},previous={identity,value};
test('background refresh keeps the last committed read without marking reconciliation complete',()=>{
  const result=select({pending:true,error:null,value:[]},previous,identity);
  assert.equal(result.available,true);assert.equal(result.retained,true);
  assert.equal(result.pending,true);assert.strictEqual(result.value,value);
});
test('account, tenant, permission, query changes, denial and errors cannot reuse private rows',()=>{
  for(const other of ['',identity+'new-session',JSON.stringify(['tenant-b']),JSON.stringify(['query-b'])]){
    const result=select({pending:true,error:null},previous,other);
    assert.equal(result.available,false);assert.equal(result.value,undefined);
  }
  for(const [projection,enabled] of [[{pending:true,error:null},false],[{pending:false,error:Error('denied')},true]]){
    const result=select(projection,previous,identity,enabled);
    assert.equal(result.available,false);assert.equal(result.value,undefined);
  }
});
test('a complete replacement, including an empty list, replaces the old read exactly',()=>{
  for(const next of [{snapshots:[]},{snapshots:[{id:'invoice-2',amount:57000}]}]){
    const result=select({pending:false,error:null,value:next},previous,identity);
    assert.strictEqual(result.value,next);assert.equal(result.retained,false);assert.equal(result.pending,false);
  }
  assert.equal(select({pending:true,error:null},null,identity).available,false);
});
const app=fs.readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
const orders=fs.readFileSync(new URL('../src/features/legacy/OrderManagementView.jsx',import.meta.url),'utf8');
test('actual Orders keeps live children, scope/query isolation and current-source write guards',()=>{
  assert.match(app,/OrderReadBoundary projection=\{orderLedgerProjection\} identity=\{orderReadIdentity\} enabled=\{orderLedgerSourcesAvailable\}/);
  assert.match(app,/orderReadIdentity=JSON.stringify\(\[currentReadOwnerKey,dashboardPrivacyScope\]\)/);
  assert.match(app,/renderContent\(ledger\)/);assert.match(app,/customerLedgerMap=\{orderReadLedgerMap\} readIdentity=\{orderReadIdentity\}/);
  assert.match(app,/orderMutationsReady=mainLedgerReady&&orderLedgerSourcesReady/);
  assert(app.includes('onAddOrder={(...args)=>runOrderCreation(args,orderReadIdentity)}'));
  for(const callback of ['onEditOrder','onAddPayment','onDeleteOrder'])assert(app.includes(callback+'={(...args)=>runOrderMutation('+callback+',args)}'));
  assert.match(orders,/useRetainedReadProjection\(orderViewProjection,presentationIdentity\)/);
  assert.match(orders,/JSON.stringify\(\[presentationIdentity,displayOrderRenderKey\]\)/);
  assert.match(orders,/if\(orderViewsReady\)onPrimaryReady\?\.\(\)/);
  assert(!orders.includes('Đang cập nhật phiếu xuất'));
  assert(!orders.includes('premium-orders-module space-y-4 animate-in'));
});
test('the exact revenue/paid/debt calculation remains unchanged from the accepted source',()=>{
  const before=execFileSync('git',['show','8d367b86:development/hd-manager/application/src/features/legacy/OrderManagementView.jsx'],{encoding:'utf8',maxBuffer:2e6});
  const extract=text=>{let result;const visit=n=>{if(!n||typeof n!=='object')return;if(n.type==='VariableDeclarator'&&n.id?.name==='dailyOrderRevenueSummary')result=text.slice(n.init.start,n.init.end);for(const[k,v]of Object.entries(n)){if(['loc','extra','comments'].includes(k))continue;if(Array.isArray(v))v.forEach(visit);else if(v?.type)visit(v);}};visit(parse(text,{sourceType:'module',plugins:['jsx']}));assert(result);return result.replaceAll('\r\n','\n');};
  assert.equal(extract(orders),extract(before));
});
