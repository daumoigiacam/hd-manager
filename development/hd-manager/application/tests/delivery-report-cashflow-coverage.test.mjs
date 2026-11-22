import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parse } from '@babel/parser';
import { createDeliverySavePlan } from '../src/utils/deliverySavePlan.js';
import { planDeliveryCashflowChange } from '../src/utils/deliveryCashflow.js';
import { takeDeliveryCashflow } from '../src/utils/deliveryCashflowTotals.js';
import {assertAssetMutationAccess,prepareAssetCostMutation} from '../src/utils/assetMutationIntegrity.js';

function actual(file,name,bindings) {
  const source=fs.readFileSync(new URL(file,import.meta.url),'utf8');let found;
  const walk=node=>{if(!node||typeof node!=='object')return;if(node.type==='VariableDeclarator'&&node.id?.name===name)found=node.init;for(const [key,value]of Object.entries(node)){if(['loc','comments','extra'].includes(key))continue;if(Array.isArray(value))value.forEach(walk);else if(value?.type)walk(value);}};
  walk(parse(source,{sourceType:'module',plugins:['jsx']}));assert.ok(found,name);
  return Function(...Object.keys(bindings),'return ('+source.slice(found.start,found.end)+')')(...Object.values(bindings));
}
test('two distinct equal receipts count twice; repeated product rows in one legacy compound save count once',()=>{
  const seen=new Set(),a={id:'dr_12345678-1234-1234-1234-123456789abc_0',customerId:'a'},sibling={...a,id:'dr_12345678-1234-1234-1234-123456789abc_1'},b={...a,id:'dr_87654321-4321-4321-4321-cba987654321_0'};
  assert.equal(takeDeliveryCashflow(seen,a,'income',500000),500000);
  assert.equal(takeDeliveryCashflow(seen,sibling,'income',500000),0);
  assert.equal(takeDeliveryCashflow(seen,b,'income',500000),500000);
  assert.equal(takeDeliveryCashflow(new Set(),{...a,paymentId:'real-receipt'},'income',500000),500000);
});
function archiveFixture(approved=false) {
  const commands=[],errors=[];
  const make=(id,amount)=>({id,amount,companyId:'qa',relatedDeliveryReportId:'r',customerId:'c',date:'2026-11-21',requiresApproval:true,approvalStatus:approved?'approved':'pending_handover',handoverStatus:approved?'confirmed':'pending',isArchived:false});
  const bindings={onUpdateDeliveryReport(){},canDeleteDeliveryReport:true,window:{confirm:()=>true},setIsSaving(){},deliveryReports:[{id:'r'}],createDeliverySavePlan,planDeliveryCashflowChange,crypto:globalThis.crypto,employee:{id:'qa'},payments:[make('p',550000)],expenses:[make('e',50000)],canRecordDeliveryIncome:true,canRecordDeliveryExpense:true,assetCostLogs:[{id:'cost',relatedDeliveryReportId:'r',amount:50000}],canEditAssetCostLog:true,onSaveDeliveryCommand:async command=>{commands.push(command);return {success:true,queued:true};},editingReportId:'',resetReportForm(){},setSelectedReportCustomerKey(){},setStatusTone(){},setStatusMessage:text=>errors.push(text),getFriendlyFirebaseErrorMessage:error=>error.message};
  return {run:actual('../src/features/legacy/DeliveryReportView.jsx','archiveDeliveryReport',bindings),commands,errors};
}
test('actual report archive stages its pending income, expense and vehicle mirror in one command',async()=>{
  const f=archiveFixture();await f.run('r');assert.equal(f.commands.length,1);
  assert.deepEqual(f.commands[0].operations.map(row=>row.type),['editPayment','editExpense','editCost','editReport']);
  assert(f.commands[0].operations.every(row=>row.payload.isArchived===true));
});
test('actual report archive refuses a processed receipt and leaves every document untouched',async()=>{
  const f=archiveFixture(true);await f.run('r');assert.equal(f.commands.length,0);assert.match(f.errors.at(-1),/đã được xử lý/);
});
test('actual vehicle mirror edit cannot resurrect or downgrade its delivery expense',async()=>{
  const writes=[],cost={id:'cost',companyId:'qa',assetId:'vehicle',relatedDeliveryReportId:'r',expenseId:'e',amount:50000};
  const bindings={assertAssetMutationAccess,prepareAssetCostMutation,firebaseUser:{uid:'qa'},myCompanyId:'qa',
    currentCompany:{id:'qa'},appCurrentEmployee:{id:'qa'},hasCompanyRolePermissionAction:()=>true,
    readOwnerKey:'qa',readOwnerRef:{current:'qa'},activeTenantScopeRef:{current:'qa'},
    rawAssetCostLogs:[cost],rawAssets:[{id:'vehicle',companyId:'qa',name:'Vehicle'}],
    rawExpenses:[{id:'e',companyId:'qa',relatedDeliveryReportId:'r',amount:50000,isArchived:false,approvalStatus:'pending_handover'}],
    normalizeExpenseCategoryLabel:value=>value,getAssetCostTypeLabel:value=>value,getAssetDisplayLabel:()=>'',currentUser:{id:'qa'}};
  await actual('../src/App.jsx','handleEditAssetCostLog',bindings)('cost',{...cost,isArchived:true},'qa',writes);
  assert.equal(writes.length,1);assert.equal(writes[0].collectionName,'assetCostLogs');assert.equal(writes[0].payload.isArchived,true);
});
