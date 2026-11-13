// Shared attendance transaction; hosted only through explicit verified adapters.
const {createHash}=require('node:crypto');
const {fingerprint}=require('./offlineCustomerCommands.cjs');
const {recordManualAttendance}=require('./attendanceManual');
const KINDS=Object.freeze({'attendance.check_in':'in','attendance.check_out':'out'});
const id=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,160}$/.test(value);
const fail=(code,message)=>{throw Object.assign(Error(message),{code});};
const revision=doc=>doc?.offlineAttendanceRevision??0;
const json=value=>JSON.parse(JSON.stringify(value));
const sensitive=value=>value&&typeof value==='object'&&Object.entries(value).some(([key,item])=>/(password|token|secret|apikey|map.*key)$/i.test(key)||sensitive(item));
function merge(left,right){
  const result={...left};
  for(const [key,value]of Object.entries(right))result[key]=value&&Object.getPrototypeOf(value)===Object.prototype
    ?merge(result[key]&&typeof result[key]==='object'?result[key]:{},value):value;
  return result;
}
function validatePayload(command){
  const p=command?.payload;
  if(!Object.hasOwn(KINDS,command?.kind)||!id(command.commandId)||!id(command.entityId)||command.idempotencyKey!==command.commandId
    ||!p||Object.keys(p).some(key=>!['version','employeeId','deviceId','workDate','workRole','method','baseRevision','baseFingerprint','resolvesConflictId'].includes(key))
    ||p.version!==1||!id(p.employeeId)||!id(p.deviceId)||typeof p.workRole!=='string'||!p.workRole.trim()||p.workRole.length>160
    ||!/^\d{4}-\d{2}-\d{2}$/.test(p.workDate||'')||!Number.isFinite(Date.parse(p.workDate+'T00:00:00Z'))
    ||new Date(p.workDate+'T00:00:00Z').toISOString().slice(0,10)!==p.workDate||command.entityId!==`${p.workDate}_${p.employeeId}`
    ||!Number.isSafeInteger(p.baseRevision)||p.baseRevision<0||p.baseRevision>=Number.MAX_SAFE_INTEGER||command.baseRevision!==p.baseRevision
    ||!(p.baseFingerprint===null||/^[a-f0-9]{64}$/.test(p.baseFingerprint))
    ||(p.resolvesConflictId!==null&&!id(p.resolvesConflictId))||JSON.stringify(p).length>4096)fail('invalid-argument','Invalid self-attendance intent');
  const m=p.method,keys=m?.type==='wifi'?['type','ssid','bssid']:['type','latitude','longitude','accuracy'];
  if(!m||!['wifi','gps'].includes(m.type)||Object.keys(m).some(key=>!keys.includes(key))
    ||(m.type==='wifi'&&(typeof m.ssid!=='string'||m.ssid.length>256||typeof m.bssid!=='string'||m.bssid.length>64))
    ||(m.type==='gps'&&(![m.latitude,m.longitude].every(Number.isFinite)||Math.abs(m.latitude)>90||Math.abs(m.longitude)>180
      ||(m.accuracy!==undefined&&(!Number.isFinite(m.accuracy)||m.accuracy<0)))))fail('invalid-argument','Invalid attendance method evidence');
  if(createHash('sha256').update(JSON.stringify(p)).digest('hex')!==command.payloadDigest)fail('invalid-argument','Attendance digest mismatch');
  return p;
}

