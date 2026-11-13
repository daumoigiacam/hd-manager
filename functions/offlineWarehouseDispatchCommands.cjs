const {createOfflineCommandAuthority}=require('./offlineCommandAuthority.cjs');
// Shared dispatch handler. Main owns transport, grants, sync routing and runtime composition.
const {createHash}=require('node:crypto');
const hash=v=>createHash('sha256').update(v).digest('hex');
const fail=(m,code='permission-denied')=>{throw Object.assign(Error(m),{code});};
function createOfflineWarehouseDispatchCommandService({db,projectId,appId,environment,readAuthority,hasCompanyRolePermissionAction,now=Date.now,loadDomain=()=>import('../development/hd-manager/application/src/features/warehouse/warehouseDispatchOfflineProtocol.js')}){
 const authority=createOfflineCommandAuthority({db,projectId,appId,environment,readAuthority});
 if(typeof hasCompanyRolePermissionAction!=='function'||!db?.collection)throw Error('Original role policy and database required');
 return async function apply(actor,command){
  const d=await loadDomain(),rule=d.DISPATCH_RULES[command?.kind];
  if(!rule||!actor?.permissionRevision||![actor.uid,actor.tenantId,command.commandId,command.entityId].every(d.dispatchIdentifier)||command.idempotencyKey!==command.commandId)fail('Invalid dispatch command identity');
  const p=d.validateDispatchPayload(command.kind,command.payload);
  if(command.kind==='warehouseDispatch.create'&&command.entityId!==`wd_${actor.tenantId}_${command.commandId}`)fail('Dispatch create identity mismatch');
  d.assertLegacyDispatch(p.base,actor.tenantId,command.entityId);
  if(command.baseRevision!==p.baseRevision||hash(JSON.stringify(p))!==command.payloadDigest||hash(d.canonicalDispatch(p.base))!==p.baseFingerprint)fail('Dispatch immutable payload/CAS mismatch');
  const path=source=>`artifacts/${appId}/public/data/${source}`,ref=(source,id)=>db.doc(`${path(source)}/${id}`);
  const receiptRef=id=>db.doc('offlineWarehouseDispatchReceipts/'+hash(JSON.stringify([actor.tenantId,actor.uid,id])));
  return db.runTransaction(async tx=>{
   const {employeeId,subject,capabilities,sourceProfile}=await authority(tx,actor);
   const {company,employee}=subject;
   if(p.employeeId!==employeeId||sourceProfile==='native-isolation-v1'||!['home.read','home.dispatches.read','home.stock.read','home.debt.read','customers.read',rule.capability,...(command.kind==='warehouseDispatch.archive'?[]:[d.DISPATCH_OUTSIDE_CAP])].every(cap=>capabilities.includes(cap)))fail('Current dispatch capability denied');
   const can=action=>hasCompanyRolePermissionAction(subject,'warehouse_dispatch',action)===true;
   const actionAllowed=command.kind==='warehouseDispatch.create'?(can('create_warehouse_dispatch')||can('create_dispatch_without_order_request')):command.kind==='warehouseDispatch.archive'?true:can(rule.action);
   if(!company||company.isArchived||!employee||employee.companyId!==actor.tenantId||employee.isArchived||!can('view_warehouse_dispatch')||!actionAllowed||command.kind!=='warehouseDispatch.archive'&&!can('create_dispatch_without_order_request'))fail('Original current dispatch role action denied');
   const archiveAuthority=document=>{if(command.kind!=='warehouseDispatch.archive')return;const historical=document?.date!==d.dispatchToday(now());if(!can(historical?'delete_dispatch_history_detail':'delete_warehouse_dispatch')||historical&&!capabilities.includes(d.DISPATCH_HISTORY_CAP))fail('Original current/history archive role action and signed capability required');};
   // Replay returns before reading the current document. Its pinned original
   // base still requires the exact current/date-dependent delete authority.
   archiveAuthority(p.base);
   const prior=(await tx.get(receiptRef(command.commandId))).data();
   if(prior){if(prior.tenantId!==actor.tenantId||prior.principalId!==actor.uid||prior.kind!==command.kind||prior.entityId!==command.entityId||prior.payloadDigest!==command.payloadDigest)fail('Immutable dispatch receipt reused');return prior;}
   const recordRef=ref('warehouseDispatches',command.entityId),snap=await tx.get(recordRef);
   const current=snap.exists?d.plainDispatch({...snap.data(),id:command.entityId}):null;
   d.assertLegacyDispatch(current,actor.tenantId,command.entityId);
   if(current)archiveAuthority(current);
   const currentFingerprint=hash(d.canonicalDispatch(current));
   if(p.resolvesConflictId){const previous=(await tx.get(receiptRef(p.resolvesConflictId))).data();if(!previous||previous.tenantId!==actor.tenantId||previous.principalId!==actor.uid||previous.entityId!==command.entityId||previous.outcome!=='conflict'||previous.currentFingerprint!==p.baseFingerprint)fail('Reviewed original dispatch conflict required');}
   const receipt={tenantId:actor.tenantId,principalId:actor.uid,commandId:command.commandId,idempotencyKey:command.commandId,payloadDigest:command.payloadDigest,entityId:command.entityId,kind:command.kind,outcome:'conflict'};
   const conflict=reason=>Object.assign(receipt,{reason,current,currentFingerprint,currentRevision:d.dispatchRevision(current)});
   if(currentFingerprint!==p.baseFingerprint){conflict('dispatch-changed');tx.set(receiptRef(command.commandId),receipt);return receipt;}
   // Actual server queries inside the transaction, never a client checkpoint or
   // truncated feed. Existing-source mutations conflict with these reads. New
   // sidecar dispatches also share a per-product serialization fence.
   const productId=p.values?.productId||current?.productId;
   if(!d.dispatchIdentifier(productId))fail('Historical product identity needs reconciliation','dispatch-unsupported-contract');
   const productSnap=await tx.get(ref('products',productId)),product=productSnap.exists?{...productSnap.data(),id:productId}:null;
   if(!product||product.companyId!==actor.tenantId||product.isArchived)fail('Current product relation denied');
   const lockRef=db.doc('offlineWarehouseDispatchStockLocks/'+hash(JSON.stringify([appId,actor.tenantId,productId]))),lock=(await tx.get(lockRef)).data();
   if(lock&&(lock.tenantId!==actor.tenantId||lock.productId!==productId||!Number.isSafeInteger(lock.revision)||lock.revision<0||lock.revision>=Number.MAX_SAFE_INTEGER))fail('Invalid dispatch serialization fence');
   const rows={};for(const source of ['warehouseImports','warehouseDispatches','warehouseStockCounts','orders','deliveryReports']){
    const snapshot=await tx.get(db.collection(path(source)).where('companyId','==',actor.tenantId));
    rows[source]=snapshot.docs.map(s=>({...s.data(),id:s.id}));
   }
   if(company.warehouseStockResetAt||rows.warehouseStockCounts.some(r=>!r.isArchived&&(r.productId===productId||r.groupName&&[product.groupName,product.productGroup,product.name].includes(r.groupName))))fail('Count/reset stock needs original counted-inventory snapshot/rebase contract','dispatch-unsupported-contract');
   if(rows.orders.some(o=>d.getWarehouseDispatchIds(o).includes(command.entityId))||rows.deliveryReports.some(r=>[r.dispatchId,r.warehouseDispatchId].includes(command.entityId)))fail('Linked invoice/delivery report needs its original compound reconciliation contract','dispatch-unsupported-contract');
   const customerId=p.values?.customerId||current?.customerId;
   let customer=null,driver=null;
   if(command.kind!=='warehouseDispatch.archive'){
    const cs=await tx.get(ref('customers',customerId));customer=cs.exists?{...cs.data(),id:customerId}:null;
    if(p.values.assignedDriverId){const ds=await tx.get(ref('employees',p.values.assignedDriverId));driver=ds.exists?{...ds.data(),id:p.values.assignedDriverId}:null;}
   }
   const planned=await d.planDispatch(current,command.kind,p.values,{id:command.entityId,tenantId:actor.tenantId,employeeId:employeeId,editedAt:p.editedAt,mutationId:command.commandId,customer,product,driver});
   // Repricing or renaming after review is a conflict, not an invisible rebase.
   if(d.canonicalDispatch(planned)!==d.canonicalDispatch(p.planned)){conflict('dispatch-relations-or-pricing-changed');tx.set(receiptRef(command.commandId),receipt);return receipt;}
   const stockUnit=product.stockUnit||product.inventoryUnit||product.unit;
   if(typeof stockUnit!=='string'||!stockUnit.trim())fail('Product stock unit requires reconciliation','dispatch-unsupported-contract');
   // Original stock measures prefer totalKg, whereas the dispatch weight
   // editor writes weightKg. Never accept a higher actual-weight edit while
   // charging an unchanged legacy alias to stock, or silently rewrite it.
   if(command.kind!=='warehouseDispatch.archive'&&planned.totalKg!=null&&planned.weightKg!=null&&Number(planned.totalKg)!==Number(planned.weightKg))fail('Historical totalKg/weightKg aliases require original stock reconciliation','dispatch-unsupported-contract');
   const relevant=record=>record.productId===productId||(record.items||[]).some(i=>i.productId===productId);
   for(const r of [...rows.warehouseImports,...rows.warehouseDispatches].filter(relevant))if(r.inventoryOperationId||r.readOnlyLedger||r.sourceSystem==='hd-connect-vps')fail('Mixed ledger-backed stock requires original ledger/reversal contract','dispatch-unsupported-contract');
   for(const r of rows.warehouseDispatches.filter(r=>!r.isArchived&&r.id!==command.entityId&&relevant(r))){
    if(Array.isArray(r.items)&&r.items.length===0&&d.measureQuantity(r,stockUnit)>0||r.totalKg!=null&&r.weightKg!=null&&Number(r.totalKg)!==Number(r.weightKg))fail('Active historical dispatch stock shape/aliases require original reconciliation','dispatch-unsupported-contract');
   }
   const opening=product.stockQuantity??product.openingStock??product.inventoryQuantity??product.stock??0;
   if(!Number.isFinite(Number(opening))||Number(opening)<0)fail('Opening stock requires reconciliation','dispatch-unsupported-contract');
   const projected=[...rows.warehouseDispatches.filter(r=>r.id!==command.entityId),planned];
   if(command.kind!=='warehouseDispatch.archive'&&d.measureQuantity(planned,stockUnit)<=0)fail('Dispatch actual measures cannot debit the explicit stock unit; original conversion contract required','dispatch-unsupported-contract');
   const balance=d.productStockBalance(product,rows.warehouseImports,projected);
   if(!Number.isFinite(balance.remaining)||balance.remaining<0){conflict('inventory-insufficient-stock');tx.set(receiptRef(command.commandId),receipt);return receipt;}
   receipt.outcome='accepted';receipt.document=planned;receipt.fingerprint=hash(d.canonicalDispatch(planned));
   tx.set(lockRef,{tenantId:actor.tenantId,productId,revision:(lock?.revision||0)+1});
   tx.set(recordRef,planned);tx.set(receiptRef(command.commandId),receipt);return receipt;
  });
 };
}
function warehouseDispatchCapabilities(subject,hasCompanyRolePermissionAction){
 const role=action=>hasCompanyRolePermissionAction(subject,'warehouse_dispatch',action)===true;
 if(!role('view_warehouse_dispatch'))return [];
 return [...(role('create_warehouse_dispatch')||role('create_dispatch_without_order_request')?['warehouseDispatches.create']:[]),...(role('edit_warehouse_dispatch')?['warehouseDispatches.update']:[]),...(role('delete_warehouse_dispatch')||role('delete_dispatch_history_detail')?['warehouseDispatches.archive']:[]),...(role('create_dispatch_without_order_request')?['warehouseDispatches.createWithoutOrderRequest']:[]),...(role('delete_dispatch_history_detail')?['warehouseDispatches.archiveHistory']:[])];
}
module.exports={createOfflineWarehouseDispatchCommandService,warehouseDispatchCapabilities};
