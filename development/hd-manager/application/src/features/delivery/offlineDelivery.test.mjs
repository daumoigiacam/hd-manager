import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parse} from '@babel/parser';
import traverseModule from '@babel/traverse';
import {OFFLINE_BUSINESS_SOURCES} from '../../data/offlineBusinessDirectory.js';
import {HOME_FEED_SOURCES,NATIVE_HOME_SOURCES} from '../../data/homeFeedContract.js';
import {readOfflineDeliveryPage,readOfflineDeliveryDetail,deliveryWeightStatus,deliveryMovementStatus,deliveryDriverLabel,deliveryDateRange,storedDeliveryValue,DELIVERY_DIRECTORY_REQUIREMENTS} from './offlineDeliveryModel.js';
import {getOfflineMessageReadState,OFFLINE_MESSAGE_READ_CONTRACT} from '../messages/offlineMessageModel.js';
const traverse=traverseModule.default||traverseModule;

function fixture() {
 const scope={tenantId:'tenant-a',principalId:'employee-a',permissionRevision:'revision-a',sessionId:'session-a'};
 const cp={...scope,generation:'g',seq:2,capturedAt:1,dayKey:'2026-11-09',sourceProfile:'legacy-v1'};
 let active=true;const calls=[];
 const runtime={scope,expiresAtMs:Date.now()+100000,capabilities:['home.read','home.dispatches.read','home.orders.read','orders.read'],isCurrent:()=>active,appSession:{currentUser:{accountType:'employee',companyId:'tenant-a',firebaseUid:'employee-a'},currentCompany:{id:'tenant-a'}}};
 const row=(id,document={})=>({id,document:{companyId:'tenant-a',...document},businessDate:'2026-11-09',state:'SERVER_CONFIRMED'});
 const pages={deliveryReports:[row('report',{dispatchId:'dispatch',status:'short',differenceKg:'-0.11',actualWeightKg:'10.005',pricingUnit:'Kg',unitPrice:'12000.001'})],warehouseDispatches:[row('dispatch',{assignedDriverId:'driver',orderId:'order'})],orders:[row('order',{code:'ORDER-1'})]};
 const response=(source,items)=>({items,hasMore:false,nextCursor:null,metadata:{source,checkpoint:cp,timeZone:'Asia/Ho_Chi_Minh',serverConfirmedOnly:true,financialCalculationAllowed:false}});
 // Explicitly injected future directory contract; NOT an actual new grant/spec.
 const directory={sources:{deliveryReports:{requiredCapabilities:['home.read','home.dispatches.read']},warehouseDispatches:{requiredCapabilities:['home.read','home.dispatches.read']},orders:{requiredCapabilities:['home.read','home.orders.read','orders.read']}},
  page:async(source,options)=>{calls.push({source,options,kind:'page'});return response(source,pages[source]);},
  lookup:async(source,ids,options)=>{calls.push({source,ids,options,kind:'lookup'});return response(source,pages[source].filter(row=>ids.includes(row.id)));}};
 return {runtime,cp,row,pages,response,directory,calls,close(){active=false;}};
}
test('actual Home has deliveryReports; unsupported directory and inbox sources remain explicit gaps',()=>{
 assert(HOME_FEED_SOURCES.includes('deliveryReports'));assert(!NATIVE_HOME_SOURCES.includes('deliveryReports'));
 // Do not require absence forever: main may independently add the approved spec.
 if(OFFLINE_BUSINESS_SOURCES.deliveryReports)assert(OFFLINE_BUSINESS_SOURCES.deliveryReports.requiredCapabilities.includes('home.read'));
 for(const source of ['messages','notifications']){assert(!HOME_FEED_SOURCES.includes(source));assert(!NATIVE_HOME_SOURCES.includes(source));}
 assert.equal(OFFLINE_MESSAGE_READ_CONTRACT.implemented,false);assert.equal(DELIVERY_DIRECTORY_REQUIREMENTS.source,'deliveryReports');
});
test('missing delivery spec fails before calling transport; home.read alone never invents a spec',async()=>{
 const f=fixture();delete f.directory.sources.deliveryReports;
 await assert.rejects(readOfflineDeliveryPage(f),{code:'source-unavailable'});assert.equal(f.calls.length,0);
});
test('directory receives bounded SQL filters/cursors unchanged; no client page filtering',async()=>{
 const f=fixture(),options={...deliveryDateRange('2026-11-09','2026-11-09'),text:'abc',employeeId:'reporter',status:'short',cursor:'opaque',limit:100};
 const result=await readOfflineDeliveryPage({...f,options});assert.equal(result.items.length,1);assert.deepEqual(f.calls[0].options,{...options,limit:25});
 assert.equal(result.items[0].document.unitPrice,'12000.001');assert.equal(result.items[0].document.actualWeightKg,'10.005');
});
test('weight status is not delivery completion, and reporter is not inferred as driver',()=>{
 for(const status of ['matched','short','over','reported','not_measured'])assert.equal(deliveryMovementStatus({id:'a',status}),'Chưa ghi trạng thái giao');
 assert.equal(deliveryWeightStatus({status:'matched'}),'Khớp');assert.equal(deliveryWeightStatus({status:'short'}),'Lệch');
 assert.equal(deliveryMovementStatus({deliveryStatus:'delivered'}),'Đã giao');assert.equal(deliveryMovementStatus({deliveryStatus:'in_transit'}),'Đang giao');
 assert.equal(deliveryDriverLabel({empId:'reporter'},[{id:'reporter',name:'Employee'}]),'Chưa ghi tài xế trên phiếu');
 assert.equal(deliveryDriverLabel({assignedDriverId:'driver'},[{id:'driver',name:'Driver'}]),'Driver');
 assert.equal(storedDeliveryValue(0),'0');assert.equal(storedDeliveryValue(null),'Chưa ghi nhận');assert.equal(storedDeliveryValue('1.00000001'),'1.00000001');
});
test('detail uses exact report→dispatch→order links and pins every lookup to completed checkpoint',async()=>{
 const f=fixture(),value=await readOfflineDeliveryDetail({...f,id:'report',checkpoint:f.cp});
 assert.equal(value.dispatch.id,'dispatch');assert.equal(value.orders[0].id,'order');assert.equal(value.report.document.differenceKg,'-0.11');
 assert.deepEqual(f.calls.map(c=>[c.source,c.ids]),[['deliveryReports',['report']],['warehouseDispatches',['dispatch']],['orders',['order']],['deliveryReports',['report']]]);
 for(const c of f.calls)assert.equal(c.options.checkpoint,f.cp);
});
test('no customer-only join or fake empty relation when reverse API is unavailable',async()=>{
 const f=fixture();delete f.pages.warehouseDispatches[0].document.orderId;
 const result=await readOfflineDeliveryDetail({...f,id:'report',checkpoint:f.cp});assert.equal(result.ordersState,'unknown');assert.equal(result.orders.length,0);assert(!f.calls.some(c=>c.source==='orders'));
});
test('optional reverse order API must return relation proof, matching checkpoint and bounded pages',async()=>{
 const f=fixture();delete f.pages.warehouseDispatches[0].document.orderId;
 f.directory.deliveryOrders=async(id,options)=>{assert.equal(id,'dispatch');assert.equal(options.limit,25);return {...f.response('orders',f.pages.orders),metadata:{...f.response('orders',[]).metadata,relation:{kind:'dispatch-orders',dispatchId:id}}};};
 const value=await readOfflineDeliveryDetail({...f,id:'report',checkpoint:f.cp});assert.equal(value.ordersState,'found');
 f.directory.deliveryOrders=async()=>f.response('orders',f.pages.orders);await assert.rejects(readOfflineDeliveryDetail({...f,id:'report',checkpoint:f.cp}),{code:'invalid-data'});
});
test('related-source permission denial keeps report but does not expose related rows',async()=>{
 const f=fixture();f.runtime.capabilities=['home.read','home.dispatches.read'];
 const value=await readOfflineDeliveryDetail({...f,id:'report',checkpoint:f.cp});assert.equal(value.report.id,'report');assert.equal(value.ordersState,'unavailable');assert.equal(value.orders.length,0);assert(!f.calls.some(c=>c.source==='orders'));
});
test('tenant leakage, checkpoint changes, oversized pages and owner close fail closed',async()=>{
 for(const change of ['tenant','checkpoint','oversize','closed']){
  const f=fixture();if(change==='tenant')f.pages.deliveryReports[0].document.companyId='tenant-b';if(change==='checkpoint')f.cp.principalId='employee-b';if(change==='oversize')f.pages.deliveryReports=Array.from({length:26},(_,i)=>f.row('r'+i));if(change==='closed')f.close();
  await assert.rejects(readOfflineDeliveryPage(f));
 }
 const f=fixture(),original=f.directory.lookup;f.directory.lookup=async(...args)=>{const result=await original(...args);if(args[0]==='orders')f.close();return result;};await assert.rejects(readOfflineDeliveryDetail({...f,id:'report',checkpoint:f.cp}),{code:'permission-denied'});
});
test('native B rejects legacy delivery/messages/notifications before reads',async()=>{
 const f=fixture();f.runtime.appSession.sourceProfile='native-isolation-v1';await assert.rejects(readOfflineDeliveryPage(f),{code:'source-unavailable'});assert.equal(f.calls.length,0);
 for(const source of ['messages','notifications'])assert.equal(getOfflineMessageReadState(f.runtime,source).state,'SOURCE_UNSUPPORTED');
});
test('valid existing grant still cannot fabricate inbox support or unread count',()=>{
 const f=fixture();for(const source of ['messages','notifications']){const state=getOfflineMessageReadState(f.runtime,source);assert.equal(state.state,'NOT_PROVISIONED');assert.equal(state.items,undefined);assert.equal(state.unreadCount,undefined);}
 f.close();assert.equal(getOfflineMessageReadState(f.runtime).state,'SESSION_UNAVAILABLE');
});
test('sidecars parse, resolve symbols and contain no direct SDK/network/command/native subscription paths',()=>{
 for(const name of ['./OfflineDeliveryWorkspace.jsx','../messages/OfflineMessageWorkspace.jsx']){
  const text=fs.readFileSync(new URL(name,import.meta.url),'utf8'),ast=parse(text,{sourceType:'module',plugins:['jsx']}),globals=new Set(['Object','Array','JSON','Promise','Error','Number','undefined']);
  traverse(ast,{ReferencedIdentifier(p){if(!p.scope.getBinding(p.node.name))assert(globals.has(p.node.name),'Unresolved '+p.node.name);},ImportDeclaration(p){assert(!/firebase|App\.jsx|nativeOffline|bootstrap/.test(p.node.source.value));}});
  assert(!/addEventListener|\.subscribe\(|fetch\(|createConnection|\.enqueue\(|\.send\(/.test(text));
 }
});
