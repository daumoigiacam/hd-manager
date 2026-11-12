// Shared validation at local commit and server transaction. No catalog-unit
// inference and no financial recalculation from mutable customer defaults.
export function validateOfflineOrderDocument(order,tenantId){
 const number=(v,label)=>{if(typeof v!=='number'||!Number.isFinite(v)||v<0)throw Error('Giá trị đơn không hợp lệ: '+label);return v;};
 const allowed=new Set(['id','companyId','empId','createdByEmpId','createdAt','customerId','salesEmpId','items','amount','totalAmount','paidAmount','date','discount','extraExpenseName','extraExpenseAmount','extraExpensePayer','customerExtraExpense','sellerExtraExpense','branchId','branchName','branchAddress','customerBranchId','customerBranchName','customerBranchAddress','note','sourceType','sourceDispatchIds','sourceDispatchDate','reviewStatus','reviewStatusLabel','zaloSendStatus']);
 if(!order||Object.keys(order).some(key=>!allowed.has(key)))throw Error('Trường đơn hàng cần luồng riêng');
 if(!order||order.companyId!==tenantId||!/^ord_[a-zA-Z0-9_-]+$/.test(order.id)||!order.customerId||!/^\d{4}-\d{2}-\d{2}$/.test(order.date))throw Error('Định danh đơn không hợp lệ');
 if(!Array.isArray(order.items)||!order.items.length||order.items.length>100)throw Error('Đơn cần 1–100 dòng hàng');
 let subtotal=0;
 const lineFields=new Set(['productId','description','productName','productNameSnapshot','configurationId','sizeLabel','attributeLabel','quantity','unitPrice','orderedUnit','orderUnit','actualQuantity','actualUnit','actualWeightKg','billingQuantity','billingUnit','basePriceUnit','conversionFactor','conversionSource','unitConversions','amount','quantityCount','quantityUnit','pricingQuantity','pricingUnit','pricingAmount','lineTotal','pricingPendingActual','billingSnapshotVersion','billingSnapshotSource','billingSnapshotValid','billingSnapshotError']);
 for(const line of order.items){
  if(!line||Object.keys(line).some(key=>!lineFields.has(key)))throw Error('Trường dòng hàng cần luồng riêng');
  if(!line.productId||typeof line.orderedUnit!=='string'||!line.orderedUnit.trim()||typeof line.pricingUnit!=='string'||!line.pricingUnit.trim())throw Error('Mỗi dòng phải có ĐVT đặt và ĐVT tính giá');
  if(line.orderedUnit.length>40||line.pricingUnit.length>40)throw Error('ĐVT quá dài');
  if(line.orderUnit!==line.orderedUnit||line.billingUnit!==line.pricingUnit)throw Error('Snapshot ĐVT không nhất quán');
  if(line.actualQuantity!==line.quantity||line.quantityCount!==line.quantity||line.actualUnit!==line.orderedUnit||line.quantityUnit!==line.orderedUnit||line.pricingQuantity!==line.billingQuantity||line.pricingAmount!==line.amount)throw Error('Snapshot số lượng không nhất quán');
  number(line.quantity,'số lượng');number(line.billingQuantity,'số lượng tính giá');number(line.unitPrice,'đơn giá');
  if(line.quantity<=0||line.billingQuantity<=0||line.unitPrice<=0)throw Error('Số lượng và đơn giá phải lớn hơn 0');
  const amount=Math.round(line.billingQuantity*line.unitPrice);
  if(line.amount!==amount||line.lineTotal!==amount)throw Error('Tiền dòng không khớp snapshot');subtotal+=amount;
 }
 const discount=number(order.discount||0,'giảm giá'),fee=number(order.extraExpenseAmount||0,'phụ phí');
 if(fee>0)throw Error('Phụ phí có nghiệp vụ thu/chi liên quan; cần luồng ghi nguyên khối riêng');
 const payer=order.extraExpensePayer||'buyer';if(!['buyer','shared','seller'].includes(payer))throw Error('Bên chịu phí không hợp lệ');
 const buyerFee=payer==='buyer'?fee:payer==='shared'?fee/2:0;
 if(order.paidAmount!==0||order.totalAmount!==order.amount||order.customerExtraExpense!==buyerFee||order.sellerExtraExpense!==fee-buyerFee||order.reviewStatus!=='draft'||order.zaloSendStatus!=='not_queued')throw Error('Thanh toán hoặc trạng thái đơn cần luồng riêng');
 if(order.amount!==Math.max(0,subtotal-discount+buyerFee))throw Error('Tổng tiền đơn không khớp các dòng');
 if((order.sourceDispatchIds||[]).length||order.sourceType==='warehouse_dispatch')throw Error('Luồng Offline này chỉ tạo đơn thủ công; phiếu xuất cần đối soát riêng');
 return order;
}
