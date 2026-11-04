import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {parse} from '@babel/parser';import traverseModule from '@babel/traverse';
import {buildFirstRecordLookup,createImmutableFirstRecordLookupSelector} from '../src/utils/firstRecordLookup.js';
import {selectLatestRecords} from '../src/utils/latestRecords.js';
const source=readFileSync('src/App.jsx','utf8'),tree=parse(source,{sourceType:'module',plugins:['jsx']});let callback,lookups=[];
const names={notificationCustomerById:'customers',notificationOrderById:'orders',notificationEmployeeById:'employees',notificationProductById:'products'};
traverseModule.default(tree,{VariableDeclarator(p){if(p.node.id.name!=='notificationItems')return;
 callback=p.node.init.arguments[0];p.traverse({CallExpression(q){const c=q.node.callee;
  if(c.type==='MemberExpression'&&c.property.name==='get'&&names[c.object.name])lookups.push(q.node);
 }})}});
assert(callback);assert.equal(lookups.length,9);
const current=source.slice(callback.start,callback.end);let baseline=current;
for(const node of lookups.sort((a,b)=>b.start-a.start)){
 const key=source.slice(node.arguments[0].start,node.arguments[0].end);
 baseline=baseline.slice(0,node.start-callback.start)+names[node.callee.object.name]+'.find(record=>record.id===('+key+'))'+baseline.slice(node.end-callback.start);
}
for(const [lookup,records] of Object.entries(names))baseline=baseline.replace(`const ${lookup}=notificationRecordLookup(${records});`,'');
const execute=(code,bindings)=>new Function(...Object.keys(bindings),`return (${code})()`)(...Object.values(bindings));

test('actual notification projection retains legacy results and first-ID ownership while avoiding a customer scan for each payment',()=>{
 let reads=0;
 const customers=Array.from({length:319},(_,i)=>({get id(){reads++;return 'c'+i},name:'Customer '+i,empId:i%2?'a':'b'}));
 customers.unshift({get id(){reads++;return 'c1'},name:'First duplicate',empId:'a'});
 const orders=Array.from({length:5606},(_,i)=>({id:'o'+i,customerId:'c'+(i%319),customerName:'Order '+i}));
 const payments=Array.from({length:3932},(_,i)=>({id:'p'+i,customerId:'c'+(i%319),orderId:'o'+i,amount:1000+i,createdAt:i+1}));
 const bindings={notificationRecordLookup:createImmutableFirstRecordLookupSelector(),customers,orders,payments,products:[],employees:[],persistentNotificationCandidates:[],
  employee:{id:'a'},currentUser:{id:'a'},messages:[],isOwnerAccount:false,isAccounting:false,isSales:true,
  salesNotificationEmployeeIdSet:new Set(['a']),attendanceAlerts:[],currentAttendanceAlert:null,pendingAdvanceNotifications:[],
  advanceRequests:[],orderRequests:[],warehouseDispatches:[],warehouseDispatchCoverage:{issueLines:[]},debtLimitAlerts:[],customerCareAlerts:[],notificationDateKey:'2026-11-02',
  canViewWarehouseDispatchNotifications:false,canViewWarehouseShortageNotifications:false,
  isPayosPaymentRecord:()=>true,isEmployeeNotificationVisible:()=>true,canViewOrderRequestNotification:()=>false,
  dedupePaymentNotifications:rows=>rows,selectLatestRecords,getEntityTimestamp:row=>row?.createdAt||0,
  getPaymentTimestamp:row=>row.createdAt,getPaymentDateKey:()=>'',getPaymentReceivingBankLabel:()=>'',
  parseInputCurrency:Number,parseLooseQuantityValue:Number,formatCurrency:String,formatNumber:String,formatDateLabel:String,
  getTodayDateKey:()=> '2026-11-02',resolveNotificationDateKey:()=> '2026-11-02',getCustomerDisplayName:row=>row.name,
  formatPaymentNotificationMessage:({customerName,amount})=>customerName+':'+amount,
  buildEmployeeCustomerMessageNotification:()=>null};
 reads=0;const expected=execute(baseline,bindings),legacyReads=reads;
 reads=0;const actual=execute(current,bindings),indexedReads=reads;
 assert.deepEqual(actual,expected);assert.equal(actual.length,20);
 assert(indexedReads<=customers.length+1,'customer IDs indexed once, not inside the payment loop');
 assert(legacyReads>indexedReads*100);
});

test('immutable notification lookups reuse only the exact snapshot and preserve first duplicate ownership',()=>{
 let reads=0;const row=id=>({get id(){reads++;return id}});
 const first=row('duplicate'),second=row('duplicate'),rows=[first,second,row(NaN),row('other')];
 const select=createImmutableFirstRecordLookupSelector(),initial=select(rows),before=reads;
 assert.equal(initial.get('duplicate'),first);assert.equal(initial.has(NaN),false);
 assert.equal(select(rows),initial);assert.equal(reads,before,'unrelated notification updates cannot rescan all order IDs');
 const replacement=[second,...rows];assert.equal(select(replacement).get('duplicate'),second);
 assert.equal(select(rows),initial,'different immutable sources cannot replace one another');
 const mutable=[{id:'old'}];assert.equal(buildFirstRecordLookup(mutable).get('old'),mutable[0]);
 mutable[0].id='new';assert.equal(buildFirstRecordLookup(mutable).get('new'),mutable[0],'legacy default remains uncached');
});
