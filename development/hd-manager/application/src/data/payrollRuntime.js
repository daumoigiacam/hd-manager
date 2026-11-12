// Composition only: same SQLite/session/Outbox/sync owner, no new lifecycle.
export function createPayrollRuntime({database,session,deviceId,digest,uuid,employeeId,projectId,authorize,authorizeWrite,grant,foreground,changed,notifyConnectivity,loadRepository=()=>import('./offlinePayrollRepository.js')}){
 let pending;
 return function payrollRepository(){
  if(!session.isCurrent()||grant.appSession?.sourceProfile!==undefined||!grant.capabilities?.includes('payroll.company.read'))return Promise.reject(Error('Thiếu quyền lương toàn công ty có chữ ký.'));
  pending||=loadRepository().then(async({createOfflinePayrollRepository})=>{
   if(!session.isCurrent())throw Error('Phiên lương đã đóng');
   const raw=await createOfflinePayrollRepository({database,session,deviceId,digest,uuid,employeeId,projectId,development:true,authorize,authorizeWrite,protocol:{version:1,serverRecompute:true,compoundCAS:true,atomicOutbox:true,receiptDispatch:true},onQueued:()=>{changed('payroll');notifyConnectivity();}});
   if(!session.isCurrent())throw Error('Phiên lương đã đóng');
   const facade={...raw};for(const method of ['load','page','prepare'])facade[method]=(...args)=>foreground.run(()=>raw[method](...args));return Object.freeze(facade);
  }).catch(error=>{pending=null;throw error;});return pending;
 };
}
