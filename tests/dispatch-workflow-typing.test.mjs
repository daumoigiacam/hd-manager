import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {matchDispatchOrder} from '../src/features/warehouse/matchDispatchOrder.js';
import {coordinateDispatchBilling} from '../src/features/warehouse/coordinateDispatchBilling.js';
import {submitDispatchForm} from '../src/features/warehouse/submitDispatchForm.js';
import {buildDispatchOrderDefaults} from '../src/features/warehouse/buildDispatchOrderDefaults.js';
import {createEmptyDispatchDraft} from '../src/features/warehouse/warehouseDispatchFormModel.js';
const before=JSON.parse(readFileSync(new URL('./fixtures/dispatch-workflow-before-typing.json',import.meta.url),'utf8'));
const legacy=(name,ports)=>new Function(...Object.keys(ports),`return (${before[name]});`)(...Object.values(ports));
const num=x=>Number(x)||0;
test('order form defaults preserve frozen and fallback values and physical/billing units',()=>{
  for(const frozen of [false,true])for(const unit of ['Kg','Con'])for(const quantity of [0,5]){
    const configuration={configurationId:'config',billingUnit:unit,unitPrice:50000,source:'current'};
    const ports={
      products:[],productLookup:new Map([['p',{id:'p',name:'Product',unit:'Con'}]]),customerLookup:new Map(),
      getCustomerBranchProductConfigSource:()=>null,resolveCustomerProductBillingConfiguration:()=>configuration,
      resolveTransactionBillingSnapshot:()=>({configurationId:'saved',hasFrozenPricing:frozen,billingUnit:unit,actualUnit:'Con',actualQuantity:quantity,actualWeightKg:quantity?10:0,billingQuantity:quantity?10:0,unitPrice:39000,amount:390000}),
      resolveCustomerProductActualUnit:()=> 'Con',normalizeDispatchQuantityUnit:s=>s,isSameBillingUnit:(a,b)=>a===b,
      parseLooseQuantityValue:num,formatDispatchNumberInput:String
    };
    for(const row of [null,{productId:'p',quantity:3,weightKg:6},{productId:'p',item:{quantity:7,weightKg:14}}]){
      assert.deepEqual(buildDispatchOrderDefaults(row,ports),legacy('buildDispatchDefaultsFromOrderRow',ports)(row));
    }
  }
});
test('matching stays identical to pre-extraction priority and tie-breaking across 200 cases',()=>{
  for(let i=0;i<200;i++){
    const rows=Array.from({length:12},(_,j)=>({customerId:'c',productId:'p',rowKey:`row${j}`,requestId:`r${j}`,requestDate:'2026-10-06',quantity:j%5,weightKg:j+1,quantityUnit:'Con',sizeLabel:j%2?'2kg':'3kg',item:{requestTimestamp:j,quantity:j%5,weightKg:j+1,unitPrice:50000}}));
    const ports={dispatchOrderRows:rows,dispatchShortageSummary:{issueLines:[{customerId:'c',productId:'p',requestLines:[rows[0]]}]},buildDispatchOrderRowFromShortageLine:(_,r)=>r,
      getDispatchRowQuantity:r=>num(r.quantity),getDispatchRowWeight:r=>num(r.weightKg),getOrderLineQuantityValue:r=>num(r.quantity),getOrderLineWeightKgValue:r=>num(r.weightKg),getOrderLineSizeLabel:r=>r.sizeLabel||'',getOrderLineUnitPriceValue:r=>num(r.unitPrice),normalizeLookupText:s=>s.toLowerCase(),getEntityTimestamp:()=>0,areLooseQuantityValuesClose:(a,b,t=.001)=>Math.abs(a-b)<=t};
    const input={quantity:i%5,weightKg:i%12+1,sourceOrderRequestRowKey:i%3?'':`row${i%12}`,sourceOrderRequestId:i%4?'':`r${i%12}`,quantityUnit:'Con',size:'2kg'};
    assert.equal(matchDispatchOrder('c','p',input,ports),legacy('findMatchingOrderRequestRowForDispatch',ports)('c','p',input));
    assert.equal(matchDispatchOrder('missing','p',input,ports),null);
  }
});

