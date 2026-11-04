// Composition of the separately approved, single-UID QA endpoint. This module
// performs no deployment, rules change, source write or trigger creation.
const path=require('node:path');const fs=require('node:fs');const {createHash}=require('node:crypto');
const {AsyncLocalStorage}=require('node:async_hooks');
const {createEmployeeHomeApi}=require('./employeeHomeApi');
const {loadEmployeeHomeSources}=require('./employeeHomeReadModel');
const {loadEmployeeHomeRestSnapshot}=require('./employeeHomeRestSnapshot');
const {createEmployeeHomeProcessProjector}=require('./employeeHomeProcessProjector');
const {EMPLOYEE_HOME_ACTOR_READ_OPTIONS}=require('./employeeHomeActorFields');
const {loadEmployeeHomeGrpcSnapshot}=require('./employeeHomeGrpcSnapshot');
const {validateEmployeeHomeFieldSpec}=require('./employeeHomeFieldSpec');
const {createEmployeeHomeCpuDiagnostic}=require('./employeeHomeCpuDiagnostic');
const denied=()=>Object.assign(new Error('home_actor_unavailable'),{code:'home_actor_unavailable',statusCode:403});

function loadVerifiedEmployeeHomeArtifact(directory){
 if(!path.isAbsolute(directory))throw new TypeError('Verified private calculation directory required.');
 const manifest=JSON.parse(fs.readFileSync(path.join(directory,'manifest.json'),'utf8'));
 if(manifest.fileName!=='employee-home-projector.cjs'||!/^[a-f0-9]{64}$/.test(manifest.domainVersion))throw new TypeError('Invalid private calculation manifest.');
 const modulePath=path.join(directory,manifest.fileName),code=fs.readFileSync(modulePath);
 if(createHash('sha256').update(code).digest('hex')!==manifest.domainVersion)throw new TypeError('Private calculation artifact hash mismatch.');
 const artifact=require(modulePath);
 if(typeof artifact.validateEmployeeHomeScreenDto!=='function'||typeof artifact.projectEmployeeHomeSnapshot!=='function')throw new TypeError('Incomplete private calculation artifact.');
 return {modulePath,domainVersion:manifest.domainVersion,validate:artifact.validateEmployeeHomeScreenDto,fieldProjection:validateEmployeeHomeFieldSpec(artifact.employeeHomeFieldProjection)};
}

function createEmployeeHomeRuntime({db,admin,identityCenter,appId,applyCors,artifactDirectory,qaActorSha256,recordTiming=()=>{},projectId,getAccessToken,getQueryClient}){
 if(!db||!admin?.firestore?.FieldPath||typeof identityCenter?.getVerifiedIdentity!=='function'||typeof applyCors!=='function'
  ||typeof appId!=='string'||!appId||appId.length>512||appId.includes('/')||!/^[a-f0-9]{64}$/.test(qaActorSha256))throw new TypeError('Verified private Home runtime dependencies required.');
 const artifact=loadVerifiedEmployeeHomeArtifact(artifactDirectory);
 const project=createEmployeeHomeProcessProjector({...artifact,timeoutMs:1500,maxInflight:1});
 const traces=new AsyncLocalStorage();
 const cpuDiagnostic=createEmployeeHomeCpuDiagnostic({record:value=>traces.getStore()?.push(value)});
 const timed=async(name,operation)=>{
  const started=performance.now(),cpuStarted=process.cpuUsage();let ok=false,code=null;
  try{const result=await operation();ok=true;return result}
  catch(error){code=/^[a-z_]{1,80}$/.test(error?.code||'')?error.code:'operation_failed';throw error}
  finally{const cpu=process.cpuUsage(cpuStarted);traces.getStore()?.push({phase:name,durationMs:performance.now()-started,cpuMs:(cpu.user+cpu.system)/1000,ok,...(code?{code}:{})})}
 };
 let reading=false;
 const load=async scope=>{
  if(reading)throw Object.assign(new Error('home_read_busy'),{code:'home_read_busy',statusCode:429});
  reading=true;
  try{const onReadMetrics=metrics=>{for(const m of metrics)traces.getStore()?.push({phase:'snapshot_source',durationMs:m.durationMs,ok:m.complete,collection:m.collection,pages:m.pages,rows:m.rows,
   ...Object.fromEntries(['requestMs','processingMs','decodedBytes','httpStatus','firstEntryMs','protoBytes','selectedFields'].filter(k=>Number.isFinite(m[k])).map(k=>[k,m[k]])),
   ...(m.transport==='grpc'?{transport:'grpc'}:{}),
   ...(['gzip','br','deflate','identity','none'].includes(m.encoding)?{encoding:m.encoding}:{})})};
   if(projectId&&getQueryClient)return await loadEmployeeHomeGrpcSnapshot({db,scope,projectId,queryClient:getQueryClient(),onReadMetrics,fieldProjection:artifact.fieldProjection});
   if(artifact.fieldProjection)throw Object.assign(new Error('home_projection_transport_required'),{code:'home_projection_transport_required',statusCode:503});
   if(projectId&&getAccessToken)return await loadEmployeeHomeRestSnapshot({db,scope,projectId,getAccessToken,onReadMetrics});
   return await loadEmployeeHomeSources({db,scope,documentIdField:admin.firestore.FieldPath.documentId(),
   pageSize:200,queryConcurrency:2,maxDocuments:20000,maxPrivateBytes:24*1024*1024,deadlineMs:3000,
   onReadMetrics})}
  finally{reading=false}
 };
 const loadCurrentActor=async scope=>{
  const root=`artifacts/${appId}/public/data`;
  const [company,employee]=await db.getAll(db.doc(`${root}/companies/${scope.companyId}`),db.doc(`${root}/employees/${scope.employeeId}`),EMPLOYEE_HOME_ACTOR_READ_OPTIONS);
  if(!company?.exists||!employee?.exists)throw denied();
  return {company:{documentId:company.id,data:company.data()},employee:{documentId:employee.id,data:employee.data()}};
 };
 const handler=createEmployeeHomeApi({allowedAppId:appId,applyCors,load:scope=>timed('snapshot',()=>cpuDiagnostic(scope,()=>load(scope))),
  project:input=>timed('calculation',()=>project(input)),loadCurrentActor:scope=>timed('current_actor',()=>loadCurrentActor(scope)),validateModel:artifact.validate,
  verifyIdentity:req=>timed('identity',async()=>{
   const verified=await identityCenter.getVerifiedIdentity(req.get?.('authorization')||req.headers?.authorization||'');
   // The first deployment, if approved, is restricted to the one existing QA
   // session. An authenticated ordinary company account cannot start this
   // compatibility history aggregation just by discovering the endpoint URL.
   if(typeof verified?.decoded?.uid!=='string'||createHash('sha256').update(verified.decoded.uid).digest('hex')!==qaActorSha256)throw denied();
   return verified;
  })});
 return (req,res)=>traces.run([],async()=>{
  const started=performance.now();try{return await handler(req,res)}
  finally{recordTiming({durationMs:performance.now()-started,status:res.statusCode,phases:traces.getStore().slice()})}
 });
}
module.exports={createEmployeeHomeRuntime,loadVerifiedEmployeeHomeArtifact};
