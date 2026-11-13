const {test}=require('node:test');
const assert=require('node:assert/strict');
const{createHash}=require('node:crypto');
const{createAttendancePeriods,hashAttendanceRecord}=require('../functions/attendancePeriodConfirmations.cjs');
const{createAttendanceAdjustmentRequests}=require('../functions/attendanceAdjustmentRequests.cjs');

function fixture(t){
 const prior=process.env.FIRESTORE_EMULATOR_HOST;process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8285';t.after(()=>{if(prior===undefined)delete process.env.FIRESTORE_EMULATOR_HOST;else process.env.FIRESTORE_EMULATOR_HOST=prior;});
 const root='artifacts/app/public/data/',rows=new Map([[root+'employees/e',{id:'e',companyId:'A',position:'Kinh doanh',roleSalaryComponents:[{position:'Xuất kho',amount:0}],startDate:'2026-11-01'}]]),actors={e:{tenantId:'A',employeeId:'e',readOwn:true,readAll:false,managerConfirm:false,canRequest:true,canReview:false},m:{tenantId:'A',employeeId:'m',readOwn:true,readAll:true,managerConfirm:true,canRequest:true,canReview:true},b:{tenantId:'B',employeeId:'b',readOwn:true,readAll:true,managerConfirm:true,canRequest:true,canReview:true}};
 let serial=Promise.resolve(),failReceipt=false;
 const db={projectId:'demo-test',doc:path=>({path}),runTransaction(work){const task=serial.then(async()=>{const next=structuredClone(rows);let wrote=false;const result=await work({async get(ref){assert.equal(wrote,false,'All source reads precede writes');return{exists:next.has(ref.path),data:()=>next.get(ref.path)};},set(ref,data){wrote=true;if(failReceipt&&/Receipts\//.test(ref.path))throw Error('receipt write failed');next.set(ref.path,data);}});rows.clear();for(const pair of next)rows.set(...pair);return result;});serial=task.catch(()=>{});return task;}};
 const options={db,projectId:db.projectId,appId:'app',authorize:async(tx,uid)=>actors[uid]||{},now:()=>Date.parse('2026-11-12T10:00:00Z')};
 const periods=createAttendancePeriods({...options,loadRoles:()=>import('../development/hd-manager/application/src/utils/attendanceWorkRoles.js')}),requests=createAttendanceAdjustmentRequests(options);
 const read=(uid='e')=>periods.handle(uid,{action:'read',employeeId:'e',monthKey:'2026-11'});
 const command=(view,action,key)=>{const payload={employeeId:'e',monthKey:'2026-11',sourceFingerprint:view.sourceFingerprint,expectedRevision:view.revision,reason:'Reviewed original source'};return{command:{commandId:key,idempotencyKey:key,kind:'attendancePeriod.'+action,entityId:view.entityId,baseRevision:view.revision,payload,payloadDigest:createHash('sha256').update(JSON.stringify(payload)).digest('hex')}};};
 const correction=(key='c',role='Kinh doanh',base=null,revision=0)=>({action:'create',commandId:key,idempotencyKey:key,requestId:key,expectedRevision:0,payload:{workDate:'2026-11-12',workRole:role,adjustmentType:'Sửa giờ công',reason:'Đã kiểm tra nguồn',proposedDetail:'Giờ thực tế',proposedTimes:{status:'present',checkIn:'2026-11-12T01:00:00Z',checkOut:'2026-11-12T05:00:00Z'},baseFingerprint:base,baseRevision:revision}});
 const review=(key='c',command='r')=>({action:'approve',commandId:command,idempotencyKey:command,requestId:key,expectedRevision:1,payload:{reason:'Đối chiếu chứng từ'}});
 return{rows,root,actors,options,periods,requests,read,command,correction,review,failReceipt:()=>{failReceipt=true;}};
}

test('explicit employee and manager confirmations bind exact source and preserve immutable receipts',async t=>{
 const f=fixture(t),v=await f.read();assert.equal(v.days.length,30);assert.equal(v.confirmation,null);assert.equal(v.sourceComplete,true);
 const first=f.command(v,'employeeConfirm','employee');await assert.rejects(f.periods.handle('m',first),{code:'permission-denied'});
 const r=await f.periods.handle('e',first);assert.equal(r.document.confirmation.status,'EMPLOYEE_CONFIRMED');assert.deepEqual(await f.periods.handle('e',first),r);
 const second=f.command(r.document,'managerConfirm','manager');await assert.rejects(f.periods.handle('e',second),{code:'permission-denied'});const final=await f.periods.handle('m',second);assert.equal(final.document.confirmation.status,'MANAGER_CONFIRMED');assert.equal(final.document.confirmation.history.length,2);
 f.actors.m.managerConfirm=false;await assert.rejects(f.periods.handle('m',second),{code:'permission-denied'});
});
test('changed source and stale confirmation produce retained conflicts, never overwrite',async t=>{
 const f=fixture(t),v=await f.read();await f.periods.handle('e',f.command(v,'employeeConfirm','e1'));const approved=await f.read();f.rows.set(f.root+'attendance/2026-11-12_e',{companyId:'A',status:'present',checkIn:'2026-11-12T01:00:00Z'});
 const c=f.command(approved,'managerConfirm','stale'),r=await f.periods.handle('m',c);assert.equal(r.outcome,'conflict');assert.deepEqual(await f.periods.handle('m',c),r);assert.equal((await f.read()).confirmation.status,'EMPLOYEE_CONFIRMED');assert.equal((await f.read()).sourceChanged,true);
 const fresh=await f.read(),renew=await f.periods.handle('e',f.command(fresh,'employeeConfirm','e2'));assert.equal(renew.document.sourceChanged,false);assert.equal(renew.document.confirmation.history.length,2);
});
test('tenant mismatch, malformed revision and receipt write failure leave source unchanged',async t=>{
 const f=fixture(t);await assert.rejects(f.read('b'),{code:'permission-denied'});f.rows.set(f.root+'attendance/2026-11-12_e',{companyId:'A',offlineAttendanceRevision:false});await assert.rejects(f.read(),{code:'failed-precondition'});f.rows.delete(f.root+'attendance/2026-11-12_e');const v=await f.read(),before=structuredClone(f.rows);f.failReceipt();await assert.rejects(f.periods.handle('e',f.command(v,'employeeConfirm','failure')),/receipt write/);assert.deepEqual(f.rows,before);
});
test('structured approval patches one work role atomically, keeping all other work and old receipts',async t=>{
 const f=fixture(t);const first=await f.requests('e',f.correction()),applied=await f.requests('m',f.review());assert.equal(applied.document.applied,true);assert.equal(first.document.applied,false);
 const original=f.rows.get(f.root+'attendance/2026-11-12_e'),secondary=f.correction('secondary','Xuất kho',hashAttendanceRecord(original),1);await f.requests('e',secondary);await f.requests('m',f.review('secondary','second-review'));const final=f.rows.get(f.root+'attendance/2026-11-12_e');assert.equal(final.offlineAttendanceRevision,2);assert.equal(final.checkIn,original.checkIn);assert.equal(final.workRoles['Xuất kho'].status,'present');assert.equal((await f.read()).days.find(x=>x.date==='2026-11-12').roles.filter(x=>x.hasRecord).length,2);assert.deepEqual(await f.requests('e',f.correction()),first);
});
test('stale corrections retain conflict and locked periods never patch attendance',async t=>{
 const f=fixture(t);await f.requests('e',f.correction());await f.requests('e',f.correction('stale'));await f.requests('m',f.review());const before=structuredClone(f.rows.get(f.root+'attendance/2026-11-12_e'));const conflict=await f.requests('m',f.review('stale','stale-review'));assert.equal(conflict.outcome,'conflict');assert.deepEqual(f.rows.get(f.root+'attendance/2026-11-12_e'),before);
 f.rows.set(f.root+'payrollPeriods/payroll_A_2026-11',{status:'LOCKED',salary:123});const locked=await f.requests('m',f.review('stale','locked-review'));assert.equal(locked.document.applied,false);assert.equal(locked.document.status,'APPROVED_PENDING_APPLICATION');assert.deepEqual(f.rows.get(f.root+'attendance/2026-11-12_e'),before);
});

test('work assignment requires actual employee policy permissions and retains the original salary history',async t=>{
 const f=fixture(t);f.actors.owner={...f.actors.m,employeeId:'owner',assignWorkRole:true};
 const loadRoles=()=>Promise.all([import('../development/hd-manager/application/src/utils/attendanceWorkRoles.js'),import('../development/hd-manager/application/src/utils/payrollPolicyHistory.js'),import('../development/hd-manager/application/src/features/payroll/payrollOriginalShared.js')]).then(parts=>Object.assign({},...parts));
 const domain=await loadRoles(),old=f.rows.get(f.root+'employees/e');Object.assign(old,domain.buildEmployeePayrollPolicyUpdate({nextEmployee:old,effectiveFrom:'2026-11-01',changedAt:'2026-11-01T00:00:00Z'}));const before=structuredClone(old),service=createAttendancePeriods({...f.options,loadRoles});
 const view=await service.handle('owner',{action:'read',employeeId:'e',monthKey:'2026-11'}),p={employeeId:'e',monthKey:'2026-11',sourceFingerprint:view.sourceFingerprint,expectedRevision:view.revision,reason:'Phân công đã được xác nhận',workRole:'Sản xuất',amountVnd:0,effectiveFrom:'2026-11-12',employeePolicyFingerprint:view.assignment.employeePolicyFingerprint};
 const command={kind:'attendancePeriod.assignWorkRole',commandId:'assign',idempotencyKey:'assign',entityId:view.entityId,baseRevision:view.revision,payload:p,payloadDigest:createHash('sha256').update(JSON.stringify(p)).digest('hex')};
 await assert.rejects(service.handle('m',{command}),{code:'permission-denied'});const result=await service.handle('owner',{command});assert.equal(result.outcome,'accepted');assert.ok(result.document.workRoles.includes('Sản xuất'));assert.deepEqual(await service.handle('owner',{command}),result);
 const after=f.rows.get(f.root+'employees/e');assert.equal(after.position,before.position);assert.equal(after.role,before.role);assert.deepEqual(after.additionalPositions,before.additionalPositions);assert.deepEqual(after.rolePermissions,before.rolePermissions);assert.equal(after.payrollPolicies[0].values.position,before.payrollPolicies[0].values.position);assert.equal(after.payrollPolicies.length,2);assert.equal(after.roleSalaryComponents.at(-1).amount,0);
 const stale={...command,commandId:'stale-assignment',idempotencyKey:'stale-assignment'};assert.equal((await service.handle('owner',{command:stale})).outcome,'conflict');assert.equal(f.rows.get(f.root+'employees/e').roleSalaryComponents.length,2);
});

test('explicit reconfirmation references only own same-entity conflict receipts and preserves their immutable bytes',async t=>{
 const f=fixture(t),oldView=await f.read(),stale=f.command(oldView,'employeeConfirm','old-conflict');f.rows.set(f.root+'attendance/2026-11-12_e',{companyId:'A',workRole:'Kinh doanh',status:'present',checkIn:'2026-11-12T01:00:00Z'});const conflict=await f.periods.handle('e',stale);assert.equal(conflict.outcome,'conflict');
 const fresh=await f.read(),next=f.command(fresh,'employeeConfirm','new-confirmation');next.command.payload.supersedesCommandIds=['old-conflict'];next.command.payloadDigest=createHash('sha256').update(JSON.stringify(next.command.payload)).digest('hex');
 const missing=structuredClone(next);missing.command.payload.supersedesCommandIds=['missing'];missing.command.payloadDigest=createHash('sha256').update(JSON.stringify(missing.command.payload)).digest('hex');await assert.rejects(f.periods.handle('e',missing),{code:'permission-denied'});
 const receipt=await f.periods.handle('e',next);assert.equal(receipt.outcome,'accepted');assert.deepEqual(receipt.document.confirmation.history[0].supersedesCommandIds,['old-conflict']);assert.deepEqual(await f.periods.handle('e',stale),conflict);assert.deepEqual(await f.periods.handle('e',next),receipt);assert.equal((await f.read()).confirmation.history.length,1);
});
