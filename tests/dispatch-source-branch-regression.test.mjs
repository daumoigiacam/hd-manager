import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parse} from '@babel/parser';
import * as matching from '../development/hd-manager/application/src/features/warehouse/matchDispatchOrder.js';
import {buildDispatchOrderDefaults} from '../development/hd-manager/application/src/features/warehouse/buildDispatchOrderDefaults.js';
import {submitDispatchForm} from '../development/hd-manager/application/src/features/warehouse/submitDispatchForm.js';
import {coordinateDispatchBilling} from '../development/hd-manager/application/src/features/warehouse/coordinateDispatchBilling.js';
import {resolveTransactionBillingSnapshot,buildCustomerProductBillingSnapshot,isSameBillingUnit,isWarehouseDispatchActualUnitCompatible} from '../development/hd-manager/application/src/services/customerProductBilling.js';

const app=fs.readFileSync('development/hd-manager/application/src/App.jsx','utf8');
let builder;
function visit(node){
 if(!node||typeof node!=='object')return;
 if(node.type==='VariableDeclarator'&&node.id?.name==='buildDispatchOrderRowFromShortageLine')builder=node.init;
 for(const [key,value]of Object.entries(node)){
  if(['loc','start','end','extra','comments'].includes(key))continue;
  if(Array.isArray(value))value.forEach(visit);else if(value?.type)visit(value);
 }
}
visit(parse(app,{sourceType:'module',plugins:['jsx']}));
assert.ok(builder,'Use the actual canonical WarehouseDispatchView callback');
const customer={id:'customer',name:'Customer with a branch'},product={id:'product',name:'Duck',unit:'Kg'};
const item={productId:product.id,quantity:35,actualQuantity:35,quantityUnit:'Kg',actualUnit:'Kg',billingUnit:'Kg',unitPrice:52000,billingSnapshotVersion:1,billingSnapshotSource:'order_request_snapshot'};
const sourceRow={requestId:'request-16',rowKey:'request-16_0',itemIndex:0,requestDate:'2026-11-16',customerId:customer.id,productId:product.id,branchId:'branch-a',branchName:'Branch A',branchAddress:'Branch address',customerBranchId:'branch-a',quantityUnit:'Kg',item};
const shortage={customerId:customer.id,productId:product.id,productName:product.name};
const requestLine={requestId:'request-16',rowKey:'request-16_product_0',itemIndex:0,requestDate:'2026-11-16',quantity:35,quantityUnit:'Kg',unitPrice:52000};
const number=x=>Number(x)||0;
const branchRef=(_customer,source={},fallback={})=>({branchId:source.branchId||source.customerBranchId||fallback.branchId||fallback.customerBranchId||'',branchName:source.branchName||'',branchAddress:source.branchAddress||''});
const config={configurationId:'current-config',billingUnit:'Kg',unitPrice:49000,source:'customer_fixed_product'};
const billingPorts={products:[product],getCustomerBranchProductConfigSource:()=>customer,resolveCustomerProductBillingConfiguration:()=>config,resolveTransactionBillingSnapshot,resolveCustomerProductActualUnit:()=> 'Kg',isSameBillingUnit,buildCustomerProductBillingSnapshot,isWarehouseDispatchActualUnitCompatible};
const defaultPorts={...billingPorts,productLookup:new Map([[product.id,product]]),customerLookup:new Map([[customer.id,customer]]),normalizeDispatchQuantityUnit:v=>v,parseLooseQuantityValue:number,formatDispatchNumberInput:String};
const matchPorts=rows=>({dispatchShortageSummary:{issueLines:[{...shortage,requestLines:[requestLine]}]},dispatchOrderRows:rows,buildDispatchOrderRowFromShortageLine:()=>({...sourceRow}),getDispatchRowQuantity:r=>number(r.quantity??r.pieceCount),getDispatchRowWeight:r=>number(r.weightKg),getOrderLineQuantityValue:r=>number(r.quantity),getOrderLineWeightKgValue:r=>number(r.weightKg),getOrderLineSizeLabel:r=>r.sizeLabel||'',getOrderLineUnitPriceValue:r=>number(r.unitPrice),normalizeLookupText:v=>String(v||'').toLowerCase(),getEntityTimestamp:()=>0,areLooseQuantityValuesClose:(a,b)=>Math.abs(a-b)<.001});
function actualShortageBuilder(rows){
 const bindings={dispatchOrderRows:rows,resolveDispatchShortageOrderRow:matching.resolveDispatchShortageOrderRow,productLookup:new Map([[product.id,product]]),customerLookup:new Map([[customer.id,customer]]),getDispatchOrderBranchRef:branchRef,selectedOrderRequestDateKey:'2026-11-17',getProductShortName:()=> 'VB',getOrderLineUnitPriceValue:r=>number(r.unitPrice),getOrderLineQuantityValue:r=>number(r.quantity),getOrderLineWeightKgValue:r=>number(r.weightKg),getOrderLineSizeLabel:r=>r.sizeLabel||'',getOrderLineAttributeLabel:r=>r.attributeLabel||''};
 return new Function(...Object.keys(bindings),'return ('+app.slice(builder.start,builder.end)+');')(...Object.values(bindings));
}
function createPorts(defaults,rows){
 const writes=[],errors=[];
 return {writes,errors,p:{canCreate:true,employee:{id:'warehouse'},customerLookup:defaultPorts.customerLookup,productLookup:defaultPorts.productLookup,employeeLookup:new Map(),dispatchDraft:{...defaults,customerId:customer.id,productId:product.id,pieceCount:'35',weightKg:'35.3',quantityUnit:'Kg',weightEntries:[35.3]},normalizeDispatchQuantityUnit:v=>v,setDispatchError:v=>errors.push(v),dispatchSaveLockRef:{current:false},setIsSavingDispatch:()=>{},findMatchingOrderRequestRowForDispatch:(c,p,d)=>matching.matchDispatchOrder(c,p,d,matchPorts(rows)),getDispatchOrderBranchRef:branchRef,buildDispatchBillingSnapshot:i=>coordinateDispatchBilling(i,billingPorts),effectiveDispatchDriverId:'driver',canCreateDispatchWithoutOrderRequest:false,canUseManualDispatchProductOverride:()=>false,workingDate:'2026-11-17',selectedOrderRequestDateKey:'2026-11-17',normalizeWarehouseWeightEntries:v=>v,capitalizeFirst:v=>String(v||''),dispatchCreateMutationRef:{current:null},vpsUnits:[],getCustomerDisplayName:c=>c.name,buildWarehouseDispatchSourceType:()=> 'manual',onAddWarehouseDispatch:async(_,payload)=>writes.push(payload),setDispatchPickerOpen:()=>{},setDispatchDriverSelectionTouched:()=>{},setDispatchDraft:()=>{},createEmptyDispatchDraft:()=>({}),getFriendlyFirebaseErrorMessage:e=>e.message}};
}

