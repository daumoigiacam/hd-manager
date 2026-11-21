import {payloadFingerprint} from './customerProductAutoSync.js';

const own=(value,key)=>Object.hasOwn(value,key);
const record=value=>value!==null&&typeof value==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
const idValid=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,200}$/.test(value);
const fail=(message,code='asset/invalid')=>{throw Object.assign(new Error(message),{code});};
export const assetConflict=()=>fail('Tài sản hoặc phiếu chi đã thay đổi. Vui lòng mở lại dữ liệu trước khi lưu.','asset/conflict');
export const assetFingerprint=value=>payloadFingerprint({value});
const ephemeral=new Set(['__pendingFirebaseSync','__localWriteAt','__syncState']);
const canonical=value=>{
  if(value===undefined)return null;
  if(value instanceof Date)return value.toISOString();
  if(value&&typeof value.toDate==='function')return value.toDate().toISOString();
  if(Array.isArray(value))return value.map(canonical);
  if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).filter(key=>!ephemeral.has(key)).sort().map(key=>[key,canonical(value[key])]));
  return value;
};
export async function assetDocumentRevision(value) {
  return {exists:!!value,fingerprint:value?await assetFingerprint(canonical(value)):''};
}
const exact=(value,keys)=>record(value)&&Reflect.ownKeys(value).length===keys.length&&keys.every(key=>{
  const descriptor=Object.getOwnPropertyDescriptor(value,key);
  return descriptor?.enumerable&&own(descriptor,'value');
});
export const isAssetCommand=value=>exact(value,['id','fingerprint'])&&idValid(value.id)&&typeof value.fingerprint==='string'&&/^[a-f0-9]{64}$/.test(value.fingerprint);
export const isAssetDocumentRevision=value=>exact(value,['exists','fingerprint'])&&typeof value.exists==='boolean'
  &&typeof value.fingerprint==='string'&&(value.exists?/^[a-f0-9]{64}$/.test(value.fingerprint):value.fingerprint==='');
const equal=(left,right)=>JSON.stringify(canonical(left))===JSON.stringify(canonical(right));
const markerMatches=(value,command)=>isAssetCommand(value)&&value.id===command.id&&value.fingerprint===command.fingerprint;

