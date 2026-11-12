import {assertOfflineProject} from '../config/offlineRuntimeEnvironment.js';
let active=null;
// Development-only registration. The bootstrap must supply an authenticated
// repository (offline grant checked by authorize) and its matching sync owner.
export function registerOfflineCustomerWriter({projectId,session,repository,sync,environment}) {
 assertOfflineProject(projectId,environment);
 if(active)throw new Error('Offline write owner already registered');
 const owner={projectId,session,repository,sync};active=owner;
 const unsubscribe=session.subscribe(()=>{if(!session.isCurrent()) {if(active===owner)active=null;sync.stop();}});
 return ()=>{unsubscribe();if(active===owner)active=null;sync.stop();};
}
export async function saveOfflineCustomerIfOwned({projectId,principalId,tenantId,documentId,payload,options}) {
 const owner=active;
 if(!owner || owner.projectId!==projectId)return null;
 const scope=owner.session.scope;
 if(!owner.session.isCurrent()||scope.principalId!==principalId||scope.tenantId!==tenantId)throw new Error('Offline customer account mismatch');
 if(payload.companyId!==tenantId||(!options?.merge&&payload.id!==documentId))throw new Error('Invalid offline customer tenant or ID');
 if(['account','password','openingDebt','initialDebt','debtBalance','balance'].some(key=>Object.hasOwn(payload,key))) {
  throw new Error('Cấp tài khoản và sửa số dư cần quy trình xác nhận riêng; chưa lưu vào hàng đợi offline.');
 }
 let receipt;
 if(options?.merge){
  if(typeof owner.repository.update!=='function')throw new Error('Customer revision repository is unavailable');
  const patch={...payload};delete patch.companyId;delete patch.id;
  receipt=await owner.repository.update(documentId,patch);
 }else{
  receipt=owner.repository.create
   ? await owner.repository.create(payload)
   : await owner.repository.enqueue({kind:'customer.create',entityId:documentId,baseRevision:0,payload});
 }
 if(active!==owner||!owner.session.isCurrent())throw new Error('Offline session changed after local commit');
 owner.sync.start();
 return {...receipt,queued:true,companyId:tenantId,localDurable:true,serverConfirmed:false};
}
