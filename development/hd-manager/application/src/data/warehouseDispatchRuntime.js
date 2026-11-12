// Same Runtime dependency injection only. No database/queue/network lifecycle.
export function createWarehouseDispatchRuntime({database,session,deviceId,digest,uuid,employeeId,projectId,authorize,authorizeWrite,grant,business,getBusinessDirectory,foreground,changed,notifyConnectivity,loadRepository=()=>import('./offlineWarehouseDispatchRepository.js')}){
 let pending;
 return function warehouseDispatchRepository(){
  if(!session.isCurrent()||grant.appSession?.sourceProfile!==undefined||!grant.capabilities?.some(cap=>/^warehouseDispatches\.(create|update|archive)$/.test(cap)))return Promise.reject(Error('Thiếu quyền xuất kho có chữ ký hoặc nguồn cần hợp đồng riêng'));
  if(!pending)pending=loadRepository().then(async({createOfflineWarehouseDispatchRepository})=>{
   if(!session.isCurrent())throw Error('Phiên xuất kho đã đóng');
   const directory=business||await getBusinessDirectory();if(!session.isCurrent())throw Error('Phiên xuất kho đã đóng');
   const raw=await createOfflineWarehouseDispatchRepository({database,session,deviceId,digest,uuid,employeeId,projectId,development:true,authorize,authorizeWrite,business:directory,protocol:{version:1,serverCAS:true,receiptDispatch:true,atomicOutbox:true,serverStockValidation:true,outsideRequestOnly:true},onQueued:()=>{changed('warehouseDispatches');notifyConnectivity();}});
   if(!session.isCurrent())throw Error('Phiên xuất kho đã đóng');
   const facade={...raw};for(const method of ['preview','page','detail','lookup'])facade[method]=(...args)=>foreground.run(()=>raw[method](...args));return Object.freeze(facade);
  }).catch(error=>{pending=null;throw error;});
  return pending;
 };
}
