import test from'node:test';import assert from'node:assert/strict';import fs from'node:fs';import{parse}from'@babel/parser';
import{readCompletedModuleProjection}from'../src/services/moduleProjectionCaches.js';
const files=Object.fromEntries(['app','orders','crm'].map((name,i)=>[name,fs.readFileSync(new URL(['../src/App.jsx','../src/features/legacy/OrderManagementView.jsx','../src/features/customers/productCRMShared.jsx'][i],import.meta.url),'utf8')]));
function declarations(text){const map=new Map();function walk(n){if(!n||typeof n!=='object')return;if(n.type==='VariableDeclarator'&&n.id.type==='Identifier')map.set(n.id.name,n.init);for(const[k,v]of Object.entries(n)){if(['loc','comments','extra'].includes(k))continue;if(Array.isArray(v))v.forEach(walk);else if(v?.type)walk(v);}}walk(parse(text,{sourceType:'module',plugins:['jsx']}));return map;}
const maps=Object.fromEntries(Object.entries(files).map(([name,text])=>[name,declarations(text)]));
function actual(file,name,env){const node=maps[file].get(name);assert(node,'Missing canonical '+name);return Function(...Object.keys(env),'return ('+files[file].slice(node.start,node.end)+')')(...Object.values(env));}
test('actual reconciliation preserves invoice allocations/payment identities even when supplier net debt changes',()=>{
 const parseLooseMoneyValue=actual('crm','parseLooseMoneyValue',{}),roundMoneyValue=actual('crm','roundMoneyValue',{});
 const reconcile=actual('crm','applyCustomerSupplierReconciliation',{parseLooseMoneyValue,roundMoneyValue});
 const buildView=actual('app','buildOrderViewModel',{});
 for(let n=0;n<1000;n++){
  const order={id:'o'+n,customerId:'c'+n,amount:100000+n},payment={id:'p'+n,allocations:[{orderId:order.id,amount:20000+n}]};
  const invoice={...order,appliedAmount:20000+n,outstandingAmount:80000,status:'partial'};
  const sales={currentDebt:80000,creditBalance:n%3,orders:[invoice],payments:[payment]};
  const full=reconcile(sales,{totalPurchaseDebt:30000+n,imports:[{id:'i'+n}]},[{amount:1000+n}]);
  assert.strictEqual(full.orders,sales.orders);assert.strictEqual(full.payments,sales.payments);
  function context(customerLedgerMap){const env={useMemo:fn=>fn(),readCompletedModuleProjection,customerLedgerMap,ledgerIndexEntry:undefined,paymentIndexEntry:undefined};return{customerLookup:new Map(),employeeLookup:new Map(),deliveryReportIssueByDispatch:new Map(),zaloQueueByOrderId:new Map(),ledgerOrderById:actual('orders','ledgerOrderById',env),paymentHistoryByOrderId:actual('orders','paymentHistoryByOrderId',env)};}
  assert.deepEqual(buildView(order,context({[order.customerId]:sales})),buildView(order,context({[order.customerId]:full})));
 }
});
test('Orders waits for committed sales/catalog data and calls the original builder; Debt retains complete supplier reconciliation',()=>{
 const text=files.app;
 assert.match(text,/const orderLedgerSourcesReady=areHomeSourcesCommitted\([\s\S]*?collections:\['customers','orders','payments','products'\]/);
 assert.match(text,/prepareOrderSalesLedger=useCallback\(function\*\(\)[\s\S]*?yield\* buildCustomerLedgerMap\(customers,orders,payments,\{cooperative:true\}\)/);
 assert.match(text,/<OrderReadBoundary projection=\{orderLedgerProjection\} identity=\{orderReadIdentity\} enabled=\{orderLedgerSourcesAvailable\}/);
 assert.match(text,/customerLedgerMap=\{orderReadLedgerMap\}/);
 assert.match(text,/collections:\['customers','orders','payments','warehouseImports','expenses'\]/);
 assert.match(text,/orderLedgerScope=JSON.stringify\(\[dashboardPrivacyScope,notificationDateKey\]\)/);
 assert.match(text,/enabled:activeTab==='orders'&&!mainLedgerReady&&orderLedgerSourcesAvailable/);
});
