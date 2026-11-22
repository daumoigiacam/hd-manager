import {payloadFingerprint} from './customerProductAutoSync.js';
import {assertSettingsScope,canonicalSettingsValue,settingsRestorableCompanyPatch} from './settingsMutationIntegrity.js';

const own=(value,key)=>Object.prototype.hasOwnProperty.call(value,key);
const fail=(message,code='settings_data_invalid')=>{throw Object.assign(new Error(message),{code});};
const plain=value=>value!==null&&typeof value==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
const same=(a,b)=>JSON.stringify(canonicalSettingsValue(a))===JSON.stringify(canonicalSettingsValue(b));
const authority=/^(?:owner|createdBy|createdAt|uid$|userId$|employeeId$|identity|role|employeeRole|billing|subscription|plan|license|isSuper|isAdmin|isOwner)/i;
const protectedCollections=new Set(['payrollPeriods','payrollSnapshots','payrollAdjustments','payrollDebtCarryovers','payrollAutoLockPlans','payrollAutoLockPlanSnapshots','payrollSettlements','payrollPayments',
  'evaluationPeriods','automaticEvaluations','automaticEvaluationDetails','employeeEvaluationSummaries','evaluationRewards','evaluationAuditLogs']);
const isProtected=(name,row)=>protectedCollections.has(name)
  || name==='activityLogs'&&/^payroll/.test(row?.sourceType||row?.type||'')
  || name==='expenses'&&(row?.sourceType==='payroll_settlement'||['payrollSnapshotId','payrollPaymentId','payrollSettlement'].some(key=>own(row||{},key)));
const comparable=row=>Object.fromEntries(Object.entries(row).filter(([key])=>!['id','companyId','restoredAt'].includes(key)));
const items=value=>Array.isArray(value)?value:plain(value)?Object.entries(value).map(([id,row])=>({...row,id:row?.id||id})):[];
const idValid=id=>typeof id==='string'&&id.length>0&&id.length<1000&&!id.includes('/')&&id!=='.'&&id!=='..';
const revision=async row=>row===null?null:payloadFingerprint({document:canonicalSettingsValue(row)});

export function assertSettingsDataPermission(kind,context,hasPermission){
  const actions=kind==='restore'?['restore_data','backup_restore_data']:['reset_company_data','reset_selected_data_scopes'];
  if(!actions.some(action=>hasPermission(context,'settings',action)))fail('Bạn chưa được cấp quyền khôi phục/reset dữ liệu.','permission-denied');
}

export function buildSettingsRestoreOperations(backup,{companyId,collections}){
  if(!plain(backup)||!plain(backup.collections))fail('File sao lưu không đúng định dạng.');
  const companies=items(backup.collections.companies);
  if(companies.length>1)fail('File sao lưu có nhiều công ty.');
  const company=companies[0];
  const sourceCompanyId=backup.sourceCompanyId||company?.id||companyId;
  if(!idValid(sourceCompanyId))fail('Công ty nguồn chưa hợp lệ.');
  const allowedTenants=new Set([sourceCompanyId,companyId]),operations=[],seen=new Set();
  const add=operation=>{
    const key=operation.collectionName+'/'+operation.documentId;
    if(!idValid(operation.documentId)||seen.has(key))fail('Mã bản ghi bị trùng hoặc chưa hợp lệ.');
    seen.add(key);operations.push(operation);
  };
  if(company){
    if(!plain(company)||company.id&&!allowedTenants.has(company.id))fail('Công ty trong file không khớp công ty nguồn.');
    const patch=settingsRestorableCompanyPatch(company);
    const authorityValues=Object.fromEntries(Object.entries(company).filter(([key])=>authority.test(key)&&!/(?:At|Time)$/.test(key)));
    if(Object.keys(patch).length||Object.keys(authorityValues).length)add({collectionName:'companies',documentId:companyId,payload:patch,
      authorityValues:sourceCompanyId===companyId?authorityValues:{}});
  }
  for(const name of collections){
    if(!idValid(name)||name==='companies')fail('Phạm vi sao lưu chưa hợp lệ.');
    const collection=backup.collections[name];
    if(collection!==undefined&&!Array.isArray(collection)&&!plain(collection))fail('Collection sao lưu chưa hợp lệ.');
    for(const row of items(collection)){
      if(!plain(row)||!idValid(row.id))fail('Bản ghi sao lưu cần có mã ổn định.');
      for(const tenant of [row.companyId,row.sourceCompanyId,row.company?.id].filter(Boolean))if(!allowedTenants.has(tenant))fail('File chứa bản ghi của công ty khác.','settings_data_foreign');
      // The canonical representation rejects undefined/nonfinite/host objects.
      canonicalSettingsValue(row);
      add({collectionName:name,documentId:row.id,payload:{...row,id:row.id,companyId}});
    }
  }
  return operations.sort((a,b)=>(a.collectionName+'/'+a.documentId).localeCompare(b.collectionName+'/'+b.documentId));
}

