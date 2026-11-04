import test from 'node:test';import assert from 'node:assert/strict';
import {buildWarehouseGroupOptions} from '../src/utils/warehouseGroupOptions.js';
import {runCooperativeProjection} from '../src/services/cooperativeProjection.js';
import {eagerWarehouseGroups} from './fixtures/warehouse-group-options-reference.mjs';
import {appFunction} from './helpers/app-source-function.mjs';
const normalizeLookupText=appFunction('normalizeLookupText');
const capitalizeFirst=appFunction('capitalizeFirst');
const normalizeLeadingLabel=appFunction('normalizeLeadingLabel',{capitalizeFirst});
const normalizeProductGroups=appFunction('normalizeProductGroups',{normalizeLeadingLabel,normalizeLookupText});
const buildProcessingInventoryGroupKey=appFunction('buildProcessingInventoryGroupKey',{normalizeLookupText});
const getProductMainGroupLabel=appFunction('getProductMainGroupLabel',{normalizeLeadingLabel,normalizeLookupText});
const getWarehouseInventoryGroupLabel=appFunction('getWarehouseInventoryGroupLabel',{normalizeLeadingLabel,normalizeLookupText,getProductMainGroupLabel},{memoCallback:true});
function fixture(){
 const products=[{id:'v',name:'Vịt Không Móc',mainGroup:'Vịt'},{id:'g',name:'Gà CN',category:'Gà công nghiệp'},{id:'bag',name:'bao đựng'}];
 const item=i=>[{productId:'v'},{productId:'g'},{groupName:'đÁ'},{productGroupName:'Phụ phẩm'},
  {productGroup:'HEO'},{productId:'missing',description:'Nhóm mới'},{productName:'Vịt'},{groupName:'Đá'}][i%8];
 const old={products,warehouseProductLookup:new Map(products.map(p=>[p.id,p])),currentCompany:{productGroups:[' Hải sản ','hải sản','Chim']},
  DEFAULT_PROCESSING_INVENTORY_GROUPS:['Vịt','Gà'],normalizeProductGroups,normalizeLeadingLabel,buildProcessingInventoryGroupKey,getWarehouseInventoryGroupLabel,
  warehouseImports:[{groupName:'Kho A'},{productGroup:'KHO A'},{}],warehouseDispatches:Array.from({length:300},(_,i)=>item(i)),
  orders:Array.from({length:5400},(_,i)=>({items:[item(i),item(i+1)]})),
  orderRequests:[{items:[item(0)]},{lines:[item(1)]},{products:[item(2)]},{}]};
 const current={defaults:old.DEFAULT_PROCESSING_INVENTORY_GROUPS,companyGroups:normalizeProductGroups(old.currentCompany.productGroups),products,
  productLookup:old.warehouseProductLookup,imports:old.warehouseImports,dispatches:old.warehouseDispatches,orders:old.orders,requests:old.orderRequests,
  resolveProductGroup:getWarehouseInventoryGroupLabel,normalizeLabel:normalizeLeadingLabel,groupKey:buildProcessingInventoryGroupKey};
 return {old,current};
}
test('historical warehouse group picker exactly matches frozen eager labels and ordering with real normalization',()=>{
 const {old,current}=fixture(),before=JSON.stringify(old),it=buildWarehouseGroupOptions(current);let next,steps=0;
 do{next=it.next();steps++}while(!next.done);
 assert.deepEqual(next.value,eagerWarehouseGroups(old));assert.ok(steps>old.orders.length*2);
 assert.equal(JSON.stringify(old),before,'no mutation of history or product records');
});
test('warehouse picker history work yields and obsolete work cancels without publishing partial groups',async()=>{
 const {old,current}=fixture();let clock=0,yields=0;
 const value=await runCooperativeProjection(()=>buildWarehouseGroupOptions(current),{now:()=>clock++,yieldTask:async()=>{yields++},budgetMs:4});
 assert.deepEqual(value,eagerWarehouseGroups(old));assert.ok(yields>100);
 const controller=new AbortController();let turns=0;
 await assert.rejects(runCooperativeProjection(()=>buildWarehouseGroupOptions(current),{signal:controller.signal,now:()=>clock++,yieldTask:async()=>{if(++turns===3)controller.abort()}}),{name:'AbortError'});
});