test('a shortage suggestion retains the canonical source branch and billing metadata',()=>{
 const selected=actualShortageBuilder([sourceRow])(shortage,requestLine);
 assert.equal(selected.branchId,'branch-a','The shortage projection does not contain the branch; resolve the source row before filling the form');
 assert.strictEqual(selected,sourceRow,'Reuse the complete current order row, not a reconstructed partial billing record');
 const defaults=buildDispatchOrderDefaults(selected,defaultPorts);
 assert.equal(defaults.branchId,'branch-a');assert.equal(defaults.unitPrice,52000);
 assert.equal(matching.matchDispatchOrder(customer.id,product.id,defaults,matchPorts([sourceRow]))?.requestId,'request-16');
});

test('35 Kg ordered and 35.3 Kg weighed can save against the correct branch on the next day',async()=>{
 const defaults=buildDispatchOrderDefaults(actualShortageBuilder([sourceRow])(shortage,requestLine),defaultPorts);
 const {p,writes,errors}=createPorts(defaults,[sourceRow]);
 await submitDispatchForm({preventDefault(){}},p);
 assert.equal(writes.length,1,errors.at(-1));
 const saved=writes[0];
 assert.equal(saved.branchId,'branch-a');assert.equal(saved.sourceOrderRequestId,'request-16');assert.equal(saved.sourceOrderRequestRowKey,'request-16_0');
 assert.equal(saved.sourceOrderRequestDate,'2026-11-16');assert.equal(saved.date,'2026-11-17');
 assert.equal(saved.unitPrice,52000);assert.equal(saved.weightKg,35.3);assert.equal(saved.isOutsideOrderRequest,false);
 assert.equal(saved.billingQuantity,35.3);assert.equal(saved.amount,1835600);
 assert.equal(p.dispatchSaveLockRef.current,false);
});

test('stable source keys disambiguate identical products and retain their own branches and prices',()=>{
 const second={...sourceRow,rowKey:'request-16_second',itemIndex:1,branchId:'branch-b',item:{...item,id:'second',unitPrice:61000}};
 const rows=[sourceRow,second];
 for(const key of ['second','request-16_second','request-16_product_1']){
  assert.strictEqual(matching.resolveDispatchShortageOrderRow(shortage,{...requestLine,rowKey:key,itemIndex:1},rows),second);
 }
 assert.strictEqual(matching.resolveDispatchShortageOrderRow(shortage,{...requestLine,rowKey:'request-16_product',itemIndex:1},rows),second);
 assert.equal(matching.resolveDispatchShortageOrderRow(shortage,{requestId:'request-16',rowKey:'request-16_product'},rows),null,'A legacy product-only key cannot silently select the first of two lines');
 assert.equal(matching.resolveDispatchShortageOrderRow(shortage,{...requestLine,rowKey:'removed-stable-id',itemIndex:0},rows),null,'A missing stable ID cannot be replaced with an arbitrary indexed line');
 assert.equal(matching.resolveDispatchShortageOrderRow(shortage,{requestId:'request-16',itemIndex:9},[sourceRow]),null);
 assert.equal(matching.resolveDispatchShortageOrderRow({...shortage,customerId:'another'},requestLine,rows),null);
 assert.equal(matching.resolveDispatchShortageOrderRow(shortage,{...requestLine,requestId:'another-request'},rows),null);
});

test('missing source, changed source price and a mismatched branch still block saving and retain the draft',async()=>{
 const defaults=buildDispatchOrderDefaults(actualShortageBuilder([sourceRow])(shortage,requestLine),defaultPorts);
 for(const patch of [{sourceOrderRequestId:'missing'},{branchId:'wrong-branch'},{unitPrice:53000}]){
  const {p,writes,errors}=createPorts({...defaults,...patch},[sourceRow]);
  const draft=p.dispatchDraft;
  await submitDispatchForm({preventDefault(){}},p);
  assert.equal(writes.length,0);assert.ok(errors.at(-1));
  assert.strictEqual(p.dispatchDraft,draft);assert.equal(p.dispatchSaveLockRef.current,false);
 }
});
