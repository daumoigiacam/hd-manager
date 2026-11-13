// Only this transport sends customer commands; the legacy queue is bypassed
// after the SQLite bridge accepts the command.
import {assertOfflineRuntimeEnvironment} from '../config/offlineRuntimeEnvironment.js';
export function createOfflineCustomerTransport({origin,projectId,getIdToken,fetch=globalThis.fetch,environment}){
 const endpoint=new URL(origin);
 if(environment)assertOfflineRuntimeEnvironment(environment,projectId,endpoint.href);
 else if(!/^demo-[a-z0-9-]+$/.test(projectId)||endpoint.protocol!=='http:'||!['127.0.0.1','localhost','10.0.2.2'].includes(endpoint.hostname)||endpoint.username||endpoint.password)throw new Error('Offline pilot transport requires local Emulator');
 async function call(action,body,signal,scope,forceRefresh=false){
  let token;
  try{token=await getIdToken({principalId:scope?.principalId,forceRefresh});}
  catch(error){throw Object.assign(new Error('Customer authentication unavailable'),{code:error?.code==='auth/network-request-failed'?'network-error':'unauthenticated'});}
  if(!token)throw Object.assign(new Error('Sign in online to synchronize'),{code:'unauthenticated'});
  let response;
  try{response=await fetch(new URL(action,endpoint.href.endsWith('/')?endpoint.href:endpoint.href+'/'),{method:'POST',credentials:'omit',redirect:'error',cache:'no-store',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify(body),signal});}
  catch(error){if(signal?.aborted)throw error;throw Object.assign(new Error('Customer sync network unavailable'),{code:'network-error'});}
  if(response.status===401&&!forceRefresh)return call(action,body,signal,scope,true);
  if(!response.ok)throw Object.assign(new Error('Customer endpoint rejected request'),{code:response.status===401?'unauthenticated':response.status===403?'permission-denied':response.status>=500?'unavailable':'invalid-argument'});
  return response.json();
 }
 return Object.freeze({businessSource:(body,signal,scope)=>call('business-source',{...body,scope},signal,scope),attendancePeriod:(body,signal,scope)=>call('attendance-period',body,signal,scope),payrollSettlement:(body,signal,scope)=>call('payroll-settlement',body,signal,scope),attendanceRequests:(body,signal,scope)=>call('attendance-adjustment',body,signal,scope),warehouseImportHead:(signal,scope)=>call('warehouse-import-head',{scope},signal,scope),warehouseImportPage:(body,signal,scope)=>call('warehouse-import-page',{...body,scope},signal,scope),delta:(body,signal,scope)=>call('customer-delta',body,signal,scope),homeHead:(signal,scope)=>call('home-head',{},signal,scope),homePage:(page,signal,scope)=>call('home-page',page,signal,scope),homeReport:(signal,scope,body={})=>call('home-report',body,signal,scope),send:(command,{signal,scope,attendanceContext})=>call('sync',{command,...(attendanceContext?{attendanceContext}:{})},signal,scope),grant:(deviceId,signal,scope)=>call('grant',{deviceId},signal,scope),page:(page,signal,scope)=>call('page',page,signal,scope),history:(page,signal,scope)=>call('history',page,signal,scope),detail:(id,signal,scope)=>call('detail',{id},signal,scope)});
}
