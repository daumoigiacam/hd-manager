// Local application service. Approved structured corrections atomically patch
// the original unlocked attendance source and audit. Locked periods and legacy
// free-text requests remain unapplied; payroll formulas/snapshots are untouched.
const {createHash}=require('node:crypto');
const {prepareAttendanceAdjustment}=require('./attendanceAdjustmentApplication.cjs');
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const id=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,160}$/.test(x);
const fail=(message,code='invalid-argument')=>{throw Object.assign(Error(message),{code});};
const text=(x,max)=>typeof x==='string'&&x.trim()&&x.length<=max;
function createAttendanceAdjustmentRequests({db,projectId,appId,authorize,now=Date.now}){
 if(!projectId?.startsWith('demo-')||db.projectId!==projectId||!/^(127\.0\.0\.1|localhost):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||'')||!id(appId))fail('Local authority required','permission-denied');
 const ref=(tenant,request)=>db.doc('attendanceAdjustmentRequests/'+hash([appId,tenant,request]));
 const receipt=(tenant,uid,key)=>db.doc('attendanceAdjustmentReceipts/'+hash([appId,tenant,uid,key]));
 return async function handle(uid,body){
  if(!id(uid)||!body||!['create','approve','reject','list'].includes(body.action))fail('Invalid adjustment action');
  if(body.action==='list')return db.runTransaction(async tx=>{
   const actor=await authorize(tx,uid);if(!actor.canRequest&&!actor.canReview)fail('Denied','permission-denied');
   let q=db.collection('attendanceAdjustmentRequests').where('tenantId','==',actor.tenantId);if(!actor.canReview)q=q.where('principalId','==',uid);
   q=q.orderBy('__name__').limit(41);if(body.after){if(!/^[a-f0-9]{64}$/.test(body.after))fail('Invalid cursor');q=q.startAfter(db.doc('attendanceAdjustmentRequests/'+body.after));}
   const rows=(await tx.get(q)).docs;return{items:rows.slice(0,40).map(d=>d.data()),hasMore:rows.length>40,after:rows.length>40?rows[39].id:null};
  });
  if(!id(body.commandId)||body.commandId!==body.idempotencyKey||!id(body.requestId)||Object.keys(body).some(k=>!['action','commandId','idempotencyKey','requestId','payload','expectedRevision'].includes(k)))fail('Invalid immutable adjustment command');
  const digest=hash(body.payload),kind='attendanceRequest.'+body.action;
  return db.runTransaction(async tx=>{
   const actor=await authorize(tx,uid);if(!id(actor.tenantId)||!id(actor.employeeId))fail('Invalid actor','permission-denied');
   if(body.action==='create'?!actor.canRequest:!actor.canReview)fail('Current permission denied','permission-denied');
   const rr=receipt(actor.tenantId,uid,body.commandId),prior=await tx.get(rr);if(prior.exists){const r=prior.data();if(r.payloadDigest!==digest||r.kind!==kind||r.entityId!==body.requestId||r.baseRevision!==body.expectedRevision)fail('Idempotency key reused');return r;}
   const target=ref(actor.tenantId,body.requestId),existing=await tx.get(target),current=existing.exists?existing.data():null;let document,attendancePatch=null;
   const at=new Date(now()).toISOString();
   if(body.action==='create'){
    const p=body.payload;if(!p||Object.keys(p).some(k=>!['workDate','workRole','adjustmentType','reason','proposedDetail','proposedTimes','baseFingerprint','baseRevision'].includes(k))||!/^\d{4}-\d{2}-\d{2}$/.test(p.workDate||'')||!Number.isFinite(Date.parse(p.workDate+'T00:00:00Z'))||new Date(p.workDate+'T00:00:00Z').toISOString().slice(0,10)!==p.workDate||!text(p.workRole,160)||!text(p.adjustmentType,80)||!text(p.reason,2000)||!text(p.proposedDetail,4000)||body.expectedRevision!==0)fail('Invalid adjustment request');
    if(current)fail('Request already exists','failed-precondition');
    const safe=actor.tenantId.trim().replace(/[^a-zA-Z0-9_-]+/g,'_').replace(/^_+|_+$/g,''),period=await tx.get(db.doc(`artifacts/${appId}/public/data/payrollPeriods/payroll_${safe}_${p.workDate.slice(0,7)}`));
    document={id:body.requestId,tenantId:actor.tenantId,principalId:uid,employeeId:actor.employeeId,...p,status:'PENDING_REVIEW',revision:1,createdAt:at,lockedPeriod:['LOCKED','ADJUSTED'].includes(String(period.data()?.status||'').toUpperCase()),applied:false,history:[{action:'create',by:actor.employeeId,principalId:uid,at,reason:p.reason}]};
    if(p.proposedTimes){const proof=await prepareAttendanceAdjustment({db,tx,appId,tenantId:actor.tenantId,employeeId:actor.employeeId,payload:p,reviewer:actor,now:now()});document.sourceChangedOnSubmission=!proof.sourceMatches;}
   }else{
    if(!current||current.tenantId!==actor.tenantId||current.status!=='PENDING_REVIEW'||current.revision!==body.expectedRevision)fail('Request changed; reload before reviewing','failed-precondition');
    if(!body.payload||Object.keys(body.payload).some(k=>k!=='reason')||!text(body.payload.reason,2000))fail('Review reason required');
    document={...current,status:body.action==='approve'?'APPROVED_PENDING_APPLICATION':'REJECTED',revision:current.revision+1,reviewedBy:actor.employeeId,reviewedAt:at,reviewReason:body.payload.reason,applied:false,history:[...current.history,{action:body.action,by:actor.employeeId,principalId:uid,at,reason:body.payload.reason}]};
    if(body.action==='approve'&&current.proposedTimes){const safe=actor.tenantId.trim().replace(/[^a-zA-Z0-9_-]+/g,'_').replace(/^_+|_+$/g,''),period=await tx.get(db.doc(`artifacts/${appId}/public/data/payrollPeriods/payroll_${safe}_${current.workDate.slice(0,7)}`));document.lockedPeriod=['LOCKED','ADJUSTED'].includes(String(period.data()?.status||'').toUpperCase());if(!document.lockedPeriod){attendancePatch=await prepareAttendanceAdjustment({db,tx,appId,tenantId:actor.tenantId,employeeId:current.employeeId,payload:current,reviewer:actor,now:now()});if(!attendancePatch.sourceMatches){const conflict={outcome:'conflict',commandId:body.commandId,idempotencyKey:body.commandId,payloadDigest:digest,tenantId:actor.tenantId,principalId:uid,kind,entityId:body.requestId,baseRevision:body.expectedRevision,reason:'attendance-source-changed',sourceFingerprint:attendancePatch.sourceFingerprint};tx.set(rr,conflict);return conflict;}document.status='APPROVED';document.applied=true;document.attendanceBefore=attendancePatch.beforeTimes;document.attendanceAfter=attendancePatch.afterTimes;document.attendanceRevision=attendancePatch.after.offlineAttendanceRevision;document.attendanceFingerprint=attendancePatch.fingerprint;}}
   }
   const result={outcome:'accepted',commandId:body.commandId,idempotencyKey:body.commandId,payloadDigest:digest,tenantId:actor.tenantId,principalId:uid,kind,entityId:body.requestId,baseRevision:body.expectedRevision,document};if(attendancePatch&&document.applied){tx.set(attendancePatch.reference,attendancePatch.after);tx.set(db.doc('attendanceAdjustmentApplicationAudits/'+hash([appId,actor.tenantId,body.requestId,body.commandId])),{tenantId:actor.tenantId,requestId:body.requestId,commandId:body.commandId,actorId:actor.employeeId,principalId:uid,at,before:attendancePatch.before,after:attendancePatch.after});}tx.set(target,document);tx.set(rr,result);return result;
  });
 };
}
module.exports={createAttendanceAdjustmentRequests};
