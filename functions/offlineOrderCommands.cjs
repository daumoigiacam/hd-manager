const {createHash}=require('node:crypto');
const {fingerprint}=require('./offlineCustomerCommands.cjs');
function createOfflineOrderCommandService({db,projectId,appId,authorize,duplicateSignature,hasCompanyRolePermissionAction,loadMutationDomain=()=>import('../development/hd-manager/application/src/features/orders/orderMutationProtocol.js')}){
 if(!projectId.startsWith('demo-')||!process.env.FIRESTORE_EMULATOR_HOST)throw Error('Order writes require Development Emulator');
 return async(actor,command)=>{
  if(['order.update','order.archive'].includes(command.kind))return applyMetadataMutation({db,projectId,appId,actor,command,hasCompanyRolePermissionAction,loadMutationDomain});
  if(command.kind!=='order.create'||command.idempotencyKey!==command.commandId||!['commandId','entityId'].every(k=>/^[a-zA-Z0-9_-]{1,160}$/.test(command[k])))throw Error('Invalid order command');
  const digest=createHash('sha256').update(JSON.stringify(command.payload)).digest('hex');if(digest!==command.payloadDigest)throw Error('Order digest mismatch');
  const {validateOfflineOrderDocument}=await import('../src/utils/offlineOrderDocument.js');
  const body=validateOfflineOrderDocument(command.payload,actor.tenantId);if(body.id!==command.entityId)throw Error('Order entity mismatch');
  const receiptRef=db.doc('offlineOrderReceipts/'+fingerprint([actor.tenantId,actor.uid,command.commandId]));
  const ref=(source,id)=>{if(!/^[a-zA-Z0-9_-]{1,160}$/.test(id))throw Error('Invalid linked identity');return db.doc(`artifacts/${appId}/public/data/${source}/${id}`);};
  return db.runTransaction(async tx=>{
   await authorize(tx,actor);
   const prior=await tx.get(receiptRef);if(prior.exists){const r=prior.data();if(r.payloadDigest!==digest||r.entityId!==body.id)throw Error('Idempotency key reused');return r;}
   const orderRef=ref('orders',body.id),live=await tx.get(orderRef);
   if(typeof duplicateSignature!=='function')throw Error('Original order duplicate rule missing');
   const existingOrders=await tx.get(db.collection(`artifacts/${appId}/public/data/orders`).where('companyId','==',actor.tenantId).where('customerId','==',body.customerId));
   const duplicate=existingOrders.docs.find(doc=>doc.id!==body.id&&duplicateSignature(doc.data())===duplicateSignature(body));
   const customer=await tx.get(ref('customers',body.customerId));if(!customer.exists||customer.data().companyId!==actor.tenantId||customer.data().isArchived)throw Object.assign(Error('Customer access denied'),{code:'permission-denied'});
   const employee=await tx.get(ref('employees',body.salesEmpId));if(!employee.exists||employee.data().companyId!==actor.tenantId||employee.data().isArchived)throw Object.assign(Error('Sales employee denied'),{code:'permission-denied'});
   for(const id of new Set(body.items.map(line=>line.productId))){const product=await tx.get(ref('products',id));if(!product.exists||product.data().companyId!==actor.tenantId||product.data().isArchived)throw Error('Product unavailable');}
   const receipt={tenantId:actor.tenantId,principalId:actor.uid,commandId:command.commandId,idempotencyKey:command.idempotencyKey,payloadDigest:digest,entityId:body.id,kind:command.kind,outcome:live.exists||duplicate?'conflict':'accepted'};
   if(live.exists||duplicate){receipt.reason=live.exists?'order-exists':'business-duplicate';receipt.currentFingerprint=fingerprint(live.exists?live.data():duplicate.data());}
   else{receipt.document=body;receipt.fingerprint=fingerprint(body);tx.set(orderRef,body);}
   tx.set(receiptRef,receipt);return receipt;
  });
 };
}
async function applyMetadataMutation({db,projectId,appId,actor,command,hasCompanyRolePermissionAction,loadMutationDomain}){
 const denied=message=>Object.assign(Error(message),{code:'permission-denied'});
 if(!/^demo-[a-z0-9-]+$/.test(projectId)||!process.env.FIRESTORE_EMULATOR_HOST)throw denied('Order CAS requires Development Emulator');
 const identifier=value=>typeof value==='string'&&/^[a-zA-Z0-9_-]{1,160}$/.test(value);
 if(!actor||![actor.uid,actor.tenantId,command.commandId,command.entityId].every(identifier)||command.idempotencyKey!==command.commandId)throw denied('Invalid CAS identity');
 if(typeof hasCompanyRolePermissionAction!=='function')throw denied('CAS needs original hasCompanyRolePermissionAction; create_manual_order is not edit/archive authorization');
 const domain=await loadMutationDomain(),rule=domain.ORDER_MUTATION_RULES[command.kind];
 const payload=domain.validateOrderMutationPayload(command.kind,command.payload);
 if(command.baseRevision!==payload.baseRevision)throw Error('Command base revision mismatch');
 const digest=createHash('sha256').update(JSON.stringify(payload)).digest('hex');if(digest!==command.payloadDigest)throw Error('Order mutation digest mismatch');
 const ref=(source,id)=>db.doc(`artifacts/${appId}/public/data/${source}/${id}`);
 const receiptRef=id=>db.doc('offlineOrderReceipts/'+fingerprint([actor.tenantId,actor.uid,id]));
 return db.runTransaction(async tx=>{
  // Re-read active binding, current signed-capability policy and original role
  // documents INSIDE the same transaction as CAS + receipt + order update.
  const binding=(await tx.get(db.doc('offlineHomeActors/'+actor.uid))).data();
  const access=(await tx.get(db.doc('offlineCustomerAccess/'+actor.uid))).data();
  if(!binding?.active||binding.tenantId!==actor.tenantId||!identifier(binding.employeeId)||binding.sourceArchiveSha256||!access?.active||access.tenantId!==actor.tenantId||access.permissionRevision!==actor.permissionRevision||!access.capabilities?.includes(rule.capability)||!access.capabilities.includes('orders.read')||access.appIdentity?.homeSourceProfile==='native-isolation-v1')throw denied('Order CAS identity/capability policy denied');
  const company=(await tx.get(ref('companies',actor.tenantId))).data(),employee=(await tx.get(ref('employees',binding.employeeId))).data();
  if(!company||!employee||employee.companyId!==actor.tenantId||employee.isArchived||hasCompanyRolePermissionAction({company:{...company,id:actor.tenantId},employee:{...employee,id:binding.employeeId},currentUser:{...employee,id:binding.employeeId}},rule.module,rule.action)!==true)throw denied('Missing original role action '+rule.module+'/'+rule.action);
  const prior=await tx.get(receiptRef(command.commandId));
  if(prior.exists){const value=prior.data();if(value.kind!==command.kind||value.entityId!==command.entityId||value.payloadDigest!==digest)throw Error('Immutable order mutation idempotency key reused');return value;}
  const orderRef=ref('orders',command.entityId),snapshot=await tx.get(orderRef),live=snapshot.exists?snapshot.data():null;
  if(live&&live.companyId!==actor.tenantId)throw denied('Order tenant denied');
  let expected=payload.baseFingerprint,expectedRevision=payload.baseRevision;
  if(payload.baseCommandId){
   const parent=(await tx.get(receiptRef(payload.baseCommandId))).data();
   if(!parent||parent.tenantId!==actor.tenantId||parent.principalId!==actor.uid||parent.entityId!==command.entityId||!['order.create','order.update','order.archive'].includes(parent.kind)||parent.outcome!=='accepted'||!/^[a-f0-9]{64}$/.test(parent.fingerprint))throw denied('Order dependency not authoritatively confirmed');
   expected=parent.fingerprint;expectedRevision=domain.orderRevision(parent.document);
  }
  if(payload.resolvesConflictId){
   const conflict=(await tx.get(receiptRef(payload.resolvesConflictId))).data();
   if(!conflict||conflict.tenantId!==actor.tenantId||conflict.principalId!==actor.uid||conflict.entityId!==command.entityId||conflict.outcome!=='conflict'||conflict.currentFingerprint!==expected)throw denied('Review the authoritative conflict before resolving');
  }
  const liveBody=live?{...live,id:command.entityId}:null;
  const currentFingerprint=liveBody?fingerprint(liveBody):null;
  const currentRevision=liveBody?domain.orderRevision(liveBody):null;
  const receipt={tenantId:actor.tenantId,principalId:actor.uid,commandId:command.commandId,idempotencyKey:command.commandId,payloadDigest:digest,entityId:command.entityId,kind:command.kind,outcome:'conflict'};
  if(!live||expected!==currentFingerprint||expectedRevision!==currentRevision){
   receipt.reason=live?'order-changed':'order-missing';
   if(liveBody){receipt.currentDocument=domain.publicOrder(liveBody);receipt.currentFingerprint=currentFingerprint;receipt.currentRevision=currentRevision;}
  }else{
   const document=domain.applyOrderMetadataPatch(live,command.kind,payload.patch,payload.editedAt);
   receipt.outcome='accepted';receipt.document=domain.publicOrder({...document,id:command.entityId});receipt.fingerprint=fingerprint({...document,id:command.entityId});
   tx.set(orderRef,document);
  }
  // Missing/conflicting orders produce a durable receipt without any order write.
  tx.set(receiptRef(command.commandId),receipt);return receipt;
 });
}
module.exports={createOfflineOrderCommandService};
