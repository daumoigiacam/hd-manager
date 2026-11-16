import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import{execFileSync}from'node:child_process';import{parse}from'@babel/parser';
import {CUSTOMER_FINANCIAL_READ_KEYS,customerFinancialSnapshot,customerEditNeedsFinancialReadiness} from '../src/features/customers/customerFinancialPresentation.js';
import {selectRetainedReadProjection} from '../src/hooks/useRetainedReadProjection.js';
import {runReadyFinancialMutation} from '../src/services/orderWorkspaceReadPlan.js';
const scope='tenant-a:principal-a:session-a:permissions-a';
test('a refreshing ledger keeps one complete financial snapshot, including history and allocation sources',()=>{
 const props=Object.fromEntries(CUSTOMER_FINANCIAL_READ_KEYS.map(key=>[key,[{id:key,amount:67000}]]));
 props.onEditCustomer=()=>{};props.canViewCustomerDebt=true;
 const ledger={customer:{currentDebt:67000,orders:props.orders,payments:props.payments}},value=customerFinancialSnapshot(props,ledger);
 assert.strictEqual(value.ledgerMap,ledger);assert.deepEqual(Object.keys(value.sources),CUSTOMER_FINANCIAL_READ_KEYS);
 assert(!Object.hasOwn(value.sources,'canViewCustomerDebt'));assert(!Object.hasOwn(value.sources,'onEditCustomer'));
 const cached={identity:scope,value},next=customerFinancialSnapshot({...props,orders:[]},{});
 for(let n=0;n<100;n++){
  const refreshing=selectRetainedReadProjection({value:next,pending:true,error:null},cached,scope,true);
  assert.strictEqual(refreshing.value,value);assert.strictEqual(refreshing.value.sources.orders,props.orders);assert.equal(refreshing.pending,true);
 }
 const complete=selectRetainedReadProjection({value:next,pending:false,error:null},cached,scope,true);
 assert.strictEqual(complete.value,next);assert.equal(complete.value.sources.orders.length,0);
});
test('scope changes, denied read owner and errors revoke all retained financial data',()=>{
 const cached={identity:scope,value:customerFinancialSnapshot({orders:[{id:'a'}]},{a:{currentDebt:67000}})};
 for(const identity of ['',scope+':new-login',scope+':permission-revoked','tenant-b'])assert.equal(selectRetainedReadProjection({pending:true},cached,identity,true).available,false);
 assert.equal(selectRetainedReadProjection({pending:true},cached,scope,false).value,undefined);
 assert.equal(selectRetainedReadProjection({pending:true,error:Error('permission-denied')},cached,scope,true).value,undefined);
});
test('retained reads do not admit financial mutations and contact-only patches remain independent',async()=>{
 for(const field of ['openingDebtAmount','openingPayableAmount','debtLimitAmount','purchaseReconciliationEnabled'])assert.equal(customerEditNeedsFinancialReadiness({[field]:0}),true);
 assert.equal(customerEditNeedsFinancialReadiness({name:'Contact',phone:'local-test'}),false);
 let writes=0;await assert.rejects(runReadyFinancialMutation(false,()=>{writes++},[]),{code:'source-not-ready'});assert.equal(writes,0);
});
test('actual source starts existing financial reads with customer intent and keeps freshness separate from presentation',()=>{
 const app=fs.readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8'),shared=fs.readFileSync(new URL('../src/features/customers/productCRMShared.jsx',import.meta.url),'utf8');
 assert.match(app,/customerSupplementsRequested=customerSupplementDemand===readOwnerKey\|\|\(activeTab==='customers'&&!offlineWorkspace.enabled\)/);
 assert.match(app,/customerFinancialReadCache=useRef\(null\)/);assert.match(app,/financialReadAllowed=\{hasRetainedModuleSources\(\{tenantId:currentUser\?\.companyId,ownerKey:currentReadOwnerKey/);
 assert.match(shared,/financialFresh=props.financialDataReady!==false/);
 assert.match(shared,/financialDataReady:financialRead.available,financialWritesReady:financialFresh/);
 assert.match(shared,/value=\{financialRead.available\?financialRead.value.ledgerMap:sharedLedger\}/);
 assert.match(shared,/runReadyFinancialMutation\(financialFresh,props\[name\],args\)/);
 const controller=fs.readFileSync(new URL('../src/features/legacy/CustomerCRMController.jsx',import.meta.url),'utf8');
 for(const name of ['canDeleteCustomer','canCreateCustomerLoanRecord','canReturnCustomerLoanRecord','canEditCustomerLoanRecord','canDeleteCustomerLoanRecord'])assert(controller.includes('const '+name+' = financialWritesReady &&'));
});
test('customer debt and revenue formulas are unchanged from the previous source',()=>{
 const file='development/hd-manager/application/src/features/legacy/CustomerCRMController.jsx';
 const now=fs.readFileSync(file,'utf8'),before=execFileSync('git',['show','012c457e:'+file],{encoding:'utf8',maxBuffer:2e6});
 const extract=text=>{const found={};const walk=n=>{if(!n||typeof n!=='object')return;if(n.type==='VariableDeclarator'&&['buildCustomerSummary','customerLedgerIndex'].includes(n.id?.name))found[n.id.name]=text.slice(n.init.start,n.init.end).replaceAll('\r\n','\n');for(const[k,v]of Object.entries(n)){if(['loc','extra','comments'].includes(k))continue;if(Array.isArray(v))v.forEach(walk);else if(v?.type)walk(v)}};walk(parse(text,{sourceType:'module',plugins:['jsx']}));return found};
 assert.equal(Object.keys(extract(now)).length,2);assert.deepEqual(extract(now),extract(before));
});
