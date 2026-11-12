import{createOfflineCommandRepository}from'./offlineCommandRepository.js';
import{canonicalAttendance as canonical}from'./offlineAttendanceRepository.js';
import{employeeProfileActions,employeeProfileFields,profileInput,newProfile,assertEditableEmployee}from'../features/hr/employeeProfileProtocol.js';
const fail=message=>{throw Error(message);};const id=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,160}$/.test(x);
export async function createOfflineEmployeeProfileRepository(options){
 const{database,session,projectId,employeeId,authorize,digest}=options,scope=Object.freeze({...session.scope}),keys=[scope.tenantId,scope.principalId];
 if(options.development!==true||!/^demo-[a-z0-9-]+$/.test(projectId)||!id(employeeId))fail('Cần Runtime nhân sự Local đã xác thực.');
 async function access(kind='home.read'){
  if(!session.isCurrent(scope))fail('Phiên nhân sự đã đổi.');const grant=await authorize({scope,kind});
  if(!session.isCurrent(scope)||!grant||grant.projectId!==projectId||Object.entries(scope).some(([k,v])=>grant[k]!==v)||Date.now()>=grant.expiresAtMs||grant.appSession?.user?.id!==employeeId||grant.appSession?.user?.companyId!==scope.tenantId||!['home.read','home.payroll.read',...(kind==='home.read'?[]:[kind])].every(cap=>grant.capabilities.includes(cap)))fail('Thiếu quyền hồ sơ có chữ ký còn hiệu lực.');return grant;
 }
 const tx=work=>database.transaction(async db=>{await access();const value=await work(db);await access();return value;});
 await tx(db=>db.run('CREATE TABLE IF NOT EXISTS offline_employee_profile_v1 (tenant_id TEXT NOT NULL,principal_id TEXT NOT NULL,id TEXT NOT NULL,command_id TEXT NOT NULL,intent_json TEXT NOT NULL,server_json TEXT,receipt_json TEXT,PRIMARY KEY(tenant_id,principal_id,id))'));
 const own=(db,key)=>db.query('SELECT o.*,c.state,c.kind FROM offline_employee_profile_v1 o JOIN local_commands c USING(tenant_id,principal_id,command_id) WHERE o.tenant_id=? AND o.principal_id=? AND o.id=?',[...keys,key]).then(r=>r[0]);
 async function base(db,key){
  const overlay=await own(db,key);if(overlay&&overlay.state!=='SYNCED')fail('Hồ sơ đang chờ hoặc cần xử lý; không ghi đè.');
  const row=(await db.query(`SELECT r.body FROM offline_home_feed_records_v1 r JOIN offline_home_head_v1 h ON h.tenant_id=r.tenant_id AND h.principal_id=r.principal_id AND h.generation=r.generation JOIN offline_home_feed_checkpoint_v1 c ON c.tenant_id=h.tenant_id AND c.principal_id=h.principal_id AND c.generation=h.generation AND c.revision=h.revision WHERE r.tenant_id=? AND r.principal_id=? AND h.revision=? AND r.source='employees' AND r.id=? AND COALESCE(json_extract(h.snapshot_json,'$.sourceProfile'),'legacy-v1')='legacy-v1' AND json_extract(h.snapshot_json,'$.feedGeneration')=h.generation AND c.applied_seq=json_extract(h.snapshot_json,'$.feedSeq') AND c.reported_seq=c.applied_seq AND r.seq<=c.applied_seq LIMIT 1`,[...keys,scope.permissionRevision,key]))[0];
  const feed=row&&JSON.parse(row.body),accepted=overlay?.server_json&&JSON.parse(overlay.server_json),value=!feed||(accepted?.offlineEmployeeProfileRevision??-1)>(feed.offlineEmployeeProfileRevision||0)?accepted:feed;
  if(!value||value.id!==key||value.companyId!==scope.tenantId)fail('Chưa có bản nguồn đầy đủ của hồ sơ trên SQLite.');return value;
 }
 const commands=createOfflineCommandRepository({...options,authorize:request=>access(request.kind),async onEnqueue(db,command){
  await access(command.kind);const p=command.payload,creating=command.kind==='employeeProfile.create',archiving=command.kind==='employeeProfile.archive';if(!Object.hasOwn(employeeProfileActions,command.kind))fail('Sai lệnh nhân sự.');let document;
  if(creating){if(await own(db,command.entityId))fail('Mã hồ sơ đã dùng.');document=newProfile(p.input,{id:command.entityId,tenant:scope.tenantId,position:p.position});}
  else{const live=await base(db,command.entityId);assertEditableEmployee(live,scope.tenantId);if(await digest(canonical(live))!==p.baseFingerprint||(live.offlineEmployeeProfileRevision||0)!==p.baseRevision)fail('Hồ sơ nguồn đã thay đổi.');document=archiving?{...live,isArchived:true}:{...live,...profileInput(p.input)};}
  await db.run('INSERT INTO offline_employee_profile_v1 VALUES (?,?,?,?,?,?,?) ON CONFLICT(tenant_id,principal_id,id) DO UPDATE SET command_id=excluded.command_id,intent_json=excluded.intent_json,server_json=excluded.server_json,receipt_json=NULL',[...keys,command.entityId,command.commandId,JSON.stringify(document),creating?null:JSON.stringify(await base(db,command.entityId)),null]);await access(command.kind);
 },async onReceipt(db,{commandId,entityId,receipt}){
  const row=await own(db,entityId);if(!row||row.command_id!==commandId||!Object.hasOwn(employeeProfileActions,receipt.kind)||receipt.entityId!==entityId)fail('Biên nhận không khớp hồ sơ.');
  if(receipt.outcome==='accepted'){
   const doc=receipt.document,intent=JSON.parse(row.intent_json);if(!doc||doc.id!==entityId||doc.companyId!==scope.tenantId||doc.offlineEmployeeProfileRevision!==receipt.baseRevision+1||receipt.revision!==doc.offlineEmployeeProfileRevision||await digest(canonical(doc))!==receipt.fingerprint)fail('Biên nhận hồ sơ không hợp lệ.');
   if(receipt.kind==='employeeProfile.archive'?doc.isArchived!==true:employeeProfileFields.some(key=>doc[key]!==intent[key]))fail('Biên nhận khác ý định hồ sơ đã lưu.');
  }
  if(receipt.outcome==='conflict'&&receipt.currentDocument&&(receipt.currentDocument.companyId!==scope.tenantId||receipt.currentDocument.id!==entityId||await digest(canonical(receipt.currentDocument))!==receipt.currentFingerprint))fail('Bản xung đột sai công ty/nguồn.');
  await db.run('UPDATE offline_employee_profile_v1 SET server_json=?,receipt_json=? WHERE tenant_id=? AND principal_id=? AND id=?',[receipt.outcome==='accepted'?JSON.stringify(receipt.document):row.server_json,JSON.stringify(receipt),...keys,entityId]);
 }});
 return Object.freeze({
  async create(input,position,key){input=profileInput(input);if(!id(key))fail('Sai mã hồ sơ.');return commands.enqueue({kind:'employeeProfile.create',entityId:key,baseRevision:0,payload:{input,position,baseRevision:0,baseFingerprint:null}});},
  async prepare(key){if(!id(key))fail('Sai hồ sơ.');return tx(async db=>{const value=await base(db,key);assertEditableEmployee(value,scope.tenantId);return{id:key,input:Object.fromEntries(employeeProfileFields.map(k=>[k,String(value[k]??'')])),position:value.position,baseRevision:value.offlineEmployeeProfileRevision||0,baseFingerprint:await digest(canonical(value))};});},
  async update(proof,input){if(!id(proof.id))fail('Sai hồ sơ.');return commands.enqueue({kind:'employeeProfile.update',entityId:proof.id,baseRevision:proof.baseRevision,payload:{input:profileInput(input),position:null,baseRevision:proof.baseRevision,baseFingerprint:proof.baseFingerprint}});},
  async archive(proof){if(!id(proof.id))fail('Sai hồ sơ.');return commands.enqueue({kind:'employeeProfile.archive',entityId:proof.id,baseRevision:proof.baseRevision,payload:{input:null,position:null,baseRevision:proof.baseRevision,baseFingerprint:proof.baseFingerprint}});},
  async page(){return tx(async db=>(await db.query('SELECT o.*,c.state,c.kind FROM offline_employee_profile_v1 o JOIN local_commands c USING(tenant_id,principal_id,command_id) WHERE o.tenant_id=? AND o.principal_id=? ORDER BY c.created_at DESC,c.command_id DESC LIMIT 40',keys)).map(r=>({id:r.id,commandId:r.command_id,state:r.state,kind:r.kind,document:JSON.parse(r.intent_json),serverDocument:r.server_json?JSON.parse(r.server_json):null,receipt:r.receipt_json?JSON.parse(r.receipt_json):null})));},
  async applyReceipt(...args){await access();return commands.applyReceipt(...args);},
 });
}