export function parseAssetNumber(value,{positive=false,money=false}={}) {
  if(value===undefined||value===null||value==='')value=0;
  if(typeof value==='string') {
    let text=value.trim();
    if(!text)text='0';
    if(!/^\d+(?:[.,]\d+)*$/.test(text))fail('Số tiền, số lượng và số km phải là số hữu hạn, không âm.');
    if(money&&/^\d{1,3}(?:[.,]\d{3})+$/.test(text))text=text.replace(/[.,]/g,'');
    else if(!/^\d+(?:[.,]\d+)?$/.test(text))fail('Định dạng số không hợp lệ.');
    value=Number(text.replace(',','.'));
  }
  if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>Number.MAX_SAFE_INTEGER||(positive&&value<=0)) {
    fail(positive?'Số tiền phải là số hữu hạn lớn hơn 0.':'Số lượng và số km phải là số hữu hạn, không âm.');
  }
  const parsed=money?Math.round(value):value;
  if(positive&&parsed<=0)fail('Số tiền phải lớn hơn 0 sau khi làm tròn.');
  return parsed;
}
export function assertAssetMutationAccess({firebaseUser,companyId,currentCompany,currentUser,employee,hasPermission,isCurrent},action,deliveryAction='') {
  if(!firebaseUser||!idValid(companyId)||!currentUser?.id||!isCurrent
    ||(currentCompany?.id&&currentCompany.id!==companyId))fail('Phiên công ty đã thay đổi. Vui lòng mở lại mục Tài sản.','asset/scope');
  if(!hasPermission({company:currentCompany,employee,currentUser},deliveryAction?'delivery_reports':'asset_management',deliveryAction||action)) {
    fail('Bạn chưa được cấp quyền thực hiện thao tác tài sản này.','asset/permission-denied');
  }
}
export function requireAssetRecord(rows,id,companyId,label='Tài sản',{archived=false}={}) {
  const row=rows.find(item=>item?.id===id&&item.companyId===companyId);
  if(!idValid(id)||!row||(!archived&&row.isArchived))fail(`${label} không tồn tại hoặc không thuộc công ty hiện tại.`);
  return row;
}
const commandFields=new Set(['clientMutationId','clientCommandId','clientMutationAt','expectedAssetUpdatedAt']);
const cleanInput=input=>Object.fromEntries(Object.entries(input).filter(([key])=>!commandFields.has(key)&&!ephemeral.has(key)));
const nowFor=(input,now)=>{
  const value=input.clientMutationAt||now;
  if(typeof value!=='string'||!Number.isFinite(Date.parse(value)))fail('Thời điểm thao tác tài sản không hợp lệ.');
  return value;
};
const assertInput=(input,companyId,id)=>{
  if(!record(input)||(own(input,'companyId')&&input.companyId!==companyId)||(own(input,'id')&&input.id!==id))fail('Thông tin tài sản không đúng công ty hoặc mã chứng từ.');
  for(const key of ['clientMutationId','clientCommandId'])if(own(input,key)&&!idValid(input[key]))fail('Mã thao tác tài sản không hợp lệ.');
};
const protectedAsset=['createdAt','createdByEmpId','handoverHistory','lastAssetCommand','isArchived','archivedAt','archivedByEmpId'];
const numberFields=['fuelNorm','tankCapacity','maintenanceIntervalKm','lastMaintenanceKm','nextMaintenanceKm','currentKm','handoverKm'];
const assignmentFields=['assignedDriverId','driverId','deliveryDriverId','driverEmployeeId','assignedEmployeeId','employeeId','managerId','responsibleEmployeeId','assignedDriverIds','driverIds','assignedEmployeeIds'];
const assertExpectedAssetUpdatedAt=(current,input)=>{
  if(!own(input,'expectedAssetUpdatedAt'))return;
  const expected=input.expectedAssetUpdatedAt;
  if(expected!==null&&typeof expected!=='string'&&!(typeof expected==='number'&&Number.isFinite(expected)))fail('Bản chụp thời điểm tài sản phải là giá trị đơn hợp lệ.');
  const actual=current&&own(current,'updatedAt')?current.updatedAt:'';
  if(!Object.is(expected,actual)&&(!input.clientCommandId||current?.lastAssetCommand?.id!==input.clientCommandId))assetConflict();
};

async function decorate(kind,id,input,writes,business,companyId,actorId) {
  const fingerprint=await assetFingerprint(canonical({kind,id,companyId,actorId,business}));
  const existing=writes.map(write=>write.base?.lastAssetCommand).find(value=>isAssetCommand(value)&&value.fingerprint===fingerprint);
  const command={id:input.clientCommandId||existing?.id||`asset_${await assetFingerprint({fingerprint,base:writes.map(write=>write.expectedAssetDocument)})}`,fingerprint};
  const key=`asset_${command.id}`;
  return {id,key,writes:writes.map(({base:_base,...write})=>({...write,assetCommand:command,payload:{...write.payload,lastAssetCommand:command}}))};
}
const guarded=async(collectionName,id,payload,base)=>({collectionName,documentId:id,payload,options:{merge:true},base,
  expectedAssetDocument:await assetDocumentRevision(base)});

