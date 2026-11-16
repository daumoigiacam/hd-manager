import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parse} from '@babel/parser';
import {reconciledProjectionAvailability,rememberCommittedReadSources,hasRetainedModuleSources} from '../src/services/moduleReadAvailability.js';
import {runReadyFinancialMutation} from '../src/services/orderWorkspaceReadPlan.js';
const app=fs.readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');

test('retained complete reconciliation is readable but never fresh authority for a financial write',async()=>{
 for(const pending of [false,true])for(const error of [null,Error('failed')])for(const fresh of [false,true])for(const retained of [false,true]){
  const result=reconciledProjectionAvailability({pending,error,fresh,retained});
  assert.equal(result.readReady,!pending&&!error&&(fresh||retained));
  assert.equal(result.transactionsReady,!pending&&!error&&fresh);
  let calls=0;
  if(!result.transactionsReady){await assert.rejects(runReadyFinancialMutation(result.transactionsReady,()=>{calls++},[]),{code:'source-not-ready'});assert.equal(calls,0);}
 }
});
test('all five original financial inputs must have committed under the same read owner',()=>{
 const names=['companies','employees','customers','orders','payments','warehouseImports','expenses'];
 const state=rememberCommittedReadSources(null,{tenantId:'a',ownerKey:'principal-a-session-v1-permission-v1',names});
 const query={tenantId:'a',ownerKey:state.ownerKey,state,collections:names.slice(2)};
 assert.equal(hasRetainedModuleSources(query),true);
 for(const ownerKey of ['principal-b-session-v1-permission-v1','principal-a-session-v2-permission-v1','principal-a-session-v1-permission-v2'])assert.equal(hasRetainedModuleSources({...query,ownerKey}),false);
 assert.equal(hasRetainedModuleSources({...query,tenantId:'b'}),false);
 for(const name of names)assert.equal(hasRetainedModuleSources({...query,state:{...state,availableCollections:{...state.availableCollections,[name]:false}}}),false);
});
test('actual debt form rejects Enter/submit before touching draft or business callbacks while refresh is pending',async()=>{
 const tree=parse(app,{sourceType:'module',plugins:['jsx']});
 const view=tree.program.body.find(n=>n.type==='FunctionDeclaration'&&n.id?.name==='DebtManagementView');
 const declaration=view.body.body.filter(n=>n.type==='VariableDeclaration').flatMap(n=>n.declarations).find(n=>n.id.name==='handlePaymentSubmit').init;
 const draft={amount:'67000',date:'2026-11-16',method:'Tiền mặt'},before=JSON.stringify(draft),messages=[];
 const submit=Function('sourceFresh','setDebtPaymentStatus','newPayment','return ('+app.slice(declaration.start,declaration.end)+')')(false,m=>messages.push(m),draft);
 let prevented=0;await submit({preventDefault(){prevented++}});
 assert.equal(prevented,1);assert.equal(JSON.stringify(draft),before);assert.equal(messages.length,1);assert(messages[0].includes('Bản nhập được giữ'));
});
test('canonical wiring reuses the original calculation and keeps freshness checks on every debt mutation',()=>{
 assert.match(app,/enabled:isPreviewDataMode\|\|mainLedgerSourcesReady\|\|retainedDebtLedgerSources/);
 assert.match(app,/mainLedgerReady = mainLedgerAvailability.transactionsReady/);
 assert.match(app,/<ReconciledLedgerContext.Provider value=\{debtReadLedgerMap\}>/);
 assert.match(app,/runReadyFinancialMutation\(mainLedgerReady,callback,args\)/);
 assert.match(app,/onAddRepayment=\{\(data\) => runDebtMutation\(onAddExpense,\[employee.id,data\]\)\}/);
 for(const name of ['onAddPayment','onDeletePayment'])assert(app.includes(name+'={(...args)=>runDebtMutation('+name+',args)}'));
 assert.match(app,/retainWhilePending=\{activeTab==='debt'\} retainIdentity=\{dashboardPrivacyScope\} disableRetainedInteraction/);
});
