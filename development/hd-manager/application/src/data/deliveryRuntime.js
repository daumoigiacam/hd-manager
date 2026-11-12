// One lazy facade on the existing Runtime's DB/session/Outbox. No owner,
// connection, listener, network service or independent sync engine.
export function createDeliveryRuntime({database,session,deviceId,digest,uuid,employee,projectId,authorize,authorizeWrite,grant,foreground,changed,notifyConnectivity,retryFailedCommand,loadRepository=()=>import('./offlineDeliveryRepository.js')}){
 let pending;
 const readCaps=['home.read','home.quick-report.read','home.cashflow.read','home.orders.read','orders.read','home.dispatches.read','home.stock.read','home.debt.read','customers.read'];
 const current=()=>session.isCurrent()&&Date.now()<grant.expiresAtMs;
 return function deliveryRepository(){
  if(!current()||grant.projectId!==projectId||grant.appSession?.sourceProfile!==undefined||grant.appSession?.user?.id!==employee?.id||!readCaps.every(cap=>grant.capabilities?.includes(cap))||!['deliveryReports.create','deliveryReports.update','deliveryReports.archive'].some(cap=>grant.capabilities.includes(cap)))return Promise.reject(Error('Thiếu quyền giao hàng có chữ ký hoặc nguồn cần hợp đồng riêng'));
  if(!pending)pending=loadRepository().then(async({createOfflineDeliveryRepository})=>{
   if(!current())throw Error('Phiên giao hàng đã đóng');
   const raw=await foreground.run(()=>createOfflineDeliveryRepository({database,session,deviceId,digest,uuid,employee,projectId,development:true,authorize,authorizeWrite,retryFailedCommand,protocol:{version:1,serverCAS:true,atomicOutbox:true,receiptDispatch:true,atomicDeliveryDocuments:true},onQueued:()=>{if(current()){changed('deliveryReports');notifyConnectivity();}},onStateChange:()=>{if(current())changed('deliveryReports');}}));
   if(!current())throw Error('Phiên giao hàng đã đóng');
   const facade={...raw};
   for(const method of ['openDraft','selectAsset','preview','create','update','archive','detail','page','pick'])facade[method]=(...args)=>foreground.run(()=>{if(!current())throw Error('Phiên giao hàng đã đóng');return raw[method](...args);});
   return Object.freeze(facade);
  }).catch(error=>{pending=null;throw error;});
  return pending;
 };
}
