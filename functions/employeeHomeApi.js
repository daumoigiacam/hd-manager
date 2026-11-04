// Protected composition used only by the separately approved QA endpoint.
// Reuse Identity Center's revoked-token/account validation, with no Auth bypass.
const {createEmployeeHomeReadModel}=require('./employeeHomeReadModel');
const denied=()=>Object.assign(new Error('home_actor_denied'),{code:'home_actor_denied',statusCode:403});
const active=record=>record&&!record.isArchived&&!record.disabled&&!record.lockedAt
 &&!['blocked','disabled','revoked','suspended','deleted'].includes(record.status||record.accountStatus);
function verifiedScope(verified){
 const claims=verified?.decoded,identity=verified?.identity;
 if(!claims||!identity||identity.status!=='active'||identity.lockedAt||verified.identityId!==claims.identityId
  ||identity.accountType!=='employee'||claims.accountType!=='employee'
  ||identity.companyId!==claims.companyId||identity.appUserId!==claims.appUserId
  ||identity.publicCollection!=='employees'||identity.publicId!==claims.appUserId)throw denied();
 return {appId:null,uid:claims.uid,identityId:claims.identityId,companyId:claims.companyId,employeeId:claims.appUserId};
}
function matchesActor(verified,scope,snapshot){
 const current=verifiedScope(verified);
 return current.uid===scope.uid&&current.identityId===scope.identityId&&current.companyId===scope.companyId&&current.employeeId===scope.employeeId
  &&snapshot?.company?.documentId===scope.companyId&&snapshot?.employee?.documentId===scope.employeeId
  &&snapshot.employee.data?.companyId===scope.companyId&&active(snapshot.company.data)&&active(snapshot.employee.data);
}
function createEmployeeHomeApi({allowedAppId,verifyIdentity,load,project,loadCurrentActor,applyCors,validateModel}){
 if([verifyIdentity,load,project,loadCurrentActor,applyCors,validateModel].some(fn=>typeof fn!=='function'))throw new TypeError('Verified Home API dependencies required.');
 const identities=new WeakMap(),requestScopes=new WeakMap();
 const read=createEmployeeHomeReadModel({allowedAppId,
  verify:async request=>{
   const verified=await verifyIdentity(request);verifiedScope(verified);
   identities.set(verified.decoded,verified);requestScopes.set(request,verifiedScope(verified));return verified.decoded;
  },
  authorizeSnapshotActor:({scope,claims,snapshot})=>matchesActor(identities.get(claims),scope,snapshot),load,project});
 return async function employeeHomeRequest(req,res){
  applyCors(req,res);res.set('Cache-Control','private, no-store, max-age=0');res.set('Vary','Origin');
  if(req.method==='OPTIONS')return res.status(204).send('');
  if(req.method!=='POST')return res.status(405).json({success:false,code:'method_not_allowed'});
  const isCurrent=()=>!req.aborted&&!res.destroyed;
  try{
   const result=await read(req,{isCurrent});if(!isCurrent())return;
   // Revocation/account state and live public actor status are checked again
   // before publication. A joined read cannot borrow a former caller's access.
   const verified=await verifyIdentity(req),identityScope=verifiedScope(verified),original=requestScopes.get(req);
   if(!original||identityScope.identityId!==original.identityId||identityScope.uid!==result.scope.uid||identityScope.companyId!==result.scope.companyId||identityScope.employeeId!==result.scope.employeeId)throw denied();
   const actor=await loadCurrentActor({...identityScope,appId:allowedAppId});
   if(!matchesActor(verified,original,actor))throw denied();
   if(!isCurrent())return;
   if(!/^[a-f0-9]{64}$/.test(result.domainVersion))throw Object.assign(new Error('invalid_home_projection'),{code:'invalid_home_projection',statusCode:503});
   const payload={success:true,...result,model:validateModel(result.model)},encoded=JSON.stringify(payload);
   if(Buffer.byteLength(encoded)>131072)throw Object.assign(new Error('home_response_limit'),{code:'home_response_limit',statusCode:503});
   res.status(200).set('Content-Type','application/json; charset=utf-8').send(encoded);
  }catch(error){
   if(!isCurrent())return;
   const status=[400,401,403,409,413,429,503].includes(error?.statusCode)?error.statusCode:500;
   const code=typeof error?.code==='string'&&/^[a-z_]{1,80}$/.test(error.code)?error.code:'home_read_failed';
   return res.status(status).json({success:false,code,message:'Chưa lấy được dữ liệu Trang chủ. Vui lòng thử lại.'});
  }finally{requestScopes.delete(req)}
 };
}
module.exports={createEmployeeHomeApi};
