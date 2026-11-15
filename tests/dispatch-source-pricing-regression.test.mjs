import test from 'node:test';
import assert from 'node:assert/strict';
import {matchDispatchOrder, selectPreferredDispatchOrderRow} from '../development/hd-manager/application/src/features/warehouse/matchDispatchOrder.js';
import {buildDispatchOrderDefaults} from '../development/hd-manager/application/src/features/warehouse/buildDispatchOrderDefaults.js';
import {coordinateDispatchBilling} from '../development/hd-manager/application/src/features/warehouse/coordinateDispatchBilling.js';
import {buildDispatchEditorDraft} from '../development/hd-manager/application/src/features/warehouse/dispatchEditorModel.js';
import {submitDispatchForm} from '../development/hd-manager/application/src/features/warehouse/submitDispatchForm.js';
import {resolveTransactionBillingSnapshot, buildCustomerProductBillingSnapshot, isSameBillingUnit, isWarehouseDispatchActualUnitCompatible} from '../development/hd-manager/application/src/services/customerProductBilling.js';

const product={id:'product',name:'Product',unit:'Con'};
const customer={id:'customer',name:'Customer'};
const num=x=>Number(x)||0;
const timestamp=r=>Date.parse(r?.createdAt||'')||0;
const config={configurationId:'current-config',billingUnit:'Kg',pricingUnit:'Kg',unitPrice:49000,source:'customer_fixed_product'};
const row=(id,date,quantity,unitPrice,extra={})=>({
  requestId:id,requestDate:date,requestTimestamp:Date.parse(date+'T15:00:00Z'),rowKey:id+'_0',itemIndex:0,
  customerId:customer.id,productId:product.id,branchId:'',sizeLabel:'',quantityUnit:'Con',
  item:{productId:product.id,quantity,actualQuantity:quantity,actualUnit:'Con',quantityUnit:'Con',
    billingUnit:'Kg',unitPrice,billingSnapshotVersion:1,billingSnapshotSource:'order_request_snapshot',...extra},...extra,
});
const old=row('old','2026-09-14',20,57000);
const recent=row('recent','2026-11-14',15,67000,{sizeLabel:'1.4-1.5kg',attributeLabel:'To'});
const ports=(rows,issues=[])=>({dispatchOrderRows:rows,dispatchShortageSummary:{issueLines:issues},
  buildDispatchOrderRowFromShortageLine:(_,r)=>r,getDispatchRowQuantity:r=>num(r.quantity??r.pieceCount),
  getDispatchRowWeight:r=>num(r.weightKg),getOrderLineQuantityValue:r=>num(r.quantity),
  getOrderLineWeightKgValue:r=>num(r.weightKg),getOrderLineSizeLabel:r=>r.sizeLabel||'',
  getOrderLineUnitPriceValue:r=>num(r.unitPrice),normalizeLookupText:s=>String(s||'').toLowerCase(),
  getEntityTimestamp:timestamp,areLooseQuantityValuesClose:(a,b,t=.001)=>Math.abs(a-b)<=t});
const billingPorts={products:[product],getCustomerBranchProductConfigSource:()=>customer,
  resolveCustomerProductBillingConfiguration:()=>config,resolveTransactionBillingSnapshot,
  resolveCustomerProductActualUnit:()=> 'Con',isSameBillingUnit,buildCustomerProductBillingSnapshot,isWarehouseDispatchActualUnitCompatible};
const defaultPorts={...billingPorts,productLookup:new Map([[product.id,product]]),customerLookup:new Map([[customer.id,customer]]),
  normalizeDispatchQuantityUnit:s=>s,parseLooseQuantityValue:num,formatDispatchNumberInput:String};

test('automatic dispatch source uses current matching order, not old equal quantity',()=>{
  for(const rows of [[old,recent],[recent,old]]) {
    const selected=matchDispatchOrder(customer.id,product.id,{quantity:20,weightKg:30,quantityUnit:'Con',sizeLabel:'1.4-1.5kg'},ports(rows));
    assert.equal(selected.requestId,'recent');
    assert.equal(selected.item.unitPrice,67000);
    assert.equal(selectPreferredDispatchOrderRow(rows,timestamp).requestId,'recent');
  }
});

test('selected source ID/line survives changing quantity, weight and editor recovery',()=>{
  const defaults=buildDispatchOrderDefaults(recent,defaultPorts);
  assert.equal(defaults.sourceOrderRequestId,'recent');assert.equal(defaults.sourceOrderRequestRowKey,'recent_0');
  const edited={...defaults,quantity:20,weightKg:30,quantityUnit:'Con'};
  const selected=matchDispatchOrder(customer.id,product.id,edited,ports([old,recent]));
  assert.equal(selected.requestId,'recent');
  const snapshot=coordinateDispatchBilling({customer,product,matchedOrderRow:selected,actualQuantity:20,actualUnit:'Con',actualWeightKg:30},billingPorts);
  assert.equal(snapshot.unitPrice,67000);assert.equal(snapshot.amount,2010000);assert.equal(snapshot.actualQuantity,20);
  const draft=buildDispatchEditorDraft({...snapshot,sourceOrderRequestId:'recent',sourceOrderRequestRowKey:'recent_0'});
  assert.equal(draft.sourceOrderRequestId,'recent');assert.equal(draft.sourceOrderRequestRowKey,'recent_0');
  assert.equal(buildDispatchOrderDefaults(null,defaultPorts).sourceOrderRequestId,'');
});

