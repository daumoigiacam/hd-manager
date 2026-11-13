const {assertOfflineCommandEnvironment}=require('./offlineCommandAuthority.cjs');
const {createHash}=require('node:crypto');const hash=x=>createHash('sha256').update(x).digest('hex');
const fail=(message,code='permission-denied')=>{throw Object.assign(Error(message),{code});};
function createOfflineSalaryAdvanceCommandService({db,projectId,appId,environment,authorize,loadDomain}){
 assertOfflineCommandEnvironment({db,projectId,appId,environment,authorize});
 return async(actor,command)=>{
  const d=await loadDomain(),id=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,160}$/.test(x),p=command?.payload;
  if(!d.ADVANCE_KINDS.includes(command?.kind)||![actor?.uid,actor?.tenantId,command.commandId,command.entityId].every(id)||command.idempotencyKey!==command.commandId||command.baseRevision!==0||!p||Object.keys(p).some(k=>!['version','employeeId','values','editedAt','checkpoint','inputFingerprint','plan'].includes(k))||p.version!==1||!id(p.employeeId)||!id(p.checkpoint?.generation)||!Number.isSafeInteger(p.checkpoint.seq)||p.checkpoint.seq<0||!/[a-f0-9]{64}/.test(p.inputFingerprint||'')||hash(JSON.stringify(p))!==command.payloadDigest)fail('Invalid immutable salary advance command');
  d.validateAdvanceValues(command.kind,p.values);const expected=command.kind==='salaryAdvance.create'?'adv_'+command.commandId:p.values.requestId;if(command.entityId!==expected)fail('Salary advance identity mismatch');
  const root=`artifacts/${appId}/public/data`,ref=(s,key)=>{if(!d.ADVANCE_SOURCES.includes(s)||!id(key))fail('Invalid salary advance relation');return db.doc(root+'/'+s+'/'+key);},receiptRef=db.doc('offlineSalaryAdvanceReceipts/'+hash(JSON.stringify([appId,actor.tenantId,actor.uid,command.commandId])));
  return db.runTransaction(async tx=>{
   const fresh=await authorize(tx,actor,command.kind);if(fresh.tenantId!==actor.tenantId||fresh.employeeId!==p.employeeId)fail('Salary advance actor changed');
   const old=await tx.get(receiptRef);if(old.exists){const r=old.data();if(r.payloadDigest!==command.payloadDigest||r.entityId!==command.entityId||r.kind!==command.kind)fail('Salary advance idempotency key reused');return r;}
   const head=(await tx.get(db.doc('offlineHomeFeeds/'+actor.tenantId))).data(),sources={};for(const s of d.ADVANCE_SOURCES){if(s==='companies'){const company=await tx.get(ref(s,actor.tenantId));sources[s]=company.exists?[{...company.data(),id:company.id}]:[];}else{const q=await tx.get(db.collection(root+'/'+s).where('companyId','==',actor.tenantId));sources[s]=q.docs.map(doc=>({...doc.data(),id:doc.id}));}}
   const data=d.validateAdvanceSources(sources,actor.tenantId),fingerprint=hash(d.canonicalAdvance(data)),receipt={tenantId:actor.tenantId,principalId:actor.uid,commandId:command.commandId,idempotencyKey:command.commandId,payloadDigest:command.payloadDigest,entityId:command.entityId,kind:command.kind,outcome:'conflict'};
   if(!head?.ready||head.generation!==p.checkpoint.generation||head.seq!==p.checkpoint.seq||d.ADVANCE_SOURCES.some(s=>head.counts?.[s]!==data[s].length)||fingerprint!==p.inputFingerprint){const result={...receipt,reason:'salary-advance-source-changed',currentInputFingerprint:fingerprint,currentGeneration:head?.generation||null,currentSeq:head?.seq??null};tx.set(receiptRef,result);return result;}
   const plan=await d.planSalaryAdvance(data,command.kind,p.values,{tenantId:actor.tenantId,employeeId:p.employeeId},{editedAt:p.editedAt,mutationId:command.commandId});
   if(d.canonicalAdvance(plan)!==d.canonicalAdvance(p.plan))fail('Authoritative salary advance plan differs','invalid-argument');
   const fenceRef=db.doc('offlinePayrollFences/'+hash(JSON.stringify([appId,actor.tenantId,plan.monthKey]))),fence=(await tx.get(fenceRef)).data();if(fence&&(!Number.isSafeInteger(fence.revision)||fence.revision<0||fence.revision>=Number.MAX_SAFE_INTEGER||fence.tenantId!==actor.tenantId||fence.monthKey!==plan.monthKey))fail('Invalid existing payroll fence');
   for(const w of plan.writes){if(!['advances','financials'].includes(w.source)||w.body.companyId!==actor.tenantId||w.body.id!==w.id)fail('Salary advance write outside contract');tx.set(ref(w.source,w.id),w.body);}
   tx.set(fenceRef,{tenantId:actor.tenantId,monthKey:plan.monthKey,revision:(fence?.revision||0)+1});const result={...receipt,outcome:'accepted',writes:plan.writes,fingerprint:hash(d.canonicalAdvance(plan.writes))};tx.set(receiptRef,result);return result;
  });
 };
}
module.exports={createOfflineSalaryAdvanceCommandService};
