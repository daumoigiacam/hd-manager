const {createOfflineCommandAuthority}=require('./offlineCommandAuthority.cjs');
// Shared compound handler. Server routing/grants remain Main-owned.
const {createHash}=require('node:crypto');
const hash=v=>createHash('sha256').update(v).digest('hex');
const fail=(message,code='permission-denied')=>{throw Object.assign(Error(message),{code});};
function deliveryCapabilities(subject,policy){
 const can=(action,module='delivery_reports')=>policy(subject,module,action)===true;
 if(!can('view_delivery_reports'))return [];
 return [
  ...(can('create_delivery_report')&&can('edit_actual_delivery_quantity')&&can('edit_actual_delivery_weight')?['deliveryReports.create']:[]),
  ...(can('edit_delivery_report')?['deliveryReports.update']:[]),...(can('delete_delivery_report')?['deliveryReports.archive']:[]),
  ...(can('record_delivery_income')||can('create_income','finance')?['deliveryReports.income']:[]),
  ...(can('record_delivery_expense')||can('create_expense','finance')?['deliveryReports.expense']:[]),
  ...(can('record_return_goods')?['deliveryReports.returns']:[]),
  ...(can('create_asset_cost_log','asset_management')?['deliveryReports.assetCosts.create']:[]),
  ...(can('edit_asset_cost_log','asset_management')?['deliveryReports.assetCosts.update']:[]),
 ];
}
function createOfflineDeliveryCommandService({db,projectId,appId,environment,readAuthority,hasCompanyRolePermissionAction,loadDomain=()=>import('../development/hd-manager/application/src/features/delivery/deliveryCommandProtocol.js'),loadContext=()=>import('../development/hd-manager/application/src/features/delivery/deliveryContextSnapshot.js')}){
 const authority=createOfflineCommandAuthority({db,projectId,appId,environment,readAuthority});
 if(typeof hasCompanyRolePermissionAction!=='function'||!db?.collection)throw Error('Original role policy and database required');
 return async function apply(actor,command){
  const d=await loadDomain(),ctx=await loadContext(),rule=d.DELIVERY_RULES[command?.kind];
  if(!rule||!actor?.permissionRevision||![actor.uid,actor.tenantId,command.commandId,command.entityId].every(d.deliveryId)||command.idempotencyKey!==command.commandId)fail('Invalid delivery command identity');
  const p=d.validateDeliveryPayload(command.kind,command.payload);
  if(JSON.stringify(p).length>512000||command.baseRevision!==p.baseRevision||hash(JSON.stringify(p))!==command.payloadDigest||hash(d.canonicalDelivery(p.base))!==p.baseFingerprint||command.kind==='deliveryReport.create'&&command.entityId!==`dr_${command.commandId}_0`)fail('Delivery immutable payload/CAS mismatch');
  const path=source=>`artifacts/${appId}/public/data/${source}`,ref=(source,id)=>db.doc(path(source)+'/'+id),receiptRef=id=>db.doc('offlineDeliveryReceipts/'+hash(JSON.stringify([actor.tenantId,actor.uid,id])));
  return db.runTransaction(async tx=>{
   const {employeeId,subject,capabilities,sourceProfile}=await authority(tx,actor);
   const {company,employee}=subject;
   if(p.employeeId!==employeeId||sourceProfile==='native-isolation-v1'||![...d.DELIVERY_READ_CAPS,rule.capability].every(cap=>capabilities.includes(cap)))fail('Current delivery capability denied');
   const roleCaps=deliveryCapabilities(subject,hasCompanyRolePermissionAction),features=d.deliveryFeatures(roleCaps.filter(c=>capabilities.includes(c)));
   if(!roleCaps.includes(rule.capability)||d.canonicalDelivery(features)!==d.canonicalDelivery(p.features))fail('Original current delivery role/override denied');
   const can=action=>hasCompanyRolePermissionAction(subject,'delivery_reports',action)===true;
   const owner=report=>{if(report&&!can('view_all_delivery_reports')&&(report.empId||report.createdByEmpId)!==employeeId)fail('Delivery report outside current original employee scope');};owner(p.base.report);
   const prior=(await tx.get(receiptRef(command.commandId))).data();if(prior){if(prior.tenantId!==actor.tenantId||prior.principalId!==actor.uid||prior.kind!==command.kind||prior.entityId!==command.entityId||prior.payloadDigest!==command.payloadDigest)fail('Immutable delivery receipt reused');return prior;}
   const cache=new Map();
   const one=async(source,id)=>{if(!id)return null;if(!d.DELIVERY_CONTEXT_SOURCES.includes(source)||!d.deliveryId(id))fail('Invalid delivery source identity');const key=source+'/'+id;if(cache.has(key))return cache.get(key);const snap=await tx.get(ref(source,id));const doc=snap.exists?d.deliveryPlain(d.deliveryFeedClean({...snap.data(),id})):null;if(doc&&(source==='companies'?doc.id!==actor.tenantId:doc.companyId!==actor.tenantId))fail('Foreign delivery relation');cache.set(key,doc);return doc;};
   const related=async(name,values)=>{
    const r=ctx.DELIVERY_RELATIONS[name],found=new Map();
    for(let i=0;i<r.fields.length;i++){
     const field=r.fields[i],value=values.length===1?values[0]:values[i];if(!value)continue;
     if(field==='id'){const doc=await one(r.source,value);if(doc)found.set(doc.id,doc);continue;}
     let q=db.collection(path(r.source)).where('companyId','==',actor.tenantId).where(field,field==='sourceDispatchIds'?'array-contains':'==',value);if(r.sourceType)q=q.where('sourceType','==',r.sourceType);
     const snaps=await tx.get(q.limit(26));if(snaps.docs.length>25)fail('Delivery relation exceeds bounded original contract','delivery-unsupported-contract');
     for(const s of snaps.docs){const doc=d.deliveryPlain(d.deliveryFeedClean({...s.data(),id:s.id}));if(doc.companyId!==actor.tenantId)fail('Foreign delivery relation');found.set(doc.id,doc);cache.set(r.source+'/'+doc.id,doc);}
    }
    if(found.size>25)fail('Ambiguous/oversized delivery relations','delivery-unsupported-contract');return [...found.values()].sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
   };
   const current=await ctx.loadDeliveryContext({one,related,tenantId:actor.tenantId,employee:{id:employeeId,name:employee.name||''},id:command.entityId,dispatchId:p.values?.dispatchId||p.base.report?.dispatchId,assetId:p.values?.assetId||p.base.asset?.id||''});owner(current.report);
   const targetKeys=Object.keys(p.base.targets||{});if(targetKeys.length>40||targetKeys.some(k=>!['deliveryReports','orders','payments','expenses','assetCostLogs'].includes(k.split('/')[0])||k.split('/').length!==2||!d.deliveryId(k.split('/')[1])))fail('Invalid compound delivery target');
   for(const key of targetKeys){const [source,id]=key.split('/');current.targets[key]=await one(source,id);}
   const receipt={tenantId:actor.tenantId,principalId:actor.uid,commandId:command.commandId,idempotencyKey:command.commandId,payloadDigest:command.payloadDigest,entityId:command.entityId,kind:command.kind,outcome:'conflict'};
   const conflict=reason=>{Object.assign(receipt,{reason,current,currentFingerprint:hash(d.canonicalDelivery(current)),currentRevision:d.deliveryRevision(current.report)});tx.set(receiptRef(command.commandId),receipt);return receipt;};
   if(hash(d.canonicalDelivery(current))!==p.baseFingerprint)return conflict('delivery-compound-base-changed');
   if(p.resolvesConflictId){const previous=(await tx.get(receiptRef(p.resolvesConflictId))).data();if(!previous||previous.tenantId!==actor.tenantId||previous.principalId!==actor.uid||previous.entityId!==command.entityId||previous.outcome!=='conflict'||previous.currentFingerprint!==p.baseFingerprint)fail('Reviewed delivery conflict required');}
   if(command.kind!=='deliveryReport.archive'){
    if((!current.report||Number(p.values.actualWeight)!==current.report.actualWeightKg)&&!can('edit_actual_delivery_weight'))fail('Current actual-weight role denied');
    if((!current.report||Number(p.values.actualQuantity)!==current.report.actualQuantity)&&!can('edit_actual_delivery_quantity'))fail('Current actual-quantity role denied');
   }
   let memo=[];if(command.kind==='deliveryReport.create'&&p.values.collectedAmount>0){
    // Original memo matching searches all active company orders, not a page.
    // SQL uses bounded chunks; server caps the complete projection explicitly.
    const snaps=await tx.get(db.collection(path('orders')).where('companyId','==',actor.tenantId).limit(10001));if(snaps.docs.length>10000)fail('Order matching catalog exceeds approved bounded contract','delivery-unsupported-contract');memo=d.deliveryMemoRows(snaps.docs.map(s=>d.deliveryFeedClean({...s.data(),id:s.id})));
    if(hash(d.canonicalDelivery(memo))!==p.memoFingerprint)return conflict('delivery-payment-matching-catalog-changed');
   }else if(p.memoFingerprint!==null)fail('Unexpected delivery memo witness');
   const planned=await d.planDelivery(command.kind,current,p.values,{id:command.entityId,tenantId:actor.tenantId,employee:current.employee,editedAt:p.editedAt,mutationId:command.commandId,features,memoOrders:memo});
   if(d.canonicalDelivery(planned)!==d.canonicalDelivery(p.planned))return conflict('delivery-original-plan-changed');
   if(d.canonicalDelivery(Object.keys(planned.documents).sort())!==d.canonicalDelivery(targetKeys.sort()))fail('Compound delivery target set mismatch');
   // Use original patches/merge semantics. Never replace stored credentials or
   // unknown fields with the feed's privacy-cleaned read projection.
   for(const w of planned.writes)tx.set(ref(w.collectionName,w.documentId),w.payload,w.options||{});
   tx.set(ref('deliveryReports',command.entityId),{offlineRevision:planned.document.offlineRevision,lastDeliveryCommandId:command.commandId},{merge:true});
   Object.assign(receipt,{outcome:'accepted',document:planned.document,documents:planned.documents,fingerprint:hash(d.canonicalDelivery(planned.documents))});tx.set(receiptRef(command.commandId),receipt);return receipt;
  });
 };
}
module.exports={createOfflineDeliveryCommandService,deliveryCapabilities};