export async function prepareAssetMutation({kind,id,input={},assets,companyId,actorId,now,assignmentIds,canManageHandover=false}) {
  if(kind==='create') {
    if(!idValid(input.clientMutationId))fail('Thiếu mã tạo tài sản ổn định. Vui lòng mở lại biểu mẫu.');
    id=`asset_${input.clientMutationId}`;
  }
  if(!idValid(id))fail('Mã tài sản không hợp lệ.');
  assertInput(input,companyId,id);
  const current=kind==='create'?assets.find(asset=>asset.id===id)||null:requireAssetRecord(assets,id,companyId,'Tài sản',{archived:true});
  if(current&&current.companyId!==companyId)fail('Mã tài sản thuộc công ty khác.');
  assertExpectedAssetUpdatedAt(current,input);
  const stamp=nowFor(input,now),patch=cleanInput(input);
  for(const field of protectedAsset)if(own(patch,field)) {
    if(!equal(patch[field],current?.[field]))fail('Không được thay đổi lịch sử hoặc trạng thái tài sản qua biểu mẫu sửa.');
    delete patch[field];
  }
  delete patch.id;delete patch.companyId;
  if(kind==='delete') {
    const payload={id,companyId,isArchived:true,archivedAt:stamp,archivedByEmpId:actorId,updatedAt:stamp,updatedByEmpId:actorId};
    return decorate(kind,id,input,[await guarded('assets',id,payload,current)],{},companyId,actorId);
  }
  const merged={...current,...patch};
  if(!`${merged.name||''}`.trim())fail('Vui lòng nhập tên tài sản.');
  for(const field of numberFields)if(kind==='create'||own(patch,field))patch[field]=parseAssetNumber(merged[field]);
  if(kind==='create'||assignmentFields.some(field=>own(patch,field))) {
    const selected=assignmentIds(kind==='create'?patch:Object.fromEntries(assignmentFields.filter(field=>own(patch,field)).map(field=>[field,patch[field]])));
    Object.assign(patch,{assignedDriverId:selected[0]||'',driverId:selected[0]||'',assignedDriverIds:selected,driverIds:selected});
    for(const field of assignmentFields)if(current&&own(current,field)&&!own(patch,field))patch[field]=Array.isArray(current[field])?selected:selected[0]||'';
  }
  const effective={...current,...patch};
  const assignmentChanged=!equal(assignmentIds(effective),assignmentIds(current||{}));
  const handoverFieldsChanged=['handoverDate','handoverKm','handoverCondition','handoverNote','handoverImageUrl'].some(field=>own(patch,field)
    &&(field==='handoverKm'?parseAssetNumber(patch[field])!==parseAssetNumber(current?.[field]):`${patch[field]||''}`!==`${current?.[field]||''}`));
  if((assignmentChanged||handoverFieldsChanged)&&!canManageHandover)fail('Bạn chưa được cấp quyền bàn giao tài sản.','asset/permission-denied');
  const handoverChanged=effective.handoverDate&&['handoverDate','handoverKm','handoverCondition','handoverNote','handoverImageUrl',...assignmentFields]
    .some(field=>own(patch,field)&&!equal(patch[field],current?.[field]));
  if(handoverChanged)patch.handoverHistory=[{id:`handover_${input.clientCommandId||input.clientMutationId||await assetFingerprint({id,patch})}`,
    driverId:effective.assignedDriverId||'',driverIds:assignmentIds(effective),assignedDriverIds:assignmentIds(effective),
    date:effective.handoverDate,km:parseAssetNumber(effective.handoverKm),condition:effective.handoverCondition||'',note:effective.handoverNote||'',
    imageUrl:effective.handoverImageUrl||'',createdAt:stamp,createdByEmpId:actorId},...(current?.handoverHistory||[])];
  const payload={...patch,id,companyId,updatedAt:stamp,updatedByEmpId:actorId,
    ...(kind==='create'?{createdAt:stamp,createdByEmpId:actorId,isArchived:false,status:patch.status||'active',handoverHistory:patch.handoverHistory||[]}:{} )};
  return decorate(kind,id,input,[await guarded('assets',id,payload,kind==='create'?null:current)],cleanInput(input),companyId,actorId);
}

