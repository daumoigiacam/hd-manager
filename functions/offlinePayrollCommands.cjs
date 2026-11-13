// Development-only, explicit composition; importing does not start a service.
const {createHash}=require('node:crypto');
const hash=v=>createHash('sha256').update(v).digest('hex');
const fail=(message,code='permission-denied')=>{throw Object.assign(Error(message),{code});};
function createOfflinePayrollCommandService({db,projectId,appId,verifyTimesheets,now=Date.now,serverTimestamp=()=>require('firebase-admin/firestore').FieldValue.serverTimestamp(),loadDomain=()=>import('../development/hd-manager/application/src/features/payroll/offlinePayrollProtocol.js')}){
 if(!/^demo-[a-z0-9-]+$/.test(projectId||'')||!/^(127\.0\.0\.1|localhost):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||'')||(db?.projectId&&db.projectId!==projectId)||!db?.runTransaction||!db?.collection||!/^[A-Za-z0-9_-]{1,160}$/.test(appId||''))fail('Payroll requires explicit Development Firestore and existing owner');
 return async function apply(actor,command){
  const d=await loadDomain();if(!d.PAYROLL_COMMAND_CAPS[command?.kind]||![actor?.uid,actor?.tenantId,command.commandId,command.entityId].every(d.payrollId)||!actor.permissionRevision||command.idempotencyKey!==command.commandId)fail('Invalid payroll command identity');
  const p=d.validatePayrollPayload(command.kind,command.payload);
  if(command.entityId!==d.buildPayrollPeriodId(actor.tenantId,p.values.monthKey)||p.plan.periodId!==command.entityId||command.baseRevision!==0||hash(JSON.stringify(p))!==command.payloadDigest||hash(d.canonicalPayroll(p.plan.base))!==p.baseFingerprint)fail('Invalid immutable payroll compound/CAS payload');
  for(const w of [...p.plan.writes,...p.plan.base])if(w.body&&w.body.companyId!==actor.tenantId)fail('Cross-tenant payroll document');
  const root=`artifacts/${appId}/public/data`,ref=(s,id)=>db.doc(`${root}/${s}/${id}`),receiptRef=id=>db.doc('offlinePayrollReceipts/'+hash(JSON.stringify([appId,actor.tenantId,actor.uid,id]))),ownReceipt=receiptRef(command.commandId);
  await db.runTransaction(async tx=>{
   const [bindingSnap,accessSnap,companySnap]=await Promise.all([tx.get(db.doc('offlineHomeActors/'+actor.uid)),tx.get(db.doc('offlineCustomerAccess/'+actor.uid)),tx.get(ref('companies',actor.tenantId))]);
   const binding=bindingSnap.data(),access=accessSnap.data(),company=companySnap.data();
   if(!binding?.active||binding.tenantId!==actor.tenantId||binding.sourceArchiveSha256||binding.employeeId!==p.employeeId||!access?.active||access.tenantId!==actor.tenantId||access.permissionRevision!==actor.permissionRevision||access.readScope!=='tenant'||access.appIdentity?.homeSourceProfile!==undefined||!['home.read','home.payroll.read',d.PAYROLL_COMPANY_READ,d.PAYROLL_COMMAND_CAPS[command.kind]].every(cap=>access.capabilities?.includes(cap)))fail('Current signed payroll binding/capability denied');
   const employeeSnap=await tx.get(ref('employees',binding.employeeId)),employee=employeeSnap.exists?{...employeeSnap.data(),id:binding.employeeId}:null;
   if(!company||company.isArchived||employee?.isArchived||employee?.companyId!==actor.tenantId||!d.payrollManager(employee,employee))fail('Original owner/super-admin/accounting payroll role required');
   // Authorization is rechecked even for an immutable old receipt replay.
   const prior=await tx.get(ownReceipt);if(prior.exists){const r=prior.data();if(r.tenantId!==actor.tenantId||r.principalId!==actor.uid||r.entityId!==command.entityId||r.kind!==command.kind||r.payloadDigest!==command.payloadDigest)fail('Immutable payroll receipt reused');return;}
   const headSnap=await tx.get(db.doc('offlineHomeFeeds/'+actor.tenantId)),head=headSnap.data();
   const sources={companies:[{...company,id:actor.tenantId}]};
   for(const source of d.PAYROLL_INPUT_SOURCES.filter(s=>s!=='companies')){const snapshot=await tx.get(db.collection(root+'/'+source).where('companyId','==',actor.tenantId));sources[source]=snapshot.docs.map(s=>({...s.data(),id:s.id}));}
   const data=d.validatePayrollSources(sources,actor.tenantId),inputFingerprint=hash(d.canonicalPayroll(data)),current=[];
   // Read every output's authoritative current body, including explicit absence.
   for(const w of p.plan.writes){const snap=await tx.get(ref(w.source,w.id));let body=null;if(snap.exists){const raw=snap.data();if(raw?.companyId!==actor.tenantId)fail('Compound payroll target outside tenant');if(raw.id!==w.id)fail('Legacy payroll target identity requires reconciliation','payroll-unsupported-contract');body=d.plainPayroll(raw);}current.push({source:w.source,id:w.id,body});}
   const currentFingerprint=hash(d.canonicalPayroll(current));
   const fenceRef=db.doc('offlinePayrollFences/'+hash(JSON.stringify([appId,actor.tenantId,p.values.monthKey]))),fence=(await tx.get(fenceRef)).data();
   if(fence&&(!Number.isSafeInteger(fence.revision)||fence.revision<0||fence.revision>=Number.MAX_SAFE_INTEGER||fence.tenantId!==actor.tenantId||fence.monthKey!==p.values.monthKey))fail('Invalid payroll serialization fence');
   if(p.resolvesConflictId){const previous=(await tx.get(receiptRef(p.resolvesConflictId))).data();if(previous?.outcome!=='conflict'||previous.entityId!==command.entityId||previous.principalId!==actor.uid||previous.currentFingerprint!==p.baseFingerprint||previous.currentInputFingerprint!==p.inputFingerprint)fail('Explicit current compound conflict review required');}
   const receipt={tenantId:actor.tenantId,principalId:actor.uid,commandId:command.commandId,idempotencyKey:command.commandId,payloadDigest:command.payloadDigest,entityId:command.entityId,kind:command.kind,outcome:'conflict'};
   const conflict=reason=>{tx.set(ownReceipt,{...receipt,reason,current,currentFingerprint,currentInputFingerprint:inputFingerprint,currentGeneration:head?.generation||null,currentSeq:Number.isSafeInteger(head?.seq)?head.seq:null});};
   if(!head?.ready||head.generation!==p.checkpoint.generation||head.seq!==p.checkpoint.seq||d.PAYROLL_INPUT_SOURCES.some(s=>!Number.isSafeInteger(head.counts?.[s])||head.counts[s]!==data[s].length)){conflict('payroll-source-generation-or-counts-changed');return;}
   if(inputFingerprint!==p.inputFingerprint||currentFingerprint!==p.baseFingerprint){conflict('payroll-input-or-compound-base-changed');return;}
   if(command.kind==='payroll.lock'&&!d.canLockPayrollPeriodAtDate(p.values.monthKey,d.getVietnamPayrollDateKey(new Date(now()))))fail('Server date is before payroll month end','payroll-unsupported-contract');
   const plan=d.planPayroll(data,command.kind,p.values,{tenantId:actor.tenantId,employeeId:binding.employeeId},{editedAt:p.editedAt,mutationId:command.commandId});
   if(d.canonicalPayroll(plan)!==d.canonicalPayroll(p.plan)){conflict('authoritative-payroll-plan-changed');return;}
   let timesheetBindings=[];
   if(command.kind==='payroll.lock'){
    if(typeof verifyTimesheets!=='function')fail('Timesheet confirmation authority is not configured','payroll-timesheet-authority-missing');
    timesheetBindings=await verifyTimesheets(tx,actor,p.values.monthKey,plan.writes.filter(w=>w.source==='payrollSnapshots').map(w=>w.body));
   }
   // All reads precede the first write. Original salary snapshots stay frozen.
   const timestamp=serverTimestamp();
   for(const binding of timesheetBindings)tx.set(db.doc('payrollAttendanceSourceLinks/'+hash(JSON.stringify([appId,actor.tenantId,binding.payrollSnapshotId]))),{...binding,tenantId:actor.tenantId,payrollPeriodId:command.entityId,lockCommandId:command.commandId,lockedBy:bindingSnap.data().employeeId,lockedAtServer:timestamp});
   for(const w of plan.writes){const body=command.kind==='payroll.lock'&&(w.source==='payrollPeriods'||w.source==='activityLogs'&&w.body.type==='payroll_period_lock')?{...w.body,closedAtServer:timestamp}:w.body;tx.set(ref(w.source,w.id),body);}
   tx.set(fenceRef,{tenantId:actor.tenantId,monthKey:p.values.monthKey,revision:(fence?.revision||0)+1});
   tx.set(ownReceipt,{...receipt,outcome:'accepted',writes:plan.writes,fingerprint:hash(d.canonicalPayroll(plan.writes)),closedAtServer:timestamp,...(timesheetBindings.length?{timesheetBindings}:{})});
  });
  // Server timestamps resolve once in the atomic receipt, then replay identically.
  const saved=(await ownReceipt.get()).data();if(!saved)fail('Payroll receipt not persisted');return d.plainPayroll(saved);
 };
}
async function payrollCapabilities(subject,loadDomain=()=>import('../development/hd-manager/application/src/features/payroll/offlinePayrollProtocol.js')){return(await loadDomain()).payrollCapabilities(subject);}
module.exports={createOfflinePayrollCommandService,payrollCapabilities};
