import {buildFirstRecordLookup} from '../utils/firstRecordLookup.js';
import {readCompletedModuleProjection} from './moduleProjectionCaches.js';

// Read-only indexes of the exact current source objects. No amounts, ledger
// rules, edit snapshots, command bodies or ACK results are calculated/cached.
// Preserve the original first/last duplicate and String(id) lookup semantics.
export function readOrderDirectoryProjection(entry,{orders,customers,products}){
 return readCompletedModuleProjection(entry,()=>{
  const activeOrders=orders.filter(order=>!order.isArchived),activeProducts=products.filter(product=>!product.isArchived);
  return {activeOrders,activeProducts,customerLookup:new Map(customers.map(customer=>[customer.id,customer])),
   activeProductLookup:new Map(activeProducts.map(product=>[product.id,product])),
   orderSearchProductLookup:buildFirstRecordLookup(products.filter(product=>!product?.isArchived)),
   activeOrderById:new Map(activeOrders.map(order=>[String(order.id),order]))};
 });
}