test('billing orchestration preserves warehouse/order/current pricing precedence and unit rejection',()=>{
  for(const existingFrozen of [false,true])for(const orderFrozen of [false,true])for(const compatible of [false,true]){
    const configuration={configurationId:'current',billingUnit:'Kg',unitPrice:30,source:'current'};
    const input={customer:{id:'c',name:'C'},product:{id:'p',name:'P'},existingRecord:{id:'existing'},matchedOrderRow:{item:{id:'order'}},actualQuantity:5,actualUnit:'Con',actualWeightKg:10};
    const ports={products:[],getCustomerBranchProductConfigSource:()=>null,resolveCustomerProductBillingConfiguration:()=>configuration,
      resolveTransactionBillingSnapshot:({record})=>({hasFrozenPricing:record?.id==='existing'?existingFrozen:orderFrozen,configurationId:record?.id,billingUnit:'Kg',unitPrice:record?.id==='existing'?10:20,actualUnit:'Kg'}),
      resolveCustomerProductActualUnit:()=> 'Con',isSameBillingUnit:(a,b)=>a.toLowerCase()===b.toLowerCase(),
      buildCustomerProductBillingSnapshot:args=>({...args.configuration,actualQuantity:args.actualQuantity,actualUnit:args.actualUnit,actualWeightKg:args.actualWeightKg,billingSnapshotValid:true}),isWarehouseDispatchActualUnitCompatible:()=>compatible};
    assert.deepEqual(coordinateDispatchBilling(input,ports),legacy('buildDispatchBillingSnapshot',ports)(input));
    assert.equal(coordinateDispatchBilling(input,ports).unitPrice,existingFrozen?10:orderFrozen?20:30);
  }
});

function createPorts(){
  const saved=[],errors=[],busy=[];let resets=0;
  const ports={canCreate:true,employee:{id:'e'},customerLookup:new Map([['c',{id:'c',name:'C'}]]),productLookup:new Map([['p',{id:'p',name:'P'}]]),employeeLookup:new Map(),
    dispatchDraft:{...createEmptyDispatchDraft(),customerId:'c',productId:'p',pieceCount:'5',weightKg:'10',quantityUnit:'Con'},normalizeDispatchQuantityUnit:s=>s,
    setDispatchError:e=>errors.push(e),dispatchSaveLockRef:{current:false},setIsSavingDispatch:b=>busy.push(b),
    findMatchingOrderRequestRowForDispatch:()=>({requestId:'r',rowKey:'row',requestDate:'2026-10-06'}),getDispatchOrderBranchRef:()=>({branchId:'b',branchName:'B',branchAddress:'A'}),
    buildDispatchBillingSnapshot:()=>({billingSnapshotValid:true,actualQuantity:10,actualUnit:'Con',unitPrice:50000,amount:500000,billingUnit:'Kg'}),effectiveDispatchDriverId:'',
    canCreateDispatchWithoutOrderRequest:false,canUseManualDispatchProductOverride:()=>false,workingDate:'2026-10-06',selectedOrderRequestDateKey:'2026-10-06',
    normalizeWarehouseWeightEntries:e=>e.map(Number),capitalizeFirst:s=>s,dispatchCreateMutationRef:{current:null},vpsUnits:[],getCustomerDisplayName:c=>c.name,buildWarehouseDispatchSourceType:b=>b,
    onAddWarehouseDispatch:async(id,payload)=>{saved.push({id,payload});},setDispatchPickerOpen:()=>{},setDispatchDriverSelectionTouched:()=>{},setDispatchDraft:()=>{resets++;},createEmptyDispatchDraft,getFriendlyFirebaseErrorMessage:e=>e.message};
  return {ports,saved,errors,busy,resets:()=>resets};
}
test('create awaits real command, blocks double tap, preserves payload and resets only on completion',async()=>{
  const f=createPorts();let finish;const pending=new Promise(resolve=>{finish=resolve;});
  const save=f.ports.onAddWarehouseDispatch;f.ports.onAddWarehouseDispatch=async(...args)=>{await save(...args);await pending;};
  const first=submitDispatchForm({preventDefault(){}},f.ports);
  await submitDispatchForm({preventDefault(){}},f.ports);
  assert.equal(f.saved.length,1);assert.equal(f.resets(),0);assert.equal(f.ports.dispatchSaveLockRef.current,true);
  assert.equal(f.saved[0].payload.pieceCount,5);assert.equal(f.saved[0].payload.quantity,10);assert.equal(f.saved[0].payload.amount,500000);
  finish();await first;assert.equal(f.resets(),1);assert.equal(f.ports.dispatchCreateMutationRef.current,null);
  assert.deepEqual(f.busy,[true,false]);
});
test('failed create preserves draft and command ID for retry; denied outside order never writes',async()=>{
  const f=createPorts();const ids=[];
  f.ports.onAddWarehouseDispatch=async(_,p)=>{ids.push(p.clientMutationId);throw Error('network');};
  await submitDispatchForm({preventDefault(){}},f.ports);await submitDispatchForm({preventDefault(){}},f.ports);
  assert.equal(ids.length,2);assert.equal(ids[0],ids[1]);assert.equal(f.resets(),0);assert.equal(f.ports.dispatchSaveLockRef.current,false);
  f.ports.findMatchingOrderRequestRowForDispatch=()=>null;
  await submitDispatchForm({preventDefault(){}},f.ports);assert.equal(ids.length,2);
});