export async function prepareSettingsDataCommand({kind,operations,companyId,actorId,options={},intent=null,isCurrent}){
  assertSettingsScope(isCurrent);
  if(!['restore','reset'].includes(kind)||!idValid(companyId)||!idValid(actorId)||!plain(options))fail('Phiên dữ liệu chưa hợp lệ.');
  if(Object.keys(options).some(key=>!['clientCommandId','clientMutationAt'].includes(key))||own(options,'clientCommandId')!==own(options,'clientMutationAt'))fail('Metadata lệnh dữ liệu chưa hợp lệ.');
  const commandId=own(options,'clientCommandId')?options.clientCommandId:globalThis.crypto.randomUUID(),mutationAt=own(options,'clientMutationAt')?options.clientMutationAt:new Date().toISOString();
  if(typeof commandId!=='string'||!/^[-\w]{1,160}$/.test(commandId)||typeof mutationAt!=='string'
    ||!Number.isFinite(Date.parse(mutationAt))||new Date(mutationAt).toISOString()!==mutationAt)fail('Metadata lệnh dữ liệu chưa hợp lệ.');
  const frozen=JSON.parse(JSON.stringify(operations));
  canonicalSettingsValue(frozen);
  const requestFingerprint=await payloadFingerprint({request:{kind,companyId,actorId,intent,mutationAt}});
  assertSettingsScope(isCurrent);
  const fingerprint=await payloadFingerprint({data:{kind,companyId,actorId,operations:frozen,mutationAt,requestFingerprint}});
  assertSettingsScope(isCurrent);
  return {kind,companyId,actorId,commandId,mutationAt,fingerprint,requestFingerprint,operations:frozen};
}

export async function loadSettingsResetCommand({reference,getDoc,companyId,actorId,options,intent,isCurrent}){
  if(!options.clientCommandId)return null;
  const empty=await prepareSettingsDataCommand({kind:'reset',operations:[],companyId,actorId,options,intent,isCurrent});
  const id=companyId+'_'+actorId+'_'+empty.commandId;
  const snapshot=await getDoc(reference('companyDataCommands',id));assertSettingsScope(isCurrent);
  if(!snapshot.exists())return null;
  const saved=snapshot.data();
  if(saved.companyId!==companyId||saved.actorId!==actorId||saved.kind!=='reset'||saved.requestFingerprint!==empty.requestFingerprint
    ||!Number.isSafeInteger(saved.totalChunks)||saved.totalChunks<0)fail('Mã reset đã dùng cho nội dung khác.','settings_command_conflict');
  const operations=[];
  for(let index=0;index<saved.totalChunks;index++){
    const part=await getDoc(reference('companyDataCommands',id+'__part_'+index));assertSettingsScope(isCurrent);
    if(!part.exists())return null; // No business prefix can start before every part is prepared.
    const row=part.data();
    if(row.companyId!==companyId||row.actorId!==actorId||row.fingerprint!==saved.fingerprint||!Array.isArray(row.operations))fail('Kế hoạch reset chưa hợp lệ.','settings_command_conflict');
    operations.push(...row.operations);
  }
  return operations;
}

