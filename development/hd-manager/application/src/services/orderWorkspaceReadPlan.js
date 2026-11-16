// Same original sources, admitted in two stages. Full financial/history
// readiness remains separate from the committed invoice list.
const primary=Object.freeze(['customers','products','orders','payments']);
const full=Object.freeze([...primary,'orderRequests','warehouseDispatches','deliveryReports','expenses','warehouseImports','zalo_send_queue']);
export const ORDER_PRIMARY_COLLECTIONS=primary;
export const getOrderWorkspaceReadCollections=ready=>ready?full:primary;
export function runReadyOrderMutation(ready,callback,args){
 if(!ready) return Promise.reject(Object.assign(Error('Dữ liệu đối chiếu đang cập nhật. Bản nhập vẫn được giữ; vui lòng lưu lại khi đối chiếu hoàn tất.'),{code:'source-not-ready'}));
 return callback?.(...args);
}
export const runReadyFinancialMutation=runReadyOrderMutation;