test('explicit historical source remains selected and missing source never silently falls back',()=>{
  assert.equal(matchDispatchOrder(customer.id,product.id,{sourceOrderRequestId:'old',sourceOrderRequestRowKey:'old_0'},ports([recent,old])).requestId,'old');
  for(const key of ['old_0','old_product','old_product_0'])assert.equal(matchDispatchOrder(customer.id,product.id,{sourceOrderRequestId:'old',sourceOrderRequestRowKey:key},ports([recent,old])).requestId,'old');
  assert.equal(matchDispatchOrder(customer.id,product.id,{sourceOrderRequestId:'unavailable'},ports([recent,old])),null);
  assert.equal(matchDispatchOrder(customer.id,product.id,{sourceOrderRequestId:'old',sourceOrderRequestRowKey:'recent_0'},ports([recent,old])),null);
  assert.equal(matchDispatchOrder('other-customer',product.id,{},ports([recent,old])),null);
  assert.equal(matchDispatchOrder(customer.id,product.id,{branchId:'another-branch'},ports([recent,old])),null);
});

test('two lines of the same product retain distinct source rows and prices',()=>{
  const second={...recent,rowKey:'recent_1',itemIndex:1,quantityUnit:'Bộ',item:{...recent.item,unitPrice:72000,quantityUnit:'Bộ',actualUnit:'Bộ',billingUnit:'Bộ'}};
  const issue={customerId:customer.id,productId:product.id,requestLines:[{requestId:'recent',itemIndex:1,rowKey:'recent_product_1'}]};
  const selected=matchDispatchOrder(customer.id,product.id,{sourceOrderRequestId:'recent',sourceOrderRequestRowKey:'recent_1'},ports([recent,second],[issue]));
  assert.equal(selected.rowKey,'recent_1');assert.equal(selected.item.unitPrice,72000);
});

test('existing snapshots stay fixed unless the customer, product or source actually changes',()=>{
  const saved={...buildCustomerProductBillingSnapshot({configuration:{...config,unitPrice:57000},actualQuantity:20,actualUnit:'Con',actualWeightKg:30}),
    customerId:customer.id,productId:product.id,sourceOrderRequestId:'old',sourceOrderRequestRowKey:'old_0'};
  const input={customer,product,existingRecord:saved,actualQuantity:20,actualUnit:'Con',actualWeightKg:30};
  assert.equal(coordinateDispatchBilling({...input,matchedOrderRow:old},billingPorts).unitPrice,57000);
  assert.equal(coordinateDispatchBilling({...input,matchedOrderRow:recent},billingPorts).unitPrice,67000);
  assert.equal(coordinateDispatchBilling({...input,customer:{id:'other'},matchedOrderRow:null},billingPorts).unitPrice,49000);
  assert.equal(coordinateDispatchBilling({...input,product:{...product,id:'other'},matchedOrderRow:null},billingPorts).unitPrice,49000);
});

test('submission stores the same source ID, price and amount and refuses orphaned source',async()=>{
  const defaults=buildDispatchOrderDefaults(recent,defaultPorts),writes=[],errors=[];
  const p={canCreate:true,employee:{id:'warehouse'},customerLookup:new Map([[customer.id,customer]]),productLookup:new Map([[product.id,product]]),employeeLookup:new Map(),
    dispatchDraft:{...defaults,customerId:customer.id,productId:product.id,pieceCount:'20',weightKg:'30',quantityUnit:'Con',weightEntries:[]},
    normalizeDispatchQuantityUnit:s=>s,setDispatchError:e=>errors.push(e),dispatchSaveLockRef:{current:false},setIsSavingDispatch:()=>{},
    findMatchingOrderRequestRowForDispatch:(c,p,d)=>matchDispatchOrder(c,p,d,ports([old,recent])),
    getDispatchOrderBranchRef:()=>({branchId:'',branchName:'',branchAddress:''}),buildDispatchBillingSnapshot:i=>coordinateDispatchBilling(i,billingPorts),
    effectiveDispatchDriverId:'',canCreateDispatchWithoutOrderRequest:true,canUseManualDispatchProductOverride:()=>true,
    workingDate:'2026-11-15',selectedOrderRequestDateKey:'2026-11-15',normalizeWarehouseWeightEntries:()=>[],capitalizeFirst:s=>String(s||''),
    dispatchCreateMutationRef:{current:null},vpsUnits:[],getCustomerDisplayName:c=>c.name,buildWarehouseDispatchSourceType:()=> 'manual',
    onAddWarehouseDispatch:async(_actor,doc)=>writes.push(doc),setDispatchPickerOpen:()=>{},setDispatchDriverSelectionTouched:()=>{},setDispatchDraft:()=>{},createEmptyDispatchDraft:()=>({}),getFriendlyFirebaseErrorMessage:()=> 'Error'};
  await submitDispatchForm({preventDefault(){}},p);
  assert.equal(writes.length,1);const doc=writes[0];
  assert.equal(doc.sourceOrderRequestId,'recent');assert.equal(doc.sourceOrderRequestRowKey,'recent_0');
  for(const key of ['unitPrice','price','sourceOrderRequestUnitPrice','orderRequestUnitPrice','requestUnitPrice'])assert.equal(doc[key],67000,key);
  assert.equal(doc.amount,2010000);assert.equal(doc.quantity,20);assert.equal(doc.billingQuantity,30);
  p.dispatchDraft.unitPrice=68000;
  await submitDispatchForm({preventDefault(){}},p);
  assert.equal(writes.length,1);assert.match(errors.at(-1),/Đơn giá đơn đặt nguồn đã thay đổi/);
  p.dispatchDraft.unitPrice=67000;
  p.dispatchDraft.sourceOrderRequestId='unavailable';
  await submitDispatchForm({preventDefault(){}},p);
  assert.equal(writes.length,1);assert.match(errors.at(-1),/đơn đặt nguồn/);assert.equal(p.dispatchSaveLockRef.current,false);
});
