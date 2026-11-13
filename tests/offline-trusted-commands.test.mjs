// Unit contracts for real domain handlers, not Production readiness evidence.
import test from 'node:test';import assert from 'node:assert/strict';
import {trustedCommandFixture as fixture,command,digest} from './helpers/trusted-offline-command-fixture.mjs';
import * as stock from '../development/hd-manager/application/src/features/warehouse/stockCountProtocol.js';
import * as imports from '../development/hd-manager/application/src/features/warehouse/warehouseImportProtocol.js';
import {fingerprint} from '../functions/offlineCustomerCommands.cjs';
import * as dispatch from '../development/hd-manager/application/src/features/warehouse/warehouseDispatchOfflineProtocol.js';
import * as delivery from '../development/hd-manager/application/src/features/delivery/deliveryCommandProtocol.js';
import * as deliveryContext from '../development/hd-manager/application/src/features/delivery/deliveryContextSnapshot.js';
import * as payroll from '../development/hd-manager/application/src/features/payroll/offlinePayrollProtocol.js';
import * as advance from '../development/hd-manager/application/src/features/payroll/salaryAdvanceProtocol.js';
import {createOfflineCommandAuthority} from '../functions/offlineCommandAuthority.cjs';
const editedAt='2026-11-13T01:00:00.000Z';
const stockIntent=(id='stock',kind='stockCount.create',base=null)=>command(id,kind,base?.id||'wsc_'+id,{version:1,baseFingerprint:base?digestCanonical(stock.canonicalStockCount(base)):null,baseRevision:stock.stockCountRevision(base),baseDocument:base,values:kind==='stockCount.archive'?null:stock.buildStockCountValues({groupName:'Gà',quantity:'3',totalKg:'6',quantityUnit:'Con',date:'2026-11-13',reason:'',note:''}),editedAt,employeeId:'employee-a',resolvesConflictId:null},stock.stockCountRevision(base));
import {createHash} from 'node:crypto';const digestCanonical=text=>createHash('sha256').update(text).digest('hex');
function importIntent(id='import'){
 const base={document:null,expense:null};const payload={version:1,base,baseFingerprint:digestCanonical(imports.canonicalImport(base)),baseRevision:0,values:imports.buildImportValues({groupName:'Gà',quantity:'2',totalKg:'4',quantityUnit:'Con',purchaseUnit:'Kg',unitPrice:'12.345',sourceType:'purchase_resale',date:'2026-11-13',supplier:'Contract supplier',supplierCustomerId:'',supplierPhone:'',note:'',extraMeasures:[]}),editedAt,employeeId:'employee-a',resolvesConflictId:null};return command(id,'warehouseImport.create','wi_'+id,payload);
}
test('trusted grant contains implemented commands only; no cash/bank payroll settlement or unenrolled attendance grant',async()=>{
 const f=fixture();try{const g=await f.call('grant',{deviceId:'unit-device'}),p=JSON.parse(Buffer.from(g.signedGrant.split('.')[1],'base64url'));
  for(const cap of ['orders.create','stockCounts.create','warehouseImports.create','attendanceRequest.approve','attendancePeriod.managerConfirm','payroll.lock'])assert(p.capabilities.includes(cap),cap);
  for(const cap of ['salarySettlement.pay','salarySettlement.reconcile','attendance.check_in','attendance.check_out'])assert(!p.capabilities.includes(cap),cap);
 }finally{await f.close();}
});
test('stock count writes authoritative business document and receipt atomically without synthetic access documents',async()=>{
 const f=fixture();try{const c=stockIntent(),r=await f.call('sync',{command:c});assert.equal(r.outcome,'accepted');assert.equal(r.document.quantity,3);assert.deepEqual(await f.call('sync',{command:c}),r);assert.equal([...f.rows.keys()].filter(p=>p.startsWith('offlineStockCountReceipts/')).length,1);assert(![...f.rows.keys()].some(p=>p.startsWith('offlineCustomerAccess/')||p.startsWith('offlineHomeActors/')));
  const update=stockIntent('edit','stockCount.update',r.document);f.seed('warehouseStockCounts',c.entityId,{...r.document,note:'Newer server note'});assert.equal((await f.call('sync',{command:update})).outcome,'conflict');assert.equal(f.rows.get(f.root+'warehouseStockCounts/'+c.entityId).note,'Newer server note');
 }finally{await f.close();}
});
test('warehouse import keeps paired expense value, rollback, immutable retry and tenant isolation',async()=>{
 const f=fixture();try{const c=importIntent();f.failWrite('offlineWarehouseImportReceipts');await assert.rejects(f.call('sync',{command:c}),/Injected transaction failure/);assert(!f.rows.has(f.root+'warehouseImports/'+c.entityId));assert(!f.rows.has(f.root+'expenses/exp_warehouse_import_'+c.entityId));f.failWrite(null);
  const r=await f.call('sync',{command:c});assert.equal(r.outcome,'accepted');assert.equal(r.document.amount,49380);assert.equal(r.expense.amount,49380);assert.deepEqual(await f.call('sync',{command:c}),r);
  await assert.rejects(f.call('sync',{command:c},'b'));assert.equal([...f.rows.keys()].filter(p=>p.startsWith('offlineWarehouseImportReceipts/')).length,1);
 }finally{await f.close();}
});
test('manual expense uses original rules; stale edits conflict and receipt failure cannot commit money',async()=>{
 const f=fixture();try{const payload={input:{amount:12345,date:'2026-11-13',note:'Unit contract expense',category:'Chi phí khác'},baseFingerprint:null,baseRevision:0,resolvesConflictId:null};const c=command('expense','cashflow.expense.create','expense-unit',payload);const r=await f.call('sync',{command:c});assert.equal(r.outcome,'accepted');assert.equal(r.document.amount,12345);assert.deepEqual(await f.call('sync',{command:c}),r);
  const edit=command('expense-edit','cashflow.expense.update',c.entityId,{...payload,input:{...payload.input,amount:54321},baseFingerprint:fingerprint(r.document),baseRevision:r.document.offlineCashflowRevision},r.document.offlineCashflowRevision);
  f.seed('expenses',c.entityId,{...r.document,note:'Newer server value'});assert.equal((await f.call('sync',{command:edit})).outcome,'conflict');assert.equal(f.rows.get(f.root+'expenses/'+c.entityId).amount,12345);
  const second=command('expense-fail','cashflow.expense.create','expense-fail',payload);f.failWrite('offlineCashflowReceipts');await assert.rejects(f.call('sync',{command:second}),/Injected/);assert(!f.rows.has(f.root+'expenses/expense-fail'));
 }finally{await f.close();}
});
test('current server identity and original employee overrides are checked before even exact receipt replay',async()=>{
 const f=fixture();try{const c=stockIntent(),r=await f.call('sync',{command:c});assert.equal(r.outcome,'accepted');f.rows.get('identity_accounts/'+f.tokens.a.identityId).lockedAt=1;await assert.rejects(f.call('sync',{command:c}),e=>e.code==='permission-denied');assert.equal(f.rows.get(f.root+'warehouseStockCounts/'+c.entityId).quantity,3);
  delete f.rows.get('identity_accounts/'+f.tokens.a.identityId).lockedAt;const e=f.rows.get(f.root+'employees/employee-a');e.role='employee';e.position='Sản xuất';await assert.rejects(f.call('sync',{command:stockIntent('denied')}),e=>e.code==='permission-denied');assert(!f.rows.has(f.root+'warehouseStockCounts/wsc_denied'));
 }finally{await f.close();}
});
test('attendance request has a durable audit and immutable receipt; review permission is server-derived',async()=>{
 const f=fixture();try{const payload={workDate:'2026-11-12',workRole:'Sản xuất',adjustmentType:'Ghi chú',reason:'Unit source verification',proposedDetail:'Kiểm tra công'};const c=command('request-create','attendanceRequest.create','request-unit',payload);const r=await f.call('sync',{command:c});assert.equal(r.outcome,'accepted');assert.equal(r.document.status,'PENDING_REVIEW');assert.deepEqual(await f.call('sync',{command:c}),r);
  const reject=command('request-reject','attendanceRequest.reject',c.entityId,{reason:'Contract rejected with reason'},1);const result=await f.call('sync',{command:reject});assert.equal(result.document.status,'REJECTED');assert.equal(result.document.history.length,2);assert.equal(result.document.applied,false);
  await assert.rejects(f.call('sync',{command:reject},'b'));assert.deepEqual(await f.call('sync',{command:reject}),result);
 }finally{await f.close();}
});
test('unknown domains and payroll cash/bank settlement remain fail-closed, never fake successful acknowledgments',async()=>{
 const f=fixture();try{for(const kind of ['salarySettlement.pay','salarySettlement.reconcile','unknown.create','toString'])await assert.rejects(f.call('sync',{command:{kind}}));assert.equal(f.writes.length,0);}finally{await f.close();}
});
test('order create retains independent units and one immutable receipt; metadata changes retain financial fields',async()=>{
 const f=fixture();try{
  f.seed('customers','customer-a',{companyId:'tenant-a',name:'Unit customer'});f.seed('products','product-a',{companyId:'tenant-a',name:'Unit product'});
  const line=(unit,n,price)=>({productId:'product-a',quantity:n,actualQuantity:n,quantityCount:n,orderedUnit:unit,orderUnit:unit,actualUnit:unit,quantityUnit:unit,pricingUnit:unit,billingUnit:unit,billingQuantity:n,pricingQuantity:n,unitPrice:price,amount:n*price,pricingAmount:n*price,lineTotal:n*price});
  const body={id:'ord_unit',companyId:'tenant-a',salesEmpId:'employee-a',customerId:'customer-a',date:'2026-11-13',items:[line('Con',2,100),line('Kg',3,200)],amount:800,totalAmount:800,paidAmount:0,customerExtraExpense:0,sellerExtraExpense:0,reviewStatus:'draft',zaloSendStatus:'not_queued'};
  const c=command('order-create','order.create',body.id,body),r=await f.call('sync',{command:c});assert.equal(r.outcome,'accepted');assert.deepEqual(r.document.items.map(x=>[x.orderedUnit,x.pricingUnit,x.unitPrice]),[['Con','Con',100],['Kg','Kg',200]]);assert.deepEqual(await f.call('sync',{command:c}),r);
  const edit=command('order-edit','order.update',body.id,{version:1,baseFingerprint:r.fingerprint,baseCommandId:null,baseRevision:0,patch:{note:'Contract edit'},editedAt,resolvesConflictId:null});const e=await f.call('sync',{command:edit});assert.equal(e.outcome,'accepted');assert.equal(e.document.amount,800);assert.deepEqual(e.document.items,body.items);
  await assert.rejects(f.call('sync',{command:c},'b'));assert.equal([...f.rows.keys()].filter(p=>p.startsWith(f.root+'orders/')).length,1);
 }finally{await f.close();}
});
test('employee profile creates only permitted fields and retains CAS/tenant checks',async()=>{
 const f=fixture();try{const payload={input:{name:'Contract worker',phone:'0000000199',address:'',email:'',department:'',employeeCode:'UNIT'},position:'Sản xuất',baseFingerprint:null,baseRevision:0};const c=command('employee-create','employeeProfile.create','worker-unit',payload),r=await f.call('sync',{command:c});assert.equal(r.outcome,'accepted');assert.equal(r.document.name,'Contract worker');assert.deepEqual(await f.call('sync',{command:c}),r);
  await assert.rejects(f.call('sync',{command:c},'b'));const forged=command('employee-escalate','employeeProfile.create','forged',{...payload,input:{...payload.input,role:'super_admin'}});await assert.rejects(f.call('sync',{command:forged}));assert(!f.rows.has(f.root+'employees/forged'));
 }finally{await f.close();}
});
test('employee then manager confirmations use current monthly fingerprint and append separate audit receipts',async()=>{
 const f=fixture();try{const view=await f.call('attendance-period',{action:'read',employeeId:'employee-a',monthKey:'2026-10'});const payload={employeeId:'employee-a',monthKey:'2026-10',sourceFingerprint:view.sourceFingerprint,expectedRevision:0,reason:'Unit employee confirmed'};
  const c=command('confirm-self','attendancePeriod.employeeConfirm',view.entityId,payload),self=await f.call('sync',{command:c});assert.equal(self.outcome,'accepted');assert.equal(self.document.confirmation.status,'EMPLOYEE_CONFIRMED');
  const manager=command('confirm-manager','attendancePeriod.managerConfirm',view.entityId,{...payload,expectedRevision:1,reason:'Unit manager confirmed'},1),r=await f.call('sync',{command:manager});assert.equal(r.outcome,'accepted');assert.equal(r.document.confirmation.status,'MANAGER_CONFIRMED');assert.equal(r.document.confirmation.history.length,2);assert.deepEqual(await f.call('sync',{command:manager}),r);
  await assert.rejects(f.call('sync',{command:manager},'b'));assert.equal([...f.rows.keys()].filter(p=>p.startsWith('attendancePeriodReceipts/')).length,2);
 }finally{await f.close();}
});
test('dispatch planner keeps current stock fence, source CAS and receipt in one transaction',async()=>{
 const f=fixture();try{
  const product={id:'product-a',companyId:'tenant-a',name:'Unit product',unit:'Con',stockQuantity:10,price:100},customer={id:'customer-a',companyId:'tenant-a',name:'Unit customer'};f.seed('products',product.id,product);f.seed('customers',customer.id,customer);
  const id='dispatch-create',entityId='wd_tenant-a_'+id,values=dispatch.buildDispatchValues({date:'2026-11-13',customerId:customer.id,productId:product.id,pieceCount:2,weightKg:2,quantityUnit:'Con',note:'',assignedDriverId:''});
  const planned=await dispatch.planDispatch(null,'warehouseDispatch.create',values,{id:entityId,tenantId:'tenant-a',employeeId:'employee-a',editedAt,mutationId:id,customer,product,driver:null});
  const c=command(id,'warehouseDispatch.create',entityId,{version:1,base:null,baseFingerprint:digestCanonical(dispatch.canonicalDispatch(null)),baseRevision:0,values,planned,employeeId:'employee-a',editedAt,resolvesConflictId:null}),r=await f.call('sync',{command:c});assert.equal(r.outcome,'accepted');assert.deepEqual(await f.call('sync',{command:c}),r);assert.equal([...f.rows.keys()].filter(p=>p.startsWith('offlineWarehouseDispatchStockLocks/')).length,1);await assert.rejects(f.call('sync',{command:c},'b'));
 }finally{await f.close();}
});
test('delivery composes the original transaction and returns one receipt for retry',async()=>{
 const f=fixture();try{
  const dispatchDoc={id:'dispatch-unit',companyId:'tenant-a',customerId:'customer-a',productId:'product-a',weightKg:2,quantity:2,pieceCount:2,quantityUnit:'Con',orderedUnit:'Con',actualQuantityUnit:'Con',actualUnit:'Con',billingUnit:'Kg',pricingUnit:'Kg',billingQuantity:2,pricingQuantity:2,unitPrice:100,amount:200,billingSnapshotVersion:1,billingSnapshotValid:true,billingSnapshotSource:'unit-contract',date:'2026-11-13'};
  f.seed('warehouseDispatches',dispatchDoc.id,dispatchDoc);f.seed('customers','customer-a',{id:'customer-a',companyId:'tenant-a',name:'Unit customer'});f.seed('products','product-a',{id:'product-a',companyId:'tenant-a',name:'Unit product',unit:'Con'});
  const one=async(source,id)=>f.rows.has(f.root+source+'/'+id)?{...f.rows.get(f.root+source+'/'+id),id}:null;
  const base=await deliveryContext.loadDeliveryContext({one,related:async()=>[],tenantId:'tenant-a',employee:{id:'employee-a',name:'employee-a'},id:'dr_delivery_0',dispatchId:dispatchDoc.id,assetId:''});
  const features=Object.fromEntries(Object.keys(delivery.DELIVERY_FEATURE_CAPS).map(k=>[k,true]));
  const values=delivery.deliveryValues({dispatchId:dispatchDoc.id,date:'2026-11-13',actualWeight:'2',actualQuantity:'2',actualQuantityUnit:'Con',actualPackageCount:'1',actualPackageUnit:'Bọc',note:'',collectedAmount:0,collectedMethod:'Tiền mặt',deliveryExpenseAmount:0,deliveryExpenseCategory:'Chi phí giao hàng',expenseNote:'',assetId:'',kmAt:0,liters:0,fuelUnitPrice:0,returnWeightKg:0,returnQuantity:0,returnQuantityUnit:'Con',shippingAmount:0,shippingNote:''});
  const options={id:'dr_delivery_0',tenantId:'tenant-a',employee:base.employee,editedAt,mutationId:'delivery',features,memoOrders:[]};
  const discovered=await delivery.planDelivery('deliveryReport.create',base,values,{...options,discoverTargets:true});base.targets=Object.fromEntries(Object.keys(discovered.documents).map(key=>[key,null]));
  const planned=await delivery.planDelivery('deliveryReport.create',base,values,{...options,discoverTargets:false});
  const c=command('delivery','deliveryReport.create',options.id,{version:1,base,baseFingerprint:digestCanonical(delivery.canonicalDelivery(base)),baseRevision:0,values,planned,employeeId:'employee-a',editedAt,features,memoFingerprint:null,resolvesConflictId:null}),r=await f.call('sync',{command:c});assert.equal(r.outcome,'accepted');assert.equal(r.document.amount,200);assert.deepEqual(await f.call('sync',{command:c}),r);await assert.rejects(f.call('sync',{command:c},'b'));
 }finally{await f.close();}
});
test('payroll lock binds two-sided confirmation, rejects unconfirmed input and never creates a second wage expense',async()=>{
 const f=fixture();try{
  const monthKey='2026-10';f.account('worker','tenant-a','worker-a',{name:'Unit worker',position:'Sản xuất',role:'employee',basicSalary:3000000,startDate:'2026-01-01',payrollPolicies:[{id:'policy-unit',version:'v1',formulaVersion:'HD_PAYROLL_FORMULA_V1',effectiveFrom:'2026-01-01',values:{position:'Sản xuất',basicSalary:3000000,salaryMonthDays:26}}]});
  const collect=()=>Object.fromEntries(payroll.PAYROLL_INPUT_SOURCES.map(source=>[source,[...f.rows].filter(([p,v])=>p.startsWith(f.root+source+'/')&&(source==='companies'?p.endsWith('/tenant-a'):v.companyId==='tenant-a')).map(([p,v])=>({...v,id:p.split('/').at(-1)}))]));
  const sources=collect(),plan=payroll.planPayroll(sources,'payroll.lock',{monthKey},{tenantId:'tenant-a',employeeId:'employee-a'},{editedAt,mutationId:'payroll-lock'});
  assert(plan.writes.some(w=>w.source==='payrollSnapshots'&&w.body.employeeId==='worker-a'));
  f.rows.set('offlineHomeFeeds/tenant-a',{ready:true,generation:'unit-generation',seq:1,counts:Object.fromEntries(Object.entries(sources).map(([s,v])=>[s,v.length]))});
  const payload={version:1,values:{monthKey},editedAt,employeeId:'employee-a',checkpoint:{generation:'unit-generation',seq:1},inputFingerprint:digestCanonical(payroll.canonicalPayroll(payroll.validatePayrollSources(sources,'tenant-a'))),baseFingerprint:digestCanonical(payroll.canonicalPayroll(plan.base)),plan,resolvesConflictId:null},c=command('payroll-lock','payroll.lock',plan.periodId,payload);
  await assert.rejects(f.call('sync',{command:c}),e=>e.code==='payroll-timesheet-not-confirmed');assert(!f.rows.has(f.root+'payrollPeriods/'+plan.periodId));
  for(const employeeId of new Set(plan.writes.filter(w=>w.source==='payrollSnapshots').map(w=>w.body.employeeId))){const token=employeeId==='worker-a'?'worker':'a',view=await f.call('attendance-period',{action:'read',employeeId,monthKey},token),p={employeeId,monthKey,sourceFingerprint:view.sourceFingerprint,expectedRevision:0,reason:'Contract employee confirmation'};await f.call('sync',{command:command('self-'+employeeId,'attendancePeriod.employeeConfirm',view.entityId,p)},token);await f.call('sync',{command:command('manager-'+employeeId,'attendancePeriod.managerConfirm',view.entityId,{...p,expectedRevision:1,reason:'Contract manager confirmation'},1)});}
  const r=await f.call('sync',{command:c});assert.equal(r.outcome,'accepted');assert(r.timesheetBindings.some(x=>x.employeeId==='worker-a'));assert(!r.writes.some(x=>['expenses','payments','financials'].includes(x.source)));assert.equal([...f.rows.keys()].filter(p=>p.startsWith('payrollAttendanceSourceLinks/')).length,r.timesheetBindings.length);assert.deepEqual(await f.call('sync',{command:c}),r);
 }finally{await f.close();}
});
test('salary advance approval reuses the original plan and commits advance/financial/receipt/fence atomically',async()=>{
 const f=fixture();try{
  f.seed('employees','worker-a',{id:'worker-a',companyId:'tenant-a',name:'Unit worker',position:'Sản xuất',role:'employee',basicSalary:3000000});f.seed('advances','pending-unit',{id:'pending-unit',companyId:'tenant-a',empId:'worker-a',amount:100000,reason:'Contract advance',date:'2026-11-13',salaryMonth:'2026-11',status:'pending',createdAt:editedAt});
  const sources=Object.fromEntries(advance.ADVANCE_SOURCES.map(s=>[s,[...f.rows].filter(([p,v])=>p.startsWith(f.root+s+'/')&&(s==='companies'?p.endsWith('/tenant-a'):v.companyId==='tenant-a')).map(([p,v])=>({...v,id:p.split('/').at(-1)}))]));
  const values={requestId:'pending-unit'},plan=await advance.planSalaryAdvance(sources,'salaryAdvance.approve',values,{tenantId:'tenant-a',employeeId:'employee-a'},{editedAt,mutationId:'advance-approve'});
  f.rows.set('offlineHomeFeeds/tenant-a',{ready:true,generation:'unit-generation',seq:1,counts:Object.fromEntries(Object.entries(sources).map(([s,v])=>[s,v.length]))});
  const c=command('advance-approve','salaryAdvance.approve','pending-unit',{version:1,employeeId:'employee-a',values,editedAt,checkpoint:{generation:'unit-generation',seq:1},inputFingerprint:digestCanonical(advance.canonicalAdvance(advance.validateAdvanceSources(sources,'tenant-a'))),plan});
  f.failWrite('offlineSalaryAdvanceReceipts');await assert.rejects(f.call('sync',{command:c}),/Injected/);assert.equal(f.rows.get(f.root+'advances/pending-unit').status,'pending');assert.equal([...f.rows.keys()].filter(p=>p.startsWith(f.root+'financials/')).length,0);f.failWrite(null);
  const r=await f.call('sync',{command:c});assert.equal(r.outcome,'accepted');assert.equal(r.writes.find(x=>x.source==='financials').body.amount,100000);assert.deepEqual(await f.call('sync',{command:c}),r);assert.equal([...f.rows.keys()].filter(p=>p.startsWith(f.root+'financials/')).length,1);await assert.rejects(f.call('sync',{command:c},'b'));
 }finally{await f.close();}
});
test('native attendance uses the original Identity Center enrolled-device verifier and does not persist transient proof',async t=>{
 t.mock.timers.enable({apis:['Date'],now:Date.parse('2026-11-13T01:00:00Z')});
 const f=fixture({native:true});try{
  const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()),method={type:'wifi',ssid:'Contract Office',bssid:'aa:bb:cc:dd:ee:01'},deviceSecret='unit-only-transient-device-proof';
  Object.assign(f.rows.get(f.root+'companies/tenant-a'),{attendanceWifiSsid:method.ssid,attendanceWifiBssid:method.bssid,attendanceBiometricRequired:true});Object.assign(f.rows.get(f.root+'employees/employee-a'),{position:'Kinh doanh',role:'super_admin',shiftStart:'00:00',shiftEnd:'23:59'});
  const identityId=f.tokens.a.identityId;f.rows.get('identity_accounts/'+identityId).credentialVersion=1;f.rows.set('identity_accounts/'+identityId+'/devices/unit-device',{trusted:true,biometricEnabled:true,credentialVersion:1,deviceSecretHash:createHash('sha256').update(deviceSecret).digest('hex')});
  const c=command('attendance','attendance.check_in',day+'_employee-a',{version:1,employeeId:'employee-a',deviceId:'unit-device',workDate:day,workRole:'Kinh doanh',method,baseRevision:0,baseFingerprint:null,resolvesConflictId:null}),attendanceContext={device:{deviceId:'unit-device',platform:'android'},deviceSecret,method};
  const r=await f.call('sync',{command:c,attendanceContext});assert.equal(r.outcome,'accepted',r.rejectionCode);assert.deepEqual(await f.call('sync',{command:c,attendanceContext}),r);assert.equal([...f.rows.keys()].filter(p=>p.startsWith('identity_audit_logs/')).length,1);assert(!JSON.stringify([...f.rows.values()]).includes(deviceSecret));
  await assert.rejects(f.call('sync',{command:c,attendanceContext:{...attendanceContext,deviceSecret:'wrong'}}),e=>e.code==='permission-denied');f.rows.get('identity_accounts/'+identityId+'/devices/unit-device').revokedAt=Date.now();await assert.rejects(f.call('sync',{command:c,attendanceContext}),e=>e.code==='permission-denied');
 }finally{await f.close();}
});
test('revocation or token expiry after request admission is denied inside the business transaction, including receipt replay',async()=>{
 for(const expire of [false,true]){const f=fixture();try{const c=stockIntent(),r=await f.call('sync',{command:c});assert.equal(r.outcome,'accepted');const count=f.writes.length;
  f.beforeWrite(()=>{if(expire)f.tokens.a.exp=1;else f.rows.get('identity_accounts/'+f.tokens.a.identityId).lockedAt=1;});
  await assert.rejects(f.call('sync',{command:c}),e=>e.code===(expire?'unauthenticated':'permission-denied'));assert.equal(f.writes.length,count);assert.equal(f.rows.get(f.root+'warehouseStockCounts/'+c.entityId).quantity,3);
 }finally{await f.close();}}
});
test('trusted commands reject a cloned environment or an authority with changed membership/revision',async()=>{
 const f=fixture();try{
  assert.throws(()=>createOfflineCommandAuthority({db:f.db,projectId:f.environment.projectId,appId:f.environment.appId,environment:{...f.environment},readAuthority:async()=>({})}),/Verified command environment/);
  const actor={uid:f.tokens.a.uid,tenantId:'tenant-a',permissionRevision:'revision-one'};
  const read=createOfflineCommandAuthority({db:f.db,projectId:f.environment.projectId,appId:f.environment.appId,environment:f.environment,readAuthority:async()=>({...actor,permissionRevision:'revision-two'})});
  await assert.rejects(read({},actor),e=>e.code==='permission-denied');assert.equal(f.writes.length,0);
 }finally{await f.close();}
});
