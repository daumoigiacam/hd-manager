import {DELIVERY_SLOTS,deliveryFail,deliveryPlain} from './deliveryCommandProtocol.js';

// The SQLite and Firestore adapters implement the same bounded relationship
// reads. No page preview is ever used as a financial/CAS document.
export const DELIVERY_RELATIONS=Object.freeze({
 reports:{source:'deliveryReports',fields:['dispatchId']},
 orders:{source:'orders',fields:['sourceDispatchId','dispatchId','sourceDispatchIds']},
 expenses:{source:'expenses',fields:['relatedDeliveryReportId','id']},
 costs:{source:'assetCostLogs',fields:['relatedDeliveryReportId','id']},
 orderExpenses:{source:'expenses',fields:['sourceOrderId'],sourceType:'order_extra_expense'},
 costExpenses:{source:'expenses',fields:['id','assetCostLogId','relatedAssetCostLogId','sourceAssetCostLogId']},
});
const singleton=(rows,name)=>{const active=rows.filter(r=>!r.isArchived);if(active.length>1)deliveryFail('Quan hệ '+name+' không duy nhất; không tự sửa lịch sử.');return active[0]||null;};
const pairs=rows=>rows.map(r=>[r.id,r.isArchived===true]).sort((a,b)=>a[0]<b[0]?-1:a[0]>b[0]?1:0);
export async function loadDeliveryContext({one,related,tenantId,employee,id,dispatchId,assetId=''}){
 const report=await one('deliveryReports',id),dispatch=await one('warehouseDispatches',report?.dispatchId||dispatchId);if(!dispatch)deliveryFail('Không có phiếu xuất được xác nhận.');
 const customer=await one('customers',dispatch.customerId),product=await one('products',dispatch.productId),company=await one('companies',tenantId);if(!customer||!product||!company)deliveryFail('Thiếu khách/sản phẩm/công ty từ nguồn hoàn tất.');
 const reports=await related('reports',[dispatch.id]);if(!report&&reports.some(r=>!r.isArchived))deliveryFail('Phiếu xuất đã có báo cáo. Mở báo cáo hiện tại để sửa.');
 const orders=await related('orders',[dispatch.id]),order=singleton(orders,'hóa đơn/phiếu xuất');
 const expenses=await related('expenses',[id,report?.expenseId||'']),expense=singleton(expenses,'phiếu chi giao hàng');
 const costs=await related('costs',[id,report?.assetCostLogId||'']),cost=singleton(costs,'chi phí tài sản');
 const orderExpenses=order?await related('orderExpenses',[order.id]):[],orderExpense=singleton(orderExpenses,'phụ phí đơn hàng');
 const costExpenses=cost?await related('costExpenses',[cost.expenseId||'',cost.id,cost.id,cost.id]):[],costExpense=singleton(costExpenses,'chi phí liên kết tài sản');
 const asset=await one('assets',assetId||report?.deliveryExpenseAssetId||cost?.assetId||'');
 return deliveryPlain({report,dispatch,customer,product,company,order,expense,cost,orderExpense,costExpense,asset,employee:{id:employee.id,name:employee.name||''},relations:{reports:pairs(reports),orders:pairs(orders),expenses:pairs(expenses),costs:pairs(costs),orderExpenses:pairs(orderExpenses),costExpenses:pairs(costExpenses)},targets:{}});
}
// Predict only this command's accepted relationship changes. A later command
// keeps this exact receipt base while a changed server relationship CAS-conflicts.
export function acceptedDeliveryContext(base,planned){
 const next=deliveryPlain(base);
 for(const [slot,source]of Object.entries(DELIVERY_SLOTS)){
  const id=slot==='report'?planned.document.id:slot==='expense'?planned.document.expenseId:slot==='cost'?planned.document.assetCostLogId:next[slot]?.id;
  if(id&&planned.documents[source+'/'+id])next[slot]=planned.documents[source+'/'+id];
 }
 next.report=planned.document;next.targets={...next.targets,...planned.documents};
 const selected={reports:next.report,orders:next.order,expenses:next.expense,costs:next.cost,orderExpenses:next.orderExpense,costExpenses:next.costExpense};
 for(const [name,record]of Object.entries(selected))if(record){const prior=next.relations[name]||[];next.relations[name]=pairs([...prior.filter(r=>r[0]!==record.id).map(([id,isArchived])=>({id,isArchived})),record]);}
 for(const slot of ['expense','cost','orderExpense','costExpense'])if(next[slot]?.isArchived)next[slot]=null;
 if(!next.cost){next.costExpense=null;next.relations.costExpenses=[];}
 return next;
}
