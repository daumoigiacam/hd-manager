// Development-only sidecar. Main owns HTTP/grants/bootstrap/receipt dispatch.
const {createHash}=require('node:crypto');
const hash=value=>createHash('sha256').update(value).digest('hex');
const deny=message=>{throw Object.assign(Error(message),{code:'permission-denied'});};
function createOfflineWarehouseImportCommandService({db,projectId,appId,hasCompanyRolePermissionAction,loadDomain=()=>import('../development/hd-manager/application/src/features/warehouse/warehouseImportProtocol.js')}){
  if(!/^demo-[a-z0-9-]+$/.test(projectId||'')||!/^(127\.0\.0\.1|localhost):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||'')||(db?.projectId&&db.projectId!==projectId))deny('Warehouse import requires Development Emulator');
  if(!/^[A-Za-z0-9_-]{1,160}$/.test(appId||'')||typeof db?.runTransaction!=='function'||typeof hasCompanyRolePermissionAction!=='function')throw Error('Original role policy and database required');
  return async function apply(actor,command){
    const d=await loadDomain(),rule=d.IMPORT_RULES[command?.kind];
    if(!rule||typeof actor?.permissionRevision!=='string'||!actor.permissionRevision||![actor?.uid,actor?.tenantId,command.commandId,command.entityId].every(d.importIdentifier)||command.entityId.length>120||command.idempotencyKey!==command.commandId)deny('Invalid import command identity');
    const p=d.validateImportPayload(command.kind,command.payload);
    d.assertImportPair(p.base,actor.tenantId,command.entityId);
    if(command.baseRevision!==p.baseRevision||hash(JSON.stringify(p))!==command.payloadDigest||hash(d.canonicalImport(p.base))!==p.baseFingerprint)throw Error('Import digest/CAS mismatch');
    if(command.kind==='warehouseImport.create'&&command.entityId!==`wi_${command.commandId}`)throw Error('Import create identity mismatch');
    const ref=(source,id)=>db.doc(`artifacts/${appId}/public/data/${source}/${id}`),receiptRef=id=>db.doc('offlineWarehouseImportReceipts/'+hash(JSON.stringify([actor.tenantId,actor.uid,id])));
    return db.runTransaction(async tx=>{
      const binding=(await tx.get(db.doc('offlineHomeActors/'+actor.uid))).data(),access=(await tx.get(db.doc('offlineCustomerAccess/'+actor.uid))).data();
      if(!binding?.active||binding.tenantId!==actor.tenantId||binding.sourceArchiveSha256||!d.importIdentifier(binding.employeeId)||p.employeeId!==binding.employeeId||!access?.active||access.tenantId!==actor.tenantId||access.permissionRevision!==actor.permissionRevision||access.readScope!=='tenant'||access.appIdentity?.homeSourceProfile==='native-isolation-v1'||!['home.read','home.imports.read','home.cashflow.read',rule.capability].every(cap=>access.capabilities?.includes(cap)))deny('Current import binding/capability denied');
      const company=(await tx.get(ref('companies',actor.tenantId))).data(),employee=(await tx.get(ref('employees',binding.employeeId))).data();
      const subject={company:{...company,id:actor.tenantId},employee:{...employee,id:binding.employeeId},currentUser:{...employee,id:binding.employeeId}};
      if(!company||company.isArchived||!employee||employee.companyId!==actor.tenantId||employee.isArchived||hasCompanyRolePermissionAction(subject,'warehouse_import','view_warehouse_import')!==true||hasCompanyRolePermissionAction(subject,'warehouse_import',rule.action)!==true)deny('Original current warehouse import role denied');
      // Authorization is re-read even for exact immutable receipt replay.
      const prior=(await tx.get(receiptRef(command.commandId))).data();
      if(prior){if(prior.tenantId!==actor.tenantId||prior.principalId!==actor.uid||prior.kind!==command.kind||prior.entityId!==command.entityId||prior.payloadDigest!==command.payloadDigest)throw Error('Immutable import receipt ID reused');return prior;}
      const documentRef=ref('warehouseImports',command.entityId),expenseRef=ref('expenses',`exp_warehouse_import_${command.entityId}`);
      const documentSnap=await tx.get(documentRef),expenseSnap=await tx.get(expenseRef);
      const current={document:documentSnap.exists?d.plainImport({...documentSnap.data(),id:command.entityId}):null,expense:expenseSnap.exists?d.plainImport({...expenseSnap.data(),id:`exp_warehouse_import_${command.entityId}`}):null};
      d.assertImportPair(current,actor.tenantId,command.entityId);
      const currentFingerprint=hash(d.canonicalImport(current));
      if(p.resolvesConflictId){const conflict=(await tx.get(receiptRef(p.resolvesConflictId))).data();if(!conflict||conflict.outcome!=='conflict'||conflict.entityId!==command.entityId||conflict.currentFingerprint!==p.baseFingerprint)deny('Reviewed original import/expense conflict required');}
      const receipt={tenantId:actor.tenantId,principalId:actor.uid,commandId:command.commandId,idempotencyKey:command.commandId,payloadDigest:command.payloadDigest,entityId:command.entityId,kind:command.kind,outcome:'conflict'};
      if(currentFingerprint!==p.baseFingerprint){receipt.reason='import-or-expense-changed';receipt.current=current;receipt.currentFingerprint=currentFingerprint;receipt.currentRevision=d.importRevision(current.document);}
      else{
        if(command.kind!=='warehouseImport.archive'){
          const groups=(Array.isArray(company.productGroups)?company.productGroups:[]).filter(x=>typeof x==='string').map(d.normalizeLeadingLabel);
          if(!groups.includes(p.values.groupName))throw Error('Existing group required; group registration is unsupported');
          for(const [source,id]of [['products',p.values.productId],['customers',p.values.supplierCustomerId]])if(id){const linked=(await tx.get(ref(source,id))).data();if(!linked||linked.companyId!==actor.tenantId||linked.isArchived)deny('Import product/supplier relation denied');}
        }
        const planned=d.applyImportIntent(current,command.kind,p.values,{id:command.entityId,tenantId:actor.tenantId,employeeId:binding.employeeId,editedAt:p.editedAt,mutationId:command.commandId});
        receipt.outcome='accepted';receipt.document=planned.pair.document;receipt.expense=planned.pair.expense;receipt.expenseWritten=planned.expenseWritten;receipt.fingerprint=hash(d.canonicalImport(planned.pair));
        // Both business documents and the immutable receipt commit atomically.
        tx.set(documentRef,receipt.document);if(planned.expenseWritten)tx.set(expenseRef,receipt.expense);
      }
      tx.set(receiptRef(command.commandId),receipt);return receipt;
    });
  };
}
module.exports={createOfflineWarehouseImportCommandService};
