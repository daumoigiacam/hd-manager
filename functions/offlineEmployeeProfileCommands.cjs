// Development-only, same business authority and transactional receipt pattern.
const {createHash}=require('node:crypto');const {fingerprint}=require('./offlineCustomerCommands.cjs');
const id=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,160}$/.test(x);
const deny=message=>{throw Object.assign(Error(message),{code:'permission-denied'});};
function createOfflineEmployeeProfileCommandService({db,projectId,appId,authorize,loadDomain,now=Date.now}){
 if(!/^demo-[a-z0-9-]+$/.test(projectId)||!/^(localhost|127\.0\.0\.1):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||'')||db.projectId!==projectId)deny('Local employee profile authority required');
 return async(actor,command)=>{
  const d=await loadDomain(),p=command?.payload;if(!Object.hasOwn(d.employeeProfileActions,command?.kind)||![actor?.uid,actor?.tenantId,command.commandId,command.entityId].every(id)||command.idempotencyKey!==command.commandId||!p||Object.keys(p).some(k=>!['input','position','baseFingerprint','baseRevision'].includes(k))||!Number.isSafeInteger(command.baseRevision)||command.baseRevision<0||command.baseRevision>=Number.MAX_SAFE_INTEGER||command.baseRevision!==p.baseRevision)deny('Invalid employee profile command');
  const digest=createHash('sha256').update(JSON.stringify(p)).digest('hex');if(digest!==command.payloadDigest)deny('Employee profile digest mismatch');
  const ref=db.doc(`artifacts/${appId}/public/data/employees/${command.entityId}`),receiptRef=db.doc('offlineEmployeeProfileReceipts/'+fingerprint([actor.tenantId,actor.uid,command.commandId]));
  return db.runTransaction(async tx=>{
   const authorized=await authorize(tx,actor,command.kind);if(authorized.tenantId!==actor.tenantId)deny('Employee tenant denied');
   const old=await tx.get(receiptRef);if(old.exists){const r=old.data();if(r.payloadDigest!==digest||r.entityId!==command.entityId||r.kind!==command.kind)deny('Employee idempotency key reused');return r;}
   const snap=await tx.get(ref),live=snap.exists?{...snap.data(),id:snap.id}:null,creating=command.kind==='employeeProfile.create',archiving=command.kind==='employeeProfile.archive';if(live&&live.companyId!==actor.tenantId)deny('Employee belongs to another tenant');
   const receipt={tenantId:actor.tenantId,principalId:actor.uid,commandId:command.commandId,idempotencyKey:command.commandId,payloadDigest:digest,entityId:command.entityId,kind:command.kind,baseRevision:command.baseRevision,outcome:'accepted'};
   if(creating?(live||command.baseRevision!==0||p.baseFingerprint!==null):(!live||fingerprint(live)!==p.baseFingerprint||(live.offlineEmployeeProfileRevision||0)!==command.baseRevision)){
    receipt.outcome='conflict';receipt.reason='employee-profile-changed';if(live){receipt.currentDocument=live;receipt.currentFingerprint=fingerprint(live);receipt.currentRevision=live.offlineEmployeeProfileRevision||0;}
   }else{
    if(!creating)d.assertEditableEmployee(live,actor.tenantId);
    let document;if(archiving){if(p.input!==null||p.position!==null)deny('Archive is a tombstone only');document={...live,isArchived:true,archivedAt:new Date(now()).toISOString(),archivedByEmpId:authorized.employeeId};}
    else{const input=d.profileInput(p.input);if(!creating&&p.position!==null)deny('Position changes require policy workflow');
     // Transactional query prevents concurrent employee phone duplication,
     // including the original legacy phone variants. Never a UI-only check.
     const peers=await tx.get(db.collection(`artifacts/${appId}/public/data/employees`).where('companyId','==',actor.tenantId));if(peers.docs.some(e=>e.id!==command.entityId&&d.isSameLoginPhone(e.data().phone,input.phone)))deny('Employee phone already exists');
     document=creating?d.newProfile(input,{id:command.entityId,tenant:actor.tenantId,position:p.position}):{...live,...input};
    }
    document.offlineEmployeeProfileRevision=command.baseRevision+1;receipt.document=document;receipt.fingerprint=fingerprint(document);receipt.revision=document.offlineEmployeeProfileRevision;tx.set(ref,document);
   }
   tx.set(receiptRef,receipt);return receipt;
  });
 };
}
module.exports={createOfflineEmployeeProfileCommandService};
