// Domain service for Development/Emulator only. Intentionally not exported by
// functions/index.js. Caller supplies verified identity and server authorization.
const {createHash}=require('node:crypto');
const {isTrustedOfflineServerEnvironment}=require('./offlineServerEnvironment.cjs');
function canonical(value){
 if(value===null||typeof value!=='object')return JSON.stringify(value);
 if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
 return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
}
const fingerprint=value=>createHash('sha256').update(canonical(value)).digest('hex');
function createOfflineCustomerCommandService({db,projectId,appId,authorize,environment}){
 if(!/^demo-[a-z0-9-]+$/.test(projectId)&&!isTrustedOfflineServerEnvironment(environment,projectId,appId,db))throw new Error('Customer pilot is Emulator-only');
 const ref=(collection,id)=>db.doc(`artifacts/${appId}/public/data/${collection}/${id}`);
 return async function apply(actor,command){
  if(!actor?.uid||!actor?.tenantId)throw new Error('Verified identity required');
  if(!['customer.create','customer.update','customer.archive'].includes(command.kind))throw new Error('Unsupported customer operation');
  if(!/^[a-zA-Z0-9_-]{1,160}$/.test(command.entityId)||!/^[a-zA-Z0-9_-]{1,160}$/.test(command.commandId)||command.idempotencyKey!==command.commandId)throw new Error('Invalid command identity');
  const digest=createHash('sha256').update(JSON.stringify(command.payload)).digest('hex');
  if(digest!==command.payloadDigest)throw new Error('Payload digest mismatch');
  const receiptId=fingerprint([actor.tenantId,actor.uid,command.idempotencyKey]);
  const receiptRef=db.doc(`offlineCustomerReceipts/${receiptId}`);
  return db.runTransaction(async tx=>{
   // Authorization is a transaction read, so changes to the server grant force
   // Firestore to retry instead of authorizing from stale client claims.
   await authorize(tx,actor,command.kind,command);
   const prior=await tx.get(receiptRef);
   if(prior.exists){if(prior.data().payloadDigest!==digest||prior.data().entityId!==command.entityId||prior.data().kind!==command.kind)throw new Error('Idempotency key reused');return prior.data();}
   const customerRef=ref('customers',command.entityId), snapshot=await tx.get(customerRef);
   const live=snapshot.exists?snapshot.data():null;
   const body=command.payload;
   if(!body||typeof body!=='object'||Array.isArray(body))throw new Error('Invalid customer payload');
   let outcome='accepted',reason=null,document;
   let expectedFingerprint=body.baseFingerprint;
   if(command.kind!=='customer.create'&&body.baseCommandId){
    const base=await tx.get(db.doc(`offlineCustomerReceipts/${fingerprint([actor.tenantId,actor.uid,body.baseCommandId])}`));
    if(!base.exists||base.data().outcome!=='accepted'||base.data().entityId!==command.entityId)throw new Error('Dependency is not confirmed');
    expectedFingerprint=base.data().fingerprint;
   }
   if(live&&live.companyId!==actor.tenantId)throw new Error('Tenant denied');
   if(command.kind==='customer.create'){
    if(live){outcome='conflict';reason='customer-exists';}
    else {
     if(body.companyId!==actor.tenantId||body.id!==command.entityId||typeof body.name!=='string'||!body.name.trim()||typeof body.phone!=='string'||!body.phone.trim())throw new Error('Invalid new customer');
     // Accept only profile fields. A blacklist left other opening-balance and
     // debt-limit names writable by a crafted client despite the UI guard.
     const allowedCreate=new Set(['id','companyId','empId','name','phone','address','customerHonorific','note','notes','customerGroup','zaloContact','zaloGroupLink','location','locationUrl','locationInput','locationLat','locationLng','mapLocation','locationUpdatedAt','locationSource']);
     if(Object.keys(body).some(k=>!allowedCreate.has(k)))throw new Error('Sensitive customer fields require online workflow');
     document={...body,offlineRevision:1};
    }
   }else{
    if(!live||expectedFingerprint!==fingerprint(live)){outcome='conflict';reason='customer-changed';}
    else{
     const patch=body.patch;
     const allowed=new Set(['name','phone','address','customerHonorific','note','notes','customerGroup','zaloContact','zaloGroupLink','location','locationUrl','locationInput','locationLat','locationLng','mapLocation','locationUpdatedAt','locationSource','isArchived','archivedAt','updatedAt']);
     if(!patch||Object.keys(patch).some(k=>!allowed.has(k)))throw new Error('Unsupported profile patch');
     if(command.kind==='customer.archive'&&patch.isArchived!==true)throw new Error('Archive requires tombstone');
     document={...live,...patch,offlineRevision:(live.offlineRevision||0)+1};
    }
   }
   const receipt={tenantId:actor.tenantId,principalId:actor.uid,commandId:command.commandId,idempotencyKey:command.idempotencyKey,payloadDigest:digest,entityId:command.entityId,kind:command.kind,outcome,reason};
   if(outcome==='conflict'&&live){receipt.currentDocument=live;receipt.currentFingerprint=fingerprint(live);}
   if(document){tx.set(customerRef,document);receipt.document=document;receipt.fingerprint=fingerprint(document);}
   tx.set(receiptRef,receipt);
   return receipt;
  });
 };
}
module.exports={createOfflineCustomerCommandService,fingerprint};

