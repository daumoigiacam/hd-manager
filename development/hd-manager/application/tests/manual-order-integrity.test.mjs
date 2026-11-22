import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import {parse} from '@babel/parser';
import {getWarehouseDispatchIds,findDuplicateWarehouseDispatchIds,resolveOrderCreationDateKey} from '../src/utils/warehouseDispatchOrders.js';
import {getProductPrimaryPricingUnit} from '../src/services/productPricingUnits.js';
import {resolveTransactionBillingSnapshot} from '../src/services/customerProductBilling.js';

function actual(file,name,bindings={}) {
  const source=fs.readFileSync(new URL(file,import.meta.url),'utf8');let selected;
  function visit(node) {if(!node||typeof node!=='object')return;if(node.type==='VariableDeclarator'&&node.id?.name===name)selected=node.init;
    for(const [key,value]of Object.entries(node)){if(['loc','comments','extra'].includes(key))continue;if(Array.isArray(value))value.forEach(visit);else if(value?.type)visit(value);}}
  visit(parse(source,{sourceType:'module',plugins:['jsx']}));assert.ok(selected,'Real source function '+name);
  return Function(...Object.keys(bindings),'return ('+source.slice(selected.start,selected.end)+')')(...Object.values(bindings));
}
const app='../src/App.jsx';
test('manual product selection freezes the catalog unit without mutating the prior draft',()=>{
  const products=[{id:'duck',name:'Duck',unit:'Con',sellingPrice:67000},{id:'chicken',name:'Chicken',unit:'Kg',sellingPrice:58000}];
  for(const product of products){const previous=Object.freeze({productId:'',quantity:2,unitPrice:''});let saved;
    const change=actual('../src/features/legacy/OrderManagementView.jsx','handleItemProductChange',{activeProducts:products,newOrder:{items:[previous]},getProductPrimaryPricingUnit,setNewOrder:value=>{saved=value;}});
    change(0,product.id);assert.equal(saved.items[0].quantityUnit,product.unit);assert.equal(saved.items[0].pricingUnit,product.unit);assert.equal(previous.productId,'');
    const billing=resolveTransactionBillingSnapshot({record:saved.items[0]});assert.equal(billing.billingUnit,product.unit);assert.equal(billing.amount,2*product.sellingPrice);
  }
});
function fixture(confirm){let writes=[],followups=0;
  const bindings={getWarehouseDispatchIds,findDuplicateWarehouseDispatchIds,resolveOrderCreationDateKey,rawOrders:[],customers:[{id:'customer',empId:'owner'}],products:[],payments:[],isVpsStagingMode:false,myCompanyId:'qa-only',firebaseUser:{uid:'owner'},currentCompany:{id:'qa-only'},currentUser:{id:'owner'},orderCreateInFlightRef:{current:new Set()},getTodayString:()=> '2026-11-21',buildDateTimeFromDateKey:date=>date+'T09:00:00Z',getDateKeyFromDateTime:date=>date.slice(0,10),parseLooseMoneyValue:v=>Number(v)||0,CASHFLOW_APPROVAL_STATUS:{approved:'approved'},capitalizeFirst:String,
    buildOrderDuplicateSignature:()=> 'manual-qa-fixture',buildStableHash:actual(app,'buildStableHash'),
    ATOMIC_SAVE_COLLECTION:'__atomic__',saveAtomicDocuments:(_key,rows)=>{writes=rows;return{queued:true,companyId:'qa-only'};},requireSharedWriteConfirmation:confirm,
    activeTenantScopeRef:{current:'qa-only'},flushPendingFirebaseWriteNow:async()=>{},scheduleOrderShareWarmup:()=>{followups++;},syncCustomerLoyaltyPoints:async()=>{},handleEnsureOrderPayosPayment(){},setRawOrders(){},setRealtimeStatus(){},getFriendlyFirebaseErrorMessage:e=>e.message,recordStartupEvent(){}};
  return {save:actual(app,'handleAddOrder',bindings),writes:()=>writes,followups:()=>followups};
}
const draft={customerId:'customer',salesEmpId:'owner',date:'2026-11-21',amount:134000,items:[{productId:'duck',quantity:2,quantityUnit:'Con',unitPrice:67000}]};
test('manual order success waits for the exact atomic server receipt',async()=>{
  let release,receipt,settled=false;const f=fixture((result,collection,id)=>{receipt={result,collection,id};return new Promise(resolve=>{release=resolve;});});
  const pending=f.save('owner',draft,{}).then(id=>{settled=true;return id;});await Promise.resolve();
  assert.equal(settled,false);assert.equal(f.followups(),0);assert.equal(f.writes().length,1);assert.equal(receipt.collection,'__atomic__');
  assert.equal(receipt.id,'order_'+f.writes()[0].documentId);release({confirmed:true});assert.equal(await pending,f.writes()[0].documentId);
});
test('manual order confirmation failure rejects instead of returning a success id',async()=>{
  const pendingError=Object.assign(new Error('server acknowledgement pending'),{code:'firestore/sync-pending'});
  const f=fixture(async()=>{throw pendingError;});await assert.rejects(f.save('owner',draft,{}),e=>e===pendingError);assert.equal(f.followups(),0);
});
test('return retry reuses the record and discount after an uncertain atomic edit',async()=>{
  let payload,closed=0,ids=0,attempts=0;const pending={current:null};
  const bindings={onEditOrder(){},canEditOrderRecord:()=>true,returnDraft:{pieces:'1',weightKg:'2',reason:'QA return',status:'discounted_sale',discountAmount:'10000'},parseLooseQuantityValue:Number,parseLooseMoneyValue:v=>Number(v)||0,capitalizeFirst:String,returnPendingCommandRef:pending,createReturnGoodsRecordId:()=> 'return-'+(++ids),RETURN_GOODS_STATUS_LABELS:{},getOrderReturnProductSummary:()=> 'QA',formatOrderCode:String,employee:{id:'qa'},getOrderReturnGoodsRecords:order=>order.returnGoods||[],summarizeOrderReturnGoods:()=>({discountAmount:10000,pendingPieces:0,pendingWeightKg:0}),buildEditableOrderPayload:(order,patch)=>({...order,...patch}),commitOrderEdit:async(_order,value)=>{payload=value;if(++attempts===1)throw Error('unconfirmed');return{success:true,queued:false};},setOrderShareStatus(){},setReturnEditorError(){},getFriendlyFirebaseErrorMessage:e=>e.message,closeOrderReturnEditor:()=>{closed++;}};
  const save=actual('../src/features/legacy/OrderManagementView.jsx','saveOrderReturnEditor',bindings);
  const order={id:'order-qa',discount:5000};await save(order);assert.equal(closed,0);assert.ok(pending.current);
  const firstId=payload.returnGoods[0].id;await save({...order,...payload});assert.equal(ids,1);assert.equal(payload.returnGoods.length,1);assert.equal(payload.returnGoods[0].id,firstId);assert.equal(payload.discount,15000);assert.equal(closed,1);assert.equal(pending.current,null);
});
test('direct order receipt waits for confirmation and retries the same payment id',async()=>{
  let release,settled=false,calls=[];const confirmation=new Promise(resolve=>{release=resolve;});
  const bindings={isVpsStagingMode:false,firebaseUser:{uid:'qa'},myCompanyId:'qa-only',currentUser:{id:'qa'},resolveMatchedOrderFromTransfer:()=>null,orders:[],currentCompany:{},capitalizeFirst:String,CASHFLOW_APPROVAL_STATUS:{approved:'approved',pending:'pending'},parseLooseMoneyValue:Number,buildPaymentConfirmationWrites:()=>[],ATOMIC_SAVE_COLLECTION:'__atomic__',saveAtomicDocuments:(id,writes)=>{calls.push({id,writes});return{queued:true};},requireSharedWriteConfirmation:()=>confirmation};
  const save=actual(app,'handleAddPayment',bindings),data={clientMutationId:'p_qa_stable',sourceType:'order_direct_payment',customerId:'qa-customer',amount:100000};
  const first=save(data).then(value=>{settled=true;return value;});await Promise.resolve();assert.equal(settled,false);assert.equal(calls[0].id,'payment_p_qa_stable');release();assert.equal((await first).queued,false);
  const denied=Object.assign(new Error('permission denied'),{code:'permission-denied'});
  await assert.rejects(actual(app,'handleAddPayment',{...bindings,requireSharedWriteConfirmation:async()=>{throw denied;}})(data),error=>error===denied);
  assert.equal(calls[1].writes[0].documentId,'p_qa_stable');
});
