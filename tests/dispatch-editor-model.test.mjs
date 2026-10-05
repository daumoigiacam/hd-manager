import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {buildDispatchEditorDraft,canEditDispatchField,getDispatchEditorConfig} from '../src/features/warehouse/dispatchEditorModel.js';
import {buildDispatchEditPayload} from '../src/features/warehouse/dispatchEditPayload.js';

test('edit payload retains billing snapshot, branch aliases and historical source without mutating input',()=>{
  const billingSnapshot=Object.freeze({actualQuantity:12,actualUnit:'kg',unitPrice:50000,amount:600000,configurationId:'fixed',extraAudit:'keep'});
  const context={billingSnapshot,customer:{id:'c',name:'C'},product:{id:'p',name:'P'},branchRef:{branchId:'b',branchName:'B',branchAddress:'A'},weightKg:12,pieceCount:5,
    inlineEditingDispatchDraft:{weightEntries:[6,6],note:' note '},nextDriverId:'d',nextDriverName:'D',row:{transcript:'historical',date:'2026-10-05'},baseSourceType:'voice',
    matchedOrderRow:{requestDate:'2026-10-04',requestId:'r',rowKey:'line'},selectedOrderRequestDateKey:'2026-10-06',workingDate:'2026-10-06',isOutsideOrderRequest:false,
    getCustomerDisplayName:c=>c.name,normalizeWarehouseWeightEntries:e=>e.map(Number),capitalizeFirst:s=>s,buildWarehouseDispatchSourceType:base=>base};
  const payload=buildDispatchEditPayload(context);
  assert.equal(payload.amount,600000);assert.equal(payload.extraAudit,'keep');
  assert.equal(payload.quantity,12);assert.equal(payload.quantityCount,12);assert.equal(payload.pieceCount,5);
  assert.equal(payload.price,50000);assert.equal(payload.requestUnitPrice,50000);
  assert.equal(payload.customerBranchId,'b');assert.equal(payload.customerBranchAddress,'A');
  assert.equal(payload.driverId,'d');assert.equal(payload.sourceOrderRequestRowKey,'line');
  assert.equal(payload.transcript,'historical');assert.equal(payload.sourceType,'voice');
  assert.equal(payload.date,'2026-10-05');assert.equal(payload.note,'note');
  const outside=buildDispatchEditPayload({...context,row:{},matchedOrderRow:null,isOutsideOrderRequest:true});
  assert.equal(outside.sourceOrderRequestId,'');assert.equal(outside.date,'2026-10-06');
  assert.equal(outside.createdWithoutOrderRequest,true);
});

test('editor draft preserves zeroes and legacy fallbacks and isolates weight entries',()=>{
  const row={customerId:'c',productId:'p',pieceCount:0,weightKg:'2,5',weightEntries:[1,1.5],driverId:'d',pricingUnit:'kg',billingQuantity:0,pricingQuantity:7,unitPrice:0,price:40,amount:0,pricingAmount:50};
  const draft=buildDispatchEditorDraft(row);
  assert.equal(draft.pieceCount,0);assert.equal(draft.weightKg,'2,5');
  assert.equal(draft.billingQuantity,0);assert.equal(draft.unitPrice,0);assert.equal(draft.amount,0);
  assert.equal(draft.billingUnit,'kg');assert.equal(draft.assignedDriverId,'d');
  draft.weightEntries.push(99);assert.deepEqual(row.weightEntries,[1,1.5]);
  assert.deepEqual(buildDispatchEditorDraft({}).weightEntries,[]);
});

test('field configuration preserves labels, options, and separate weight editor',()=>{
  const draft=buildDispatchEditorDraft({customerId:'c',quantityUnit:'Con',pieceCount:5});
  const options={drivers:[{id:'d',name:'Tài xế'}],customers:[{id:'c',name:'Khách'}],products:[{id:'p',name:'Hàng'}]};
  const customer=getDispatchEditorConfig('customerId',draft,options);
  assert.equal(customer.value,'c');assert.equal(customer.type,'select');assert.equal(customer.options[1].value,'c');
  assert.equal(getDispatchEditorConfig('assignedDriverId',draft,options).options[0].label,'Chưa giao');
  assert.equal(getDispatchEditorConfig('productId',draft,options).options[1].label,'Hàng');
  assert.equal(getDispatchEditorConfig('pieceCount',draft,options).suffix,'Con');
  assert.equal(getDispatchEditorConfig('weightKg',draft,options),null);
  assert.equal(getDispatchEditorConfig('__proto__',draft,options),null);
});

test('field permission never expands edit or driver rights',()=>{
  for(const field of ['customerId','productId','pieceCount','weightKg','assignedDriverId','price']) assert.equal(canEditDispatchField(field,false,true),false);
  assert.equal(canEditDispatchField('assignedDriverId',true,false),false);
  assert.equal(canEditDispatchField('assignedDriverId',true,true),true);
  assert.equal(canEditDispatchField('weightKg',true,false),true);
  assert.equal(canEditDispatchField('price',true,true),false);
});

test('actual parent delegates configuration and draft construction to checked helpers',()=>{
  const source=readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
  assert.match(source,/setInlineEditingDispatchDraft\(buildDispatchEditorDraft\(row\)\)/);
  assert.match(source,/getDispatchEditorConfig\(dispatchCellEditor\?\.field, inlineEditingDispatchDraft/);
  assert.match(source,/canEditDispatchField\(field, canEdit, canAssignDriver\)/);
});
