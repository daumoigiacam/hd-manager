const {createHash}=require('node:crypto');
const {originalCoreCapabilities}=require('./offlineCoreAppPolicy.cjs');
const {isTrustedOfflineServerEnvironment}=require('./offlineServerEnvironment.cjs');
const deny=()=>Object.assign(Error('Offline identity or current role denied'),{code:'permission-denied'});
const segment=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,160}$/.test(x);
function createTrustedOfflineActorResolver({environment,db,projector,mapping,now=Date.now,deriveReadCapabilities=()=>[]}){
 const {projectId,appId,auth}=environment||{};
 if(!isTrustedOfflineServerEnvironment(environment,projectId,appId,db)||typeof projector?.hasCompanyRolePermissionAction!=='function')throw Error('Verified original server policy required');
 async function verifyToken(token){
  const decoded=await auth.verifyIdToken(token,true);
  if(decoded.aud!==projectId||decoded.iss!=='https://securetoken.google.com/'+projectId||!segment(decoded.uid)||!segment(decoded.identityId)||!segment(decoded.companyId)||!segment(decoded.appUserId)||decoded.accountType!=='employee'||!Number.isSafeInteger(decoded.exp)||now()>=decoded.exp*1000||decoded.uid!=='identity_'+decoded.identityId.replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,120))throw deny();
  return decoded;
 }
 async function read(reader,decoded){
  if(now()>=decoded.exp*1000)throw Object.assign(Error('Firebase token expired'),{code:'unauthenticated'});
  const identity=(await reader.get(db.doc('identity_accounts/'+decoded.identityId))).data();
  if(!identity||identity.status!=='active'||identity.lockedAt||identity.accountType!=='employee'||identity.companyId!==decoded.companyId||identity.appUserId!==decoded.appUserId)throw deny();
  const base='artifacts/'+appId+'/public/data/';
  const [c,e]=await Promise.all([reader.get(db.doc(base+'companies/'+decoded.companyId)),reader.get(db.doc(base+'employees/'+decoded.appUserId))]);
  const company=c.data(),employee=e.data();
  if(!company||company.isArchived||!employee||employee.isArchived||employee.companyId!==decoded.companyId||['blocked','inactive'].includes(employee.status))throw deny();
  const subject={company:{...company,id:c.id},employee:{...employee,id:e.id},currentUser:{...employee,id:e.id}};
  const permissionRevision=createHash('sha256').update(JSON.stringify([company.rolePermissions,company.rolePermissionActions,company.employeeRolePermissionActions,company.employeeRolePermissions,employee.role,employee.position,employee.positions,employee.additionalPositions,employee.rolePermissions,employee.rolePermissionActions,employee.permissionOverrides,employee.isArchived])).digest('hex');
  const extra=deriveReadCapabilities(subject,projector.hasCompanyRolePermissionAction);
  if(!Array.isArray(extra)||extra.some(x=>!['attendancePeriod.read','attendanceRequest.read','salarySettlement.read'].includes(x)))throw deny();
  return {uid:decoded.uid,tenantId:decoded.companyId,permissionRevision,subject,capabilities:[...new Set([...originalCoreCapabilities(subject,{hasAction:projector.hasCompanyRolePermissionAction,mapping}),...extra])]};
 }
 const resolve=async token=>{const decoded=await verifyToken(token);return db.runTransaction(reader=>read(reader,decoded),{readOnly:true});};
 return {verifyToken,read,resolve};
}
module.exports={createTrustedOfflineActorResolver};