export const isDeliveryAssetCost=row=>!!(row?.relatedDeliveryReportId||row?.sourceDeliveryReportId||`${row?.sourceType||''}`.toLowerCase().includes('delivery'));
const reverseKeys=['assetCostLogId','relatedAssetCostLogId','sourceAssetCostLogId'];
export function requireAssetExpense(log,expenses,companyId,{allowArchived=false}={}) {
  const links=[log.expenseId,log.relatedExpenseId].filter(Boolean);
  const matches=expenses.filter(expense=>links.includes(expense.id)||reverseKeys.some(key=>expense[key]===log.id));
  if(matches.length!==1)fail('Không tìm thấy duy nhất phiếu chi liên kết. Vui lòng đối soát tại Thu chi.');
  const expense=matches[0];
  if(expense.companyId!==companyId||(!allowArchived&&expense.isArchived)||!reverseKeys.some(key=>expense[key]===log.id)
    ||(links.length&&!links.includes(expense.id))||expense.assetId!==log.assetId)fail('Phiếu chi không đúng liên kết tài sản hoặc đã bị xóa.');
  return expense;
}
const financeFields=['approvalStatus','requiresApproval','handoverStatus','approvedAt','approvedByEmpId','rejectedAt','rejectedByEmpId','rejectionReason'];
const costProtected=['createdAt','createdByEmpId','empId','expenseId','relatedExpenseId','sourceType','sourceLabel','relatedDeliveryReportId','sourceDeliveryReportId','lastAssetCommand','lastDeliveryCommand','isArchived','archivedAt','archivedByEmpId',...financeFields];

