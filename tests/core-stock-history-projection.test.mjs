import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {appFunction} from './helpers/app-source-function.mjs';
import {createProjectionCache,runCooperativeProjection} from '../src/services/cooperativeProjection.js';
import {buildProductStockBalanceIndex} from '../src/utils/productMeasures.js';
import {resolveTransactionBillingSnapshot} from '../src/services/customerProductBilling.js';
const bindings={buildProductStockBalanceIndex,resolveTransactionBillingSnapshot};
for(const name of ['capitalizeFirst','normalizeLookupText','parseLooseQuantityValue','parseLooseMoneyValue','normalizeLeadingLabel',
  'getProductInventoryUnit','getProductOpeningStock','getProductMainGroupLabel','normalizeInventoryUnitKey','isSameInventoryUnit',
  'getOrderItemQuantityUnit','getOrderItemQuantityValue','getOrderLineUnitPriceValue','getOrderLineQuantityValue','getOrderLineWeightKgValue',
  'getTransactionBillingPresentation','getOrderItemRevenue','getOrderItemCost'])bindings[name]=appFunction(name,bindings);
const metrics=appFunction('buildInventoryMetrics',bindings);
const frozen=readFileSync(new URL('./fixtures/inventory-metrics.baseline.mjs',import.meta.url),'utf8');
const baseline=new Function(...Object.keys(bindings),'return '+frozen.slice(frozen.indexOf('export default ')+15))(...Object.values(bindings));
test('cooperative inventory retains every quantity, cost, revenue, archived exclusion and duplicate-ID unit',async()=>{
  const products=[{id:'p',name:'Vịt',unit:'Con',openingStock:-2,costPrice:19},{id:'p',name:'Bao',unit:'Kg',openingStock:1,costPrice:9},{id:'q',unit:'Con',isArchived:true}];
  const orders=Array.from({length:300},(_,i)=>({id:'o'+i,date:i%11?'2026-10-03':'2026-10-04',isArchived:i%17===0,
    items:[{productId:'p',quantity:i%2?0.1:0.2,unit:'Kg',unitPrice:13},{productId:'missing',quantity:999,unitPrice:999}]}));
  const imports=[{date:'2026-10-02',productId:'p',quantity:3,totalKg:5},{date:'2026-10-03',productId:'p',quantity:9,totalKg:11,__pendingFirebaseSync:true}];
  const dispatches=[{date:'2026-10-03',productId:'p',quantity:1,totalKg:0.1}];
  const before=structuredClone({products,orders,imports,dispatches});
  for(const stock of [false,true]){
    const options={untilDate:'2026-10-03',...(stock?{warehouseImports:imports,warehouseDispatches:dispatches}:{})};let yields=0;
    const actual=await runCooperativeProjection(()=>metrics(products,orders,{...options,cooperative:true}),{maxOperations:1,yieldTask:async()=>{yields++;}});
    assert.deepEqual(actual,baseline(products,orders,options));assert.ok(yields>10);
  }
  assert.deepEqual({products,orders,imports,dispatches},before);
});
test('superseded inventory preparation cannot return partial financial totals',async()=>{
  const controller=new AbortController();let turns=0,published=false;
  await assert.rejects(runCooperativeProjection(()=>metrics([],[],{cooperative:true}),{signal:controller.signal,maxOperations:1,
    yieldTask:async()=>{if(++turns===2)controller.abort();}}).then(()=>{published=true;}),{name:'AbortError'});
  assert.equal(published,false);
});
const historyFrozen=readFileSync(new URL('./fixtures/dispatch-history-groups.baseline.mjs',import.meta.url),'utf8');
const oldHistory=new Function('return '+historyFrozen.slice(historyFrozen.indexOf('export default ')+15))();
function historyPorts(){return {
  useMemo:f=>f(),dispatchProjectionAttempt:0,employeeLookup:new Map(),
  warehouseDispatches:Array.from({length:400},(_,i)=>({id:'d'+i,date:'2026-10-'+String(1+i%28).padStart(2,'0'),
    customerId:'c',productId:'p',pieceCount:i%2?0.1:0.2,weightKg:i%3?0.2:0.1,driverId:'e'+i%2,isArchived:i%19===0})),
  customerLookup:new Map([['c',{id:'c',name:'Customer'}]]),productLookup:new Map([['p',{id:'p',name:'Product'}]]),
  resolveEntityDateKey:row=>row.date,getTodayString:()=> '2026-11-01',getProductShortName:p=>p?.name||'',
  getDispatchRowQuantityUnit:row=>row.unit||'Con',getDispatchDriverId:row=>row.driverId||'',getDispatchDriverName:row=>row.driverId||'',
  normalizeLookupText:bindings.normalizeLookupText,getDispatchRowQuantity:row=>Number(row.pieceCount)||0,parseLooseQuantityValue:bindings.parseLooseQuantityValue,
};}
test('dispatch history keeps date ordering, complete source rows, driver groups and exact floating-point sums',async()=>{
  const ports=historyPorts(),before=structuredClone(ports.warehouseDispatches);let yields=0;
  const factory=appFunction('prepareHistoryDispatchGroups',ports,{scope:'WarehouseDispatchView'});
  const actual=await runCooperativeProjection(factory,{maxOperations:1,yieldTask:async()=>{yields++;}});
  assert.deepEqual(actual,oldHistory(ports));assert.ok(yields>15);assert.deepEqual(ports.warehouseDispatches,before);
});
test('actual history and inventory caches reuse only complete immutable source/date/actor scopes',()=>{
  const dispatches=[],customers=[],products=[],employees=[],orders=[],imports=[];
  const historyCache=createProjectionCache(),stockCache=createProjectionCache();
  const history=scope=>appFunction('historyProjectionEntry',{useMemo:f=>f(),warehouseHistoryProjectionCache:historyCache,
    warehouseDispatches:dispatches,customers,products,employees,historyProjectionScope:scope},{scope:'WarehouseDispatchView'});
  const first=history('one|actor|2026-11-01');assert.equal(first.complete,false);first.value=['complete'];first.complete=true;
  assert.equal(history('one|actor|2026-11-01'),first);assert.notEqual(history('other|actor|2026-11-01'),first);
  assert.notEqual(history('one|other|2026-11-01'),first);assert.notEqual(history('one|actor|2026-11-02'),first);
  const stock=(productSource,scope)=>appFunction('inventoryEntry',{useMemo:f=>f(),productCatalogMetricsCache:stockCache,
    products:productSource,orders,warehouseImports:imports,warehouseDispatches:dispatches,inventoryScope:scope},{scope:'ProductManagementView'});
  const entry=stock(products,'one|2026-11-01');assert.equal(stock(products,'one|2026-11-01'),entry);
  assert.notEqual(stock([...products],'one|2026-11-01'),entry);assert.notEqual(stock(products,'one|2026-11-02'),entry);
});
test('pending dispatch reconciliation blocks the actual form command before reading or saving a draft',()=>{
  let prevented=false,message='';
  const submit=appFunction('handleSubmitDispatch',{dispatchShortageReady:false,setDispatchError:value=>{message=value;}},{scope:'WarehouseDispatchView'});
  submit({preventDefault(){prevented=true;}});assert.equal(prevented,true);assert.ok(message.includes('Đang đối chiếu'));
});