// A durable plan precedes all business writes. Each chunk atomically checks its
// original server revisions, mutates documents, and marks itself done. Retrying
// a partial prefix never overwrites records already confirmed by that command.
export async function commitSettingsDataCommand({plan,db,reference,runTransaction,isCurrent,context,hasPermission,chunkSize=80}){
  const commandId=plan.companyId+'_'+plan.actorId+'_'+plan.commandId;
  const rootRef=reference('companyDataCommands',commandId);
  const chunks=[];
  for(let index=0;index<plan.operations.length;index+=chunkSize)chunks.push(plan.operations.slice(index,index+chunkSize));
  let confirmedChunks=0;
  const transact=callback=>runTransaction(db,async tx=>{
    assertSettingsScope(isCurrent);
    const companySnapshot=await tx.get(reference('companies',plan.companyId));assertSettingsScope(isCurrent);
    const actorSnapshot=await tx.get(reference('employees',plan.actorId));assertSettingsScope(isCurrent);
    const employee=actorSnapshot.exists()?actorSnapshot.data():null;
    if(!companySnapshot.exists()||!employee||employee.companyId!==plan.companyId||employee.isArchived===true)fail('Phiên nhân sự/công ty không hợp lệ.','permission-denied');
    assertSettingsDataPermission(plan.kind,{...context,company:companySnapshot.data(),employee:{...employee,id:plan.actorId}},hasPermission);
    const result=await callback(tx);assertSettingsScope(isCurrent);return result;
  });
  const match=root=>{
    if(root.companyId!==plan.companyId||root.actorId!==plan.actorId||root.fingerprint!==plan.fingerprint||root.kind!==plan.kind
      ||root.commandId!==plan.commandId||root.mutationAt!==plan.mutationAt||root.totalChunks!==chunks.length)fail('Mã lệnh đã dùng cho nội dung khác.','settings_command_conflict');
  };
  try{
    const root=await transact(async tx=>{
      const snapshot=await tx.get(rootRef);assertSettingsScope(isCurrent);
      if(snapshot.exists()){const saved=snapshot.data();match(saved);return saved;}
      const saved={companyId:plan.companyId,actorId:plan.actorId,kind:plan.kind,commandId:plan.commandId,
        fingerprint:plan.fingerprint,requestFingerprint:plan.requestFingerprint,mutationAt:plan.mutationAt,totalChunks:chunks.length,status:'preparing'};
      tx.set(rootRef,saved);return saved;
    });assertSettingsScope(isCurrent);
    if(root.status==='complete')return {success:true,confirmed:true,queued:false,replay:true,count:plan.operations.length};
    for(const[index,chunk]of chunks.entries()){
      const partRef=reference('companyDataCommands',commandId+'__part_'+index);
      await transact(async tx=>{
        const snapshot=await tx.get(partRef);assertSettingsScope(isCurrent);
        if(snapshot.exists())return;
        const expected=[];
        for(const op of chunk){
          const target=await tx.get(reference(op.collectionName,op.documentId));assertSettingsScope(isCurrent);
          const current=target.exists()?target.data():null;
          if(current&&op.collectionName!=='companies'&&current.companyId!==plan.companyId)fail('Mã bản ghi hiện thuộc công ty khác.','settings_data_foreign');
          if(op.collectionName==='companies')for(const[key,value]of Object.entries(op.authorityValues||{})){
            if(!own(current||{},key)||!same(current[key],value))fail('Không được khôi phục thay đổi chủ sở hữu/quyền/hóa đơn dịch vụ.','settings_data_authority');
          }
          if(op.collectionName==='companies'&&Object.entries(op.payload||{}).some(([key,value])=>key.startsWith('attendanceWifi')
            &&(!own(current||{},key)||!same(current[key],value)))
            &&!['super_admin','admin','owner','company_owner','business_owner'].includes(context.currentUser?.role)) {
            fail('Chỉ Chủ/Admin được khôi phục thay đổi WiFi công ty.','permission-denied');
          }
          const protectedRecord=isProtected(op.collectionName,current)||isProtected(op.collectionName,op.payload);
          const skip=plan.kind==='reset'&&!current||protectedRecord&&plan.kind==='restore'&&current&&same(comparable(current),comparable(op.payload));
          if(protectedRecord&&!skip)fail('Không được thay đổi dữ liệu lương đã khóa hoặc chứng từ do máy chủ quản lý.','settings_data_protected');
          expected.push({revision:await revision(current),skip:Boolean(skip)});assertSettingsScope(isCurrent);
        }
        tx.set(partRef,{companyId:plan.companyId,actorId:plan.actorId,fingerprint:plan.fingerprint,index,status:'prepared',expected,
          ...(plan.kind==='reset'?{operations:chunk}:{})});
      });assertSettingsScope(isCurrent);
    }
    await transact(async tx=>{
      const snapshot=await tx.get(rootRef);assertSettingsScope(isCurrent);const saved=snapshot.data();match(saved);
      if(saved.status!=='complete')tx.update(rootRef,{status:'prepared'});
    });assertSettingsScope(isCurrent);
    for(const[index,chunk]of chunks.entries()){
      const partRef=reference('companyDataCommands',commandId+'__part_'+index);
      await transact(async tx=>{
        const rootSnapshot=await tx.get(rootRef);assertSettingsScope(isCurrent);match(rootSnapshot.data());
        const part=await tx.get(partRef);assertSettingsScope(isCurrent);const saved=part.data();
        if(!saved||saved.fingerprint!==plan.fingerprint||saved.index!==index)fail('Kế hoạch dữ liệu chưa hợp lệ.','settings_command_conflict');
        if(saved.status==='done')return;
        const live=[];
        for(const op of chunk){const snapshot=await tx.get(reference(op.collectionName,op.documentId));assertSettingsScope(isCurrent);live.push(snapshot.exists()?snapshot.data():null);}
        for(const[i,row]of live.entries()){
          if(await revision(row)!==saved.expected[i].revision)fail('Dữ liệu đã thay đổi trong khi khôi phục/reset. Vui lòng kiểm tra lại.','settings_data_conflict');
          assertSettingsScope(isCurrent);
        }
        for(const[i,op]of chunk.entries()){
          if(saved.expected[i].skip)continue;
          const target=reference(op.collectionName,op.documentId);
          if(plan.kind==='reset'&&!op.payload)tx.delete(target);
          else tx.set(target,{...op.payload,...(op.collectionName==='companies'?{updatedAt:plan.mutationAt}:{restoredAt:plan.mutationAt})},{merge:true});
        }
        tx.update(partRef,{status:'done'});
      });assertSettingsScope(isCurrent);confirmedChunks++;
    }
    await transact(async tx=>{const snapshot=await tx.get(rootRef);assertSettingsScope(isCurrent);match(snapshot.data());tx.update(rootRef,{status:'complete'});});
    assertSettingsScope(isCurrent);
    return {success:true,confirmed:true,queued:false,replay:false,count:plan.operations.length};
  }catch(error){
    error.confirmedChunks=confirmedChunks;error.totalChunks=chunks.length;error.clientCommandId=plan.commandId;
    if(confirmedChunks)error.message+=' Đã xác nhận '+confirmedChunks+'/'+chunks.length+' phần; giữ nguyên lệnh để thử lại phần còn lại.';
    throw error;
  }
}