export async function prepareAssetCostMutation({kind,id,input={},assets,logs,expenses,companyId,actorId,now,assetLabel,costLabel,deliveryPlan=null,canUploadImages=false}) {
  if(kind==='create') {
    if(!idValid(input.clientMutationId))fail('Thiếu mã tạo chi phí ổn định. Vui lòng mở lại biểu mẫu.');
    id=input.clientMutationId;
  }
  if(!idValid(id))fail('Mã nhật ký chi phí không hợp lệ.');
  assertInput(input,companyId,id);
  const current=kind==='create'?logs.find(log=>log.id===id)||null:requireAssetRecord(logs,id,companyId,'Nhật ký chi phí',{archived:true});
  if(current&&current.companyId!==companyId)fail('Nhật ký thuộc công ty khác.');
  assertExpectedAssetUpdatedAt(current,input);
  const delivery=isDeliveryAssetCost(current)||isDeliveryAssetCost(input);
  if(delivery&&!deliveryPlan)fail('Chi phí giao hàng phải được sửa hoặc xóa từ báo cáo giao hàng.','asset/delivery-owned');
  if(deliveryPlan&&(!Array.isArray(deliveryPlan)||!delivery))fail('Nhật ký giao hàng phải thuộc lệnh lưu báo cáo.');
  const stamp=nowFor(input,now),patch=cleanInput(input);
  if(['receiptImageUrl','odometerImageUrl'].some(field=>own(patch,field)&&`${patch[field]||''}`!==`${current?.[field]||''}`)&&!canUploadImages) {
    fail('Bạn chưa được cấp quyền thay đổi ảnh hóa đơn hoặc đồng hồ km.','asset/permission-denied');
  }
  if(!deliveryPlan)for(const field of costProtected)if(own(patch,field)) {
    if(!equal(patch[field],current?.[field]))fail('Không được thay đổi liên kết hoặc trạng thái phiếu chi qua biểu mẫu chi phí.');
    delete patch[field];
  }
  delete patch.id;delete patch.companyId;
  const merged={...current,...patch};
  const asset=requireAssetRecord(assets,merged.assetId,companyId);
  let expense;
  if(deliveryPlan) {
    const expenseId=input.expenseId||current?.expenseId;
    const stored=expenses.find(row=>row.id===expenseId&&row.companyId===companyId);
    const planned=deliveryPlan.find(write=>write.collectionName==='expenses'&&write.documentId===expenseId)?.payload;
    expense=planned?{...stored,...planned}:stored;
    if(!expense||expense.companyId!==companyId||!expenseId||!merged.relatedDeliveryReportId
      ||(expense.relatedDeliveryReportId||expense.sourceDeliveryReportId)!==merged.relatedDeliveryReportId)fail('Phiếu chi giao hàng không đúng báo cáo liên kết.');
  } else if(kind!=='create')expense=requireAssetExpense(current,expenses,companyId,{allowArchived:kind==='delete'});
  const expenseId=deliveryPlan?(input.expenseId||current?.expenseId):kind==='create'?`exp_asset_cost_${id}`:expense.id;
  const deleting=kind==='delete'||(deliveryPlan&&input.isArchived===true);
  let fields;
  if(deleting)fields={isArchived:true,archivedAt:stamp,archivedByEmpId:actorId};
  else {
    fields={...patch,...(kind==='create'?{date:patch.date||stamp.slice(0,10),type:patch.type||'fuel'}:{})};
    for(const field of ['kmAt','liters'])if(kind==='create'||own(patch,field))fields[field]=parseAssetNumber(merged[field]);
    if(kind==='create'||own(patch,'unitPrice'))fields.unitPrice=parseAssetNumber(merged.unitPrice,{money:true});
    const explicit=own(input,'amount')&&input.amount!==''&&input.amount!==null&&input.amount!==undefined;
    const amount=explicit?parseAssetNumber(input.amount,{money:true,positive:true})
      :own(input,'amount')||kind==='create'?parseAssetNumber(parseAssetNumber(merged.liters)*parseAssetNumber(merged.unitPrice,{money:true})
        ||parseAssetNumber(merged.totalAmount,{money:true}),{money:true,positive:true}):parseAssetNumber(expense?.amount??current.amount,{money:true,positive:true});
    const category=own(patch,'category')&&patch.category?costLabel(patch.category)
      :own(patch,'type')||own(patch,'costType')||kind==='create'?costLabel(merged.type==='fuel'?'fuel':merged.costType||merged.type||'other')
        :expense?.category||current.category||costLabel(merged.type||'other');
    Object.assign(fields,{amount,category,assetId:asset.id,assetName:assetLabel(asset),
      assetPlate:asset.plateNumber||asset.licensePlate||asset.plate||''});
  }
  const logPayload={...fields,id,companyId,updatedAt:stamp,updatedByEmpId:actorId,
    ...(kind==='create'?{expenseId,empId:actorId,createdByEmpId:actorId,createdAt:stamp,isArchived:false}:{} )};
  if(deliveryPlan)return {id,writes:[{collectionName:'assetCostLogs',documentId:id,payload:logPayload,options:{merge:true}}]};
  const expensePayload={id:expenseId,companyId,updatedAt:stamp,updatedByEmpId:actorId,
    ...(deleting?{isArchived:true,archivedAt:stamp,archivedByEmpId:actorId}:{amount:fields.amount,category:fields.category,
      date:own(patch,'date')?patch.date:expense?.date||current?.date||stamp.slice(0,10),
      note:own(patch,'note')?patch.note:expense?.note||'',assetId:asset.id,assetName:fields.assetName,assetPlate:fields.assetPlate,
      driverId:own(patch,'driverId')?patch.driverId:current?.driverId||'',assetCostLogId:id,relatedAssetCostLogId:id}),
    ...(kind==='create'?{type:'expense',sourceType:'asset_cost_log',sourceLabel:'Chi phí tài sản',requiresApproval:false,
      approvalStatus:'approved',handoverStatus:'confirmed',isArchived:false,createdAt:stamp,createdByEmpId:actorId,empId:actorId}:{} )};
  const business=kind==='delete'?{}:cleanInput(input);
  return decorate(`cost_${kind}`,id,input,[await guarded('assetCostLogs',id,logPayload,kind==='create'?null:current),
    await guarded('expenses',expenseId,expensePayload,kind==='create'?null:expense)],business,companyId,actorId);
}

