// Development command service only. Main owns grant/HTTP/receipt routing.
const {createHash}=require('node:crypto');
const hash=value=>createHash('sha256').update(value).digest('hex');
const denied=message=>Object.assign(Error(message),{code:'permission-denied'});
function createOfflineStockCountCommandService({db,projectId,appId,hasCompanyRolePermissionAction,loadDomain=()=>import('../development/hd-manager/application/src/features/warehouse/stockCountProtocol.js')}){
  if(!/^demo-[a-z0-9-]+$/.test(projectId)||!process.env.FIRESTORE_EMULATOR_HOST)throw denied('Stock-count commands require approved Development Emulator');
  if(typeof appId!=='string'||!/^[A-Za-z0-9_-]{1,160}$/.test(appId))throw denied('Invalid stock-count App binding');
  if(typeof hasCompanyRolePermissionAction!=='function')throw denied('Original warehouse role policy is required');
  return async function apply(actor,command){
    const domain=await loadDomain(),{stockCountIdentifier:identifier,canonicalStockCount:canonical,publicStockCount:publicBody}=domain;
    const rule=domain.STOCK_COUNT_RULES[command?.kind];
    if(!rule||![actor?.uid,actor?.tenantId,command.commandId,command.entityId].every(identifier)||command.idempotencyKey!==command.commandId)throw denied('Invalid stock-count command identity');
    const payload=domain.validateStockCountPayload(command.kind,command.payload);
    if(JSON.stringify(payload).length>512000)throw Error('Stock-count payload exceeds approved command size');
    if(command.baseRevision!==payload.baseRevision||hash(JSON.stringify(payload))!==command.payloadDigest)throw Error('Stock-count command digest/revision mismatch');
    if(command.kind==='stockCount.create'&&command.entityId!==`wsc_${command.commandId}`)throw Error('Stock-count create identity mismatch');
    const ref=(source,id)=>db.doc(`artifacts/${appId}/public/data/${source}/${id}`);
    const receiptRef=id=>db.doc('offlineStockCountReceipts/'+hash(JSON.stringify([actor.tenantId,actor.uid,id])));
    return db.runTransaction(async tx=>{
      const binding=(await tx.get(db.doc('offlineHomeActors/'+actor.uid))).data();
      const access=(await tx.get(db.doc('offlineCustomerAccess/'+actor.uid))).data();
      if(!binding?.active||binding.tenantId!==actor.tenantId||!identifier(binding.employeeId)||binding.sourceArchiveSha256||
        !access?.active||access.tenantId!==actor.tenantId||access.permissionRevision!==actor.permissionRevision||access.readScope!=='tenant'||
        !['home.read','home.stock.read',rule.capability].every(cap=>access.capabilities?.includes(cap))||access.appIdentity?.homeSourceProfile==='native-isolation-v1'||payload.employeeId!==binding.employeeId)throw denied('Current stock-count binding/capability denied');
      const company=(await tx.get(ref('companies',actor.tenantId))).data(),employee=(await tx.get(ref('employees',binding.employeeId))).data();
      const subject={company:{...company,id:actor.tenantId},employee:{...employee,id:binding.employeeId},currentUser:{...employee,id:binding.employeeId}};
      if(!company||!employee||employee.companyId!==actor.tenantId||employee.isArchived||
        hasCompanyRolePermissionAction(subject,'warehouse_import','view_actual_inventory_stock')!==true||
        hasCompanyRolePermissionAction(subject,'warehouse_import',rule.action)!==true)throw denied('Original current stock-count role action denied');
      const prior=await tx.get(receiptRef(command.commandId));
      if(prior.exists){const receipt=prior.data();if(receipt.tenantId!==actor.tenantId||receipt.principalId!==actor.uid||receipt.kind!==command.kind||receipt.entityId!==command.entityId||receipt.payloadDigest!==command.payloadDigest)throw Error('Immutable stock-count receipt ID reused');return receipt;}
      const recordRef=ref('warehouseStockCounts',command.entityId),snapshot=await tx.get(recordRef);
      const live=snapshot.exists?{...snapshot.data(),id:command.entityId}:null;
      if(live&&live.companyId!==actor.tenantId)throw denied('Stock-count tenant mismatch');
      if(live)domain.assertLegacyStockCount(live);
      const current=live?publicBody(live):null,currentFingerprint=current?hash(canonical(current)):null;
      if(command.kind!=='stockCount.create'&&hash(canonical(payload.baseDocument))!==payload.baseFingerprint)throw Error('Stock-count base fingerprint mismatch');
      if(payload.resolvesConflictId){
        const conflict=(await tx.get(receiptRef(payload.resolvesConflictId))).data();
        if(!conflict||conflict.tenantId!==actor.tenantId||conflict.principalId!==actor.uid||conflict.entityId!==command.entityId||conflict.outcome!=='conflict'||conflict.currentFingerprint!==payload.baseFingerprint)throw denied('Reviewed authoritative stock-count conflict required');
      }
      const receipt={tenantId:actor.tenantId,principalId:actor.uid,commandId:command.commandId,idempotencyKey:command.commandId,payloadDigest:command.payloadDigest,entityId:command.entityId,kind:command.kind,outcome:'conflict'};
      const matches=command.kind==='stockCount.create'?!live:!!live&&currentFingerprint===payload.baseFingerprint&&domain.stockCountRevision(live)===payload.baseRevision;
      if(!matches){
        receipt.reason=live?'stock-count-changed':'stock-count-missing';
        if(current){receipt.currentDocument=current;receipt.currentFingerprint=currentFingerprint;receipt.currentRevision=domain.stockCountRevision(current);}
      }else{
        if(command.kind!=='stockCount.archive'){
          const groups=Array.isArray(company.productGroups)?company.productGroups.filter(x=>typeof x==='string').map(domain.normalizeLeadingLabel):[];
          if(!groups.includes(payload.values.groupName))throw Error('Existing company group required; group-registration side effect is unsupported');
          const oldReason=live?.reason||'';
          if(payload.values.reason!==oldReason&&payload.values.reason&&(!access.capabilities.includes(domain.STOCK_COUNT_REASON_CAPABILITY)||hasCompanyRolePermissionAction(subject,'warehouse_import','record_actual_inventory_reason')!==true))throw denied('Stock-count reason role action/capability denied');
          // Clearing an existing reason is also a reason edit.
          if(live&&payload.values.reason!==oldReason&&(!access.capabilities.includes(domain.STOCK_COUNT_REASON_CAPABILITY)||hasCompanyRolePermissionAction(subject,'warehouse_import','record_actual_inventory_reason')!==true))throw denied('Stock-count reason removal denied');
        }
        const document=domain.applyStockCountIntent(live,command.kind,payload.values,{id:command.entityId,tenantId:actor.tenantId,employeeId:binding.employeeId,editedAt:payload.editedAt});
        receipt.outcome='accepted';receipt.document=publicBody(document);receipt.fingerprint=hash(canonical(receipt.document));
        tx.set(recordRef,document);
      }
      // Receipt + single stock-count document commit together. No expenses,
      // stock ledger repricing, group registration or generic LWW writes.
      tx.set(receiptRef(command.commandId),receipt);return receipt;
    });
  };
}
module.exports={createOfflineStockCountCommandService};
