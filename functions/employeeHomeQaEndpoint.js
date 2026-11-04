const path=require('node:path');const {createEmployeeHomeRuntime}=require('./employeeHomeRuntime');
const {v1}=require('firebase-admin/firestore');
const {logHomeRuntimeShape}=require('./employeeHomeRuntimeShape');
const EMPLOYEE_HOME_QA_OPTIONS=Object.freeze({region:'asia-southeast1',memory:'512MiB',concurrency:1,minInstances:0,maxInstances:1,timeoutSeconds:15,invoker:'public'});
// A separately approved QA endpoint; it never replaces the login/customer APIs.
// Public HTTP invocation still requires the existing revoked-token verifier,
// active Identity Center account and the single approved QA UID digest.
function createEmployeeHomeQaEndpoint({db,admin,identityCenter,getAppId,applyCors,getQaActorSha256,
 artifactDirectory=path.join(__dirname,'generated','employee-home'),recordTiming=value=>console.info('HD_HOME_QA_TIMING '+JSON.stringify(value))}){
 logHomeRuntimeShape();
 let runtime,queryClient;
 return async(req,res)=>{
  applyCors(req,res);res.set('Cache-Control','private, no-store, max-age=0');
  if(req.method==='OPTIONS')return res.status(204).send('');
  if(req.method!=='POST')return res.status(405).json({success:false,code:'method_not_allowed'});
  try{runtime??=createEmployeeHomeRuntime({db,admin,identityCenter,appId:getAppId(),applyCors,artifactDirectory,qaActorSha256:getQaActorSha256(),recordTiming,
   projectId:process.env.GCLOUD_PROJECT||process.env.GCP_PROJECT||admin.app().options.projectId,
   // Keep the locked SDK's buffered stream path (also exercised over real
   // loopback gRPC in tests); disable its retry-request retries per query.
   getQueryClient:()=>queryClient??=new v1.FirestoreClient({fallback:false,gaxServerStreamingRetries:false}),
   getAccessToken:()=>admin.app().options.credential.getAccessToken()})}
  catch{return res.status(503).json({success:false,code:'home_qa_not_configured',message:'Chưa sẵn sàng kiểm tra Trang chủ.'})}
  return runtime(req,res);
 };
}
module.exports={EMPLOYEE_HOME_QA_OPTIONS,createEmployeeHomeQaEndpoint};
