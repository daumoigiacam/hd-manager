import {makeFixture} from '../phase2/synthetic-fixture.mjs';

// Fabricated workload with explicit stock/order/payment links. It is not a
// company export, a cloud capacity model, or a substitute for manual QA.
export function makeRichSyntheticFixture(){
 const fixture=makeFixture('manager',1000),data=fixture.data,companyId=fixture.claims.companyId;
 const date=Object.values(data.orders)[0].date,productIds=Object.keys(data.products),customerIds=Object.keys(data.customers);
 for(const key of ['orders','orderRequests','warehouseImports','warehouseDispatches','payments','expenses','assets','assetCostLogs','deliveryReports','messages','bankAccounts','bankTransactions','financials','attendance'])data[key]={};
 for(const product of Object.values(data.products))Object.assign(product,{stockUnit:'Kg',importUnit:'Kg',openingStock:100,sellingPrice:10000,costPrice:7000,attributes:'To, Trung, Nhỏ'});
 for(let i=0;i<customerIds.length;i++)Object.assign(data.customers[customerIds[i]],{allowDebt:true,debtLimit:1000000000,
  customerProductIds:i===0?productIds:productIds.slice(i%990,i%990+3)});
 for(let i=0;i<20;i++){
  const id=`fiction-worker-${i}`;data.employees[id]={id,companyId,name:`Synthetic Worker ${i}`,role:'employee',position:i%2?'Giao hàng':'Nhân viên',status:'active',baseSalary:6000000,startDate:'2026-01-01'};
  for(let day=1;day<=3;day++){const dayKey=date.slice(0,8)+String(day).padStart(2,'0'),key=`${id}_${dayKey}`;data.attendance[key]={id:key,companyId,empId:id,date:dayKey,status:'present',checkIn:`${dayKey}T01:00:00.000Z`,checkOut:`${dayKey}T10:00:00.000Z`,workHours:8}}
 }
 for(let i=0;i<1000;i++){
  const id=`fiction-import-${i}`,productId=productIds[i];data.warehouseImports[id]={id,companyId,productId,quantity:1000,quantityUnit:'Kg',weightKg:1000,unitPrice:7000,amount:7000000,date,supplierName:'Synthetic supplier',status:'confirmed'};
  const expenseId=`fiction-purchase-${i}`;data.expenses[expenseId]={id:expenseId,companyId,date,amount:7000000,category:'Chi mua hàng hóa',approvalStatus:'approved',status:'confirmed',sourceType:'warehouse_import',sourceWarehouseImportId:id,note:'Synthetic inventory purchase'};
 }
 for(let i=0;i<2000;i++){
  const id=`fiction-order-${i}`,customerId=customerIds[i%customerIds.length],sourceDispatchIds=[],items=[];
  for(let j=0;j<3;j++){
   const productId=productIds[(i*3+j)%productIds.length],dispatchId=`fiction-dispatch-${i}-${j}`;sourceDispatchIds.push(dispatchId);
   const sizeLabel=['To','Trung','Nhỏ'][j],item={productId,quantity:2,quantityUnit:'Kg',weightKg:2,billingUnit:'Kg',pricingUnit:'Kg',unitPrice:10000,amount:20000,total:20000,sizeLabel,sourceDispatchId:dispatchId};items.push(item);
   data.warehouseDispatches[dispatchId]={id:dispatchId,companyId,customerId,productId,quantity:2,quantityUnit:'Kg',weightKg:2,unitPrice:10000,date,sizeLabel,empId:`fiction-worker-${i%20}`,linkedOrderId:id,linkedOrderCreatedAt:`${date}T01:00:00.000Z`};
  }
  data.orders[id]={id,companyId,customerId,empId:'fixture-sales',date,status:'completed',total:60000,amount:60000,totalAmount:60000,items,sourceDispatchIds,paidAmount:0,createdAt:`${date}T01:00:00.000Z`};
  const paymentId=`fiction-payment-${i}`;data.payments[paymentId]={id:paymentId,companyId,customerId,orderId:id,amount:20000,date,method:'Tiền mặt',status:'completed',approvalStatus:'approved',createdByEmpId:'fixture-manager'};
  if(i<1000){const requestId=`fiction-request-${i}`;data.orderRequests[requestId]={id:requestId,companyId,customerId,empId:'fixture-sales',date,items:items.map(({sourceDispatchId,...item})=>item),createdAt:`${date}T00:30:00.000Z`}}
  if(i<200){const reportId=`fiction-delivery-${i}`;data.deliveryReports[reportId]={id:reportId,companyId,customerId,orderId:id,linkedOrderId:id,sourceDispatchIds,date,empId:`fiction-worker-${i%20}`,status:'completed',resolutionStatus:'accepted'}}
 }
 for(let i=0;i<20;i++){const id=`fiction-asset-${i}`;data.assets[id]={id,companyId,name:`Synthetic vehicle ${i}`,type:'truck',registrationNumber:`SYN-${i}`,status:'active',assignedEmployeeId:`fiction-worker-${i}`,purchaseDate:'2026-01-01'}}
 for(let i=0;i<100;i++){
  const assetId=`fiction-asset-${i%20}`,expenseId=`fiction-expense-${i}`,logId=`fiction-cost-${i}`;
  data.expenses[expenseId]={id:expenseId,companyId,assetId,date,amount:20000,category:'Chi xăng dầu',approvalStatus:'approved',status:'confirmed',note:'Synthetic vehicle cost',sourceAssetCostLogId:logId};
  data.assetCostLogs[logId]={id:logId,companyId,assetId,date,amount:20000,category:'fuel',expenseId,note:'Synthetic vehicle cost'};
 }
 data.bankAccounts['fiction-bank']={id:'fiction-bank',companyId,name:'Synthetic cash account',bankName:'Synthetic only',accountNumber:'0000000000',accountHolder:'SYNTHETIC ONLY',isActive:true};
 for(let i=0;i<100;i++){const id=`fiction-bank-transaction-${i}`;data.bankTransactions[id]={id,companyId,bankAccountId:'fiction-bank',date,amount:20000,transferType:'in',status:'matched',matchedPaymentId:`fiction-payment-${i}`,content:'Synthetic settled transaction'}}
 for(let i=0;i<100;i++){const id=`fiction-message-${i}`;data.messages[id]={id,companyId,senderId:'fixture-sales',receiverId:'fixture-manager',recipientEmpId:'fixture-manager',text:`Synthetic message ${i}`,isRead:true,createdAt:`${date}T01:00:00.000Z`}}
 fixture.workload={kind:'synthetic-linked-business-v1',customers:1000,products:1000,orders:2000,orderItems:6000,dispatches:6000,payments:2000,requests:1000,imports:1000,expectedSalesAmount:120000000,expectedPayments:40000000,expectedSalesLessPayments:80000000,date,
  limitations:['Fabricated values and identity only.','Does not cover external banks, OTP, Zalo delivery, tax/legal correctness or billing API.','Data consistency is checked separately from UI speed.']};
 return fixture;
}