export function validateAssetAtomicWrites(writes,companyId) {
  const command=writes[0]?.assetCommand;
  if(!isAssetCommand(command)||!companyId||![1,2].includes(writes.length))fail('Invalid asset command metadata');
  const collections=writes.map(write=>write.collectionName).sort().join(',');
  if(collections!=='assets'&&collections!=='assetCostLogs,expenses')fail('Asset command must include its linked expense');
  for(const write of writes) {
    if(!record(write)||!idValid(write.documentId)||!markerMatches(write.assetCommand,command)
      ||!isAssetDocumentRevision(write.expectedAssetDocument)||write.payload?.companyId!==companyId
      ||write.payload.id!==write.documentId||!markerMatches(write.payload.lastAssetCommand,command)||write.options?.merge!==true
      ||Object.keys(write).some(key=>!['collectionName','documentId','payload','options','assetCommand','expectedAssetDocument'].includes(key)))fail('Invalid asset guard or command metadata');
  }
}

export async function commitAssetAtomicWrites({writes,companyId,transaction,reference}) {
  validateAssetAtomicWrites(writes,companyId);
  return transaction(async tx=>{
    const existing=await Promise.all(writes.map(write=>tx.get(reference(write))));
    const live=existing.map((snapshot,index)=>snapshot.exists()?{...snapshot.data(),id:writes[index].documentId}:null);
    const command=writes[0].assetCommand;
    for(const row of live)if(row) {
      if(row.companyId!==companyId)assetConflict();
      if(own(row,'lastAssetCommand')&&(!isAssetCommand(row.lastAssetCommand)
        ||(row.lastAssetCommand.id===command.id&&!markerMatches(row.lastAssetCommand,command))))assetConflict();
    }
    if(live.every(row=>row&&markerMatches(row.lastAssetCommand,command)))return {existingDocuments:writes.map((write,index)=>({...write,payload:live[index]}))};
    for(const[index,write]of writes.entries())if(!equal(await assetDocumentRevision(live[index]),write.expectedAssetDocument))assetConflict();
    if(writes[0].collectionName==='assets') {
      if(live[0]?.isArchived&&writes[0].payload.isArchived!==true)assetConflict();
    }else{
      const logIndex=writes.findIndex(write=>write.collectionName==='assetCostLogs'),expenseIndex=1-logIndex;
      const log=live[logIndex],expense=live[expenseIndex],logWrite=writes[logIndex],expenseWrite=writes[expenseIndex];
      const nextLog={...log,...logWrite.payload},nextExpense={...expense,...expenseWrite.payload};
      if(isDeliveryAssetCost(log)||isDeliveryAssetCost(nextLog)||isDeliveryAssetCost(expense))fail('Delivery owns this cost.','asset/delivery-owned');
      if(log)requireAssetExpense(log,[expense].filter(Boolean),companyId);
      if(log?.isArchived||expense?.isArchived||nextLog.expenseId!==expenseWrite.documentId
        ||!reverseKeys.some(key=>nextExpense[key]===logWrite.documentId)||nextLog.assetId!==nextExpense.assetId
        ||Boolean(nextLog.isArchived)!==Boolean(nextExpense.isArchived))assetConflict();
      if(expense&&financeFields.some(field=>own(expenseWrite.payload,field)))fail('Asset edits cannot rewrite finance approval metadata');
      const assetSnapshot=await tx.get(reference({collectionName:'assets',documentId:nextLog.assetId}));
      const asset=assetSnapshot.exists()?assetSnapshot.data():null;
      if(!asset||asset.companyId!==companyId||asset.isArchived)fail('Tài sản liên kết không còn hoạt động trong công ty.');
    }
    for(const write of writes)tx.set(reference(write),write.payload,write.options);
    return {existingDocuments:[]};
  });
}