function createOfflineAttendanceCommandService({db,projectId,appId,environment,readAuthority,authorize,hasCompanyRolePermissionAction,getAttendanceContext,now=Date.now}){
  const authority=require('./offlineCommandAuthority.cjs').createOfflineCommandAuthority({db,projectId,appId,environment,readAuthority});
  if(!id(appId)||typeof db?.runTransaction!=='function'||typeof authorize!=='function'
    ||typeof hasCompanyRolePermissionAction!=='function'||typeof getAttendanceContext!=='function')fail('failed-precondition','Original attendance identity/device/role adapters required');
  const ref=(source,key)=>{if(!id(key))fail('invalid-argument','Invalid attendance relation');return db.doc(`artifacts/${appId}/public/data/${source}/${key}`);};
  const receiptRef=(actor,key)=>db.doc('offlineAttendanceReceipts/'+fingerprint([actor.tenantId,actor.uid,key]));
  return async function apply(actor,command){
    if(!id(actor?.uid)||!id(actor?.tenantId)||typeof actor.permissionRevision!=='string')fail('permission-denied','Verified attendance actor required');
    const p=validatePayload(command);
    return db.runTransaction(async tx=>{
      await authorize(tx,actor,command.kind,command);
      const {employeeId,subject,capabilities,sourceProfile}=await authority(tx,actor),{company,employee}=subject;
      if(employeeId!==p.employeeId||sourceProfile==='native-isolation-v1'||!['home.read','home.payroll.read',command.kind].every(cap=>capabilities.includes(cap)))fail('permission-denied','Current self-attendance capability denied');
      if(!company||!employee||employee.companyId!==actor.tenantId||employee.isArchived
        ||hasCompanyRolePermissionAction({company:{...company,id:actor.tenantId},employee:{...employee,id:p.employeeId},currentUser:{...employee,id:p.employeeId}},
          'company_attendance','check_in_out')!==true)fail('permission-denied','Original company_attendance/check_in_out action denied');
      // Main supplies the ORIGINAL authenticated identity/device verifier, never
      // from command JSON. Secrets stay transient and never enter a receipt.
      const context=await getAttendanceContext(tx,actor,command);
      if(context?.principalId!==actor.uid||!id(context.identityId)||context.device?.deviceId!==p.deviceId
        ||typeof context.deviceSecret!=='string'||!context.deviceSecret||typeof context.verifyDevice!=='function')fail('permission-denied','Original attendance context unavailable');
      if(!context.method||!['wifi','gps'].includes(context.method.type))fail('failed-precondition','Fresh original attendance method capture required');
      const identity=(await tx.get(db.doc('identity_accounts/'+context.identityId))).data();
      const at=now();
      if(!Number.isSafeInteger(at)||!identity||identity.status!=='active'||identity.lockedAt||identity.accountType!=='employee'
        ||identity.appUserId!==p.employeeId||identity.companyId!==actor.tenantId)fail('permission-denied','Current original identity denied');
      const savedDevice=(await tx.get(db.doc(`identity_accounts/${context.identityId}/devices/${p.deviceId}`))).data();
      if(!savedDevice||context.verifyDevice(savedDevice,context.deviceSecret,identity,at)!==true)fail('permission-denied','Original trusted-device verification denied');
      const prior=(await tx.get(receiptRef(actor,command.commandId))).data();
      if(prior){
        if(prior.kind!==command.kind||prior.entityId!==command.entityId||prior.payloadDigest!==command.payloadDigest)fail('invalid-argument','Immutable attendance idempotency key reused');
        return prior;
      }
      if(p.resolvesConflictId){
        const conflict=(await tx.get(receiptRef(actor,p.resolvesConflictId))).data();
        if(!conflict||!['conflict','rejected'].includes(conflict.outcome)||conflict.entityId!==command.entityId
          ||(conflict.outcome==='conflict'&&(conflict.currentFingerprint!==p.baseFingerprint||conflict.currentRevision!==p.baseRevision)))fail('permission-denied','Review the exact attendance receipt before retrying');
      }
      const receipt={tenantId:actor.tenantId,principalId:actor.uid,commandId:command.commandId,idempotencyKey:command.commandId,
        entityId:command.entityId,kind:command.kind,payloadDigest:command.payloadDigest,baseRevision:p.baseRevision,
        workRole:p.workRole,serverAtMs:at,outcome:'rejected'};
      const staged=[];let actualRef=null,previous=null,result;
      // Execute the UNMODIFIED original transaction body inside this SAME outer
      // transaction. Stage its attendance + audit writes until CAS has passed.
      const wrapped={async get(reference){
        const snapshot=await tx.get(reference);
        if(reference.path.startsWith(`artifacts/${appId}/public/data/attendance/`)){
          actualRef=reference;previous=snapshot.exists?json(snapshot.data()):null;
        }
        return snapshot;
      },set(reference,data,options){staged.push({reference,data,options});}};
      try{
        result=await recordManualAttendance({db:{collection:path=>db.collection(path),runTransaction:work=>work(wrapped)},
          appId,collectionPath:(app,source)=>`artifacts/${app}/public/data/${source}`,
          identity:{...identity,id:context.identityId},device:context.device,deviceSecret:context.deviceSecret,
          verifyDevice:(saved,secret)=>context.verifyDevice(saved,secret,identity,at)===true,
          // Never replay stored/offline WiFi/GPS as a live location claim.
          // The authenticated transport MUST collect this fresh using the same
          // original provider as /api/identity/attendance, or leave the intent pending.
          action:KINDS[command.kind],workRole:p.workRole,method:context.method,now:new Date(at)});
      }catch(error){
        if(error.statusCode!==403)throw Object.assign(Error('Original attendance transaction failed'),{code:'failed-precondition'});
        receipt.reason='original-attendance-validation-denied';
        // Persist only a finite public reason code, never raw exceptions or
        // device/location/identity details. Existing receipts remain immutable.
        receipt.rejectionCode=new Map([
          ['Chưa trong thời gian ca làm được phép.','outside-shift'],
          ['Kỳ lương đã khóa.','payroll-period-locked'],
          ['Chưa có chấm công vào ca hợp lệ.','check-in-required'],
          ['Không thể ghi nghỉ phép đè lên giờ chấm công.','existing-work-times'],
          ['Công việc chưa được phân công.','work-role-not-assigned'],
          ['Bạn đang ngoài vị trí được phép chấm công.','outside-location'],
          ['Chưa kết nối đúng WiFi công ty.','company-wifi-required'],
        ]).get(error.message)||'original-policy-denied';
        tx.set(receiptRef(actor,command.commandId),receipt);return receipt;
      }
      const actualId=actualRef?.path.split('/').at(-1);
      const live=previous?{...previous,id:actualId}:null;
      if(sensitive(live)){
        receipt.reason='unsupported-sensitive-legacy-shape';tx.set(receiptRef(actor,command.commandId),receipt);return receipt;
      }
      if(actualId!==command.entityId){receipt.outcome='conflict';receipt.reason='server-work-date-changed';receipt.serverWorkDate=result.workDate;}
      else if((live?fingerprint(live):null)!==p.baseFingerprint||revision(live)!==p.baseRevision){
        receipt.outcome='conflict';receipt.reason='attendance-changed';receipt.currentDocument=live;
        receipt.currentFingerprint=live?fingerprint(live):null;receipt.currentRevision=revision(live);
      }else{
        if(live&&(!Number.isSafeInteger(revision(live))||revision(live)<0||revision(live)>=Number.MAX_SAFE_INTEGER))fail('failed-precondition','Attendance revision invalid');
        let document=previous||{};
        for(const write of staged)if(write.reference.path===actualRef.path)document=write.options?.merge?merge(document,write.data):write.data;
        if(!result.duplicate){
          for(const write of staged)tx.set(write.reference,write.data,write.options);
          const next=revision(live)+1;tx.set(actualRef,{offlineAttendanceRevision:next},{merge:true});document={...document,offlineAttendanceRevision:next};
        }
        receipt.outcome='accepted';receipt.duplicate=result.duplicate;receipt.workDate=result.workDate;
        receipt.document=json({...document,id:actualId});receipt.fingerprint=fingerprint(receipt.document);
      }
      // No restoration, LWW replacement, historical time, proxy or approval path.
      // Original audit record and attendance patch commit atomically with receipt.
      tx.set(receiptRef(actor,command.commandId),receipt);return receipt;
    });
  };
}
module.exports={createOfflineAttendanceCommandService};
