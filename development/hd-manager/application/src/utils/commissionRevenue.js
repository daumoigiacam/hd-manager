import {getSalesOrderEmployeeId,getSalesOrderMonthKey} from './salesRevenuePeriod.js';
import {buildCustomerReconciledLedger,getPaymentDateKey} from '../features/payroll/payrollOriginalShared.js';
import {calculateCommissionPolicy,normalizeCommissionPolicy} from './commissionPolicy.js';

const invalidStatuses=new Set(['cancelled','canceled','rejected','reversed','voided','deleted']);
const confirmedReviews=new Set(['confirmed','completed','approved','approved_for_zalo']);
const cache=new WeakMap();
function unique(rows,companyId,label,blockers) {
  const map=new Map();
  for(const row of rows||[]){
    if(!row||row.companyId!==companyId||row.isArchived)continue;
    if(!row.id){blockers.push(`${label} thiếu ID nguồn.`);continue;}
    if(map.has(row.id)&&JSON.stringify(map.get(row.id))!==JSON.stringify(row)){blockers.push(`${label} ${row.id}: có các phiên bản xung đột.`);continue;}
    map.set(row.id,row);
  }
  return [...map.values()];
}
export function reconcileCommissionRevenue({employee,policy,orders=[],customers=[],payments=[],monthKey}) {
  const config=normalizeCommissionPolicy(policy),companyId=employee?.companyId;
  if(!companyId||!employee.id||!/^\d{4}-(0[1-9]|1[0-2])$/.test(monthKey||''))throw Error('Thiếu phạm vi công ty, nhân viên hoặc kỳ hoa hồng.');
  let byCustomers=cache.get(orders);if(!byCustomers){byCustomers=new WeakMap();cache.set(orders,byCustomers);}
  let byPayments=byCustomers.get(customers);if(!byPayments){byPayments=new WeakMap();byCustomers.set(customers,byPayments);}
  let entries=byPayments.get(payments);if(!entries){entries=new Map();byPayments.set(payments,entries);}
  const key=JSON.stringify([companyId,employee.id,monthKey,config.revenueBasis]);
  if(entries.has(key))return entries.get(key);
  const blockers=[],rows=[],excluded=[];
  const customerRows=unique(customers,companyId,'Khách hàng',blockers),customerById=new Map(customerRows.map(row=>[row.id,row]));
  const rawOrders=unique(orders,companyId,'Đơn hàng',blockers),accepted=[];
  for(const order of rawOrders){
    const mine=getSalesOrderEmployeeId(order,customerById)===employee.id,inMonth=getSalesOrderMonthKey(order)===monthKey;
    let reason='';
    if(order.isReversed===true||invalidStatuses.has(String(order.status||'').toLowerCase())||invalidStatuses.has(String(order.reviewStatus||'').toLowerCase()))reason='Đã hủy/đảo';
    else if(!confirmedReviews.has(order.reviewStatus))reason='Chưa xác nhận doanh thu';
    else if(order.returnFinancialStatus==='BUSINESS_RULE_REQUIRED'||((Number(order.returnTransactionCount)>0||[...(order.returnGoods||[]),...(order.returnedGoods||[])].some(row=>row&&!row.isArchived))&&order.returnFinancialStatus!=='CONFIRMED')){
      reason='Hàng trả chưa có xác nhận điều chỉnh tiền';
      if(mine&&(inMonth||config.revenueBasis==='collected'))blockers.push(`Đơn ${order.id}: ${reason}.`);
    }else if(!Number.isSafeInteger(Number(order.amount))||Number(order.amount)<0){
      reason='Số tiền chứng từ chưa hợp lệ';if(mine&&inMonth)blockers.push(`Đơn ${order.id}: ${reason}.`);
    }
    if(reason){if(mine&&inMonth)excluded.push({orderId:order.id,reason});continue;}
    accepted.push(order);
    // order.amount is already net of discount in OrderManagementView.
    // Never subtract discount or returned quantity a second time.
    if(config.revenueBasis==='recognized_net'&&mine&&inMonth)rows.push({orderId:order.id,customerId:order.customerId,employeeId:employee.id,date:order.date,amount:Number(order.amount),discount:Number(order.discount)||0,revision:order.updatedAt||order.createdAt||null,source:'orders.amount'});
  }
  if(config.revenueBasis==='collected'){
    const paymentRows=unique(payments,companyId,'Phiếu thu',blockers).filter(row=>!row.isReversed&&!invalidStatuses.has(String(row.status||'').toLowerCase()));
    const orderById=new Map(accepted.map(row=>[row.id,row]));
    // Use the existing official payment allocator, including matched-order,
    // oldest-first and opening-debt rules. No second allocation algorithm.
    for(const customer of customerRows){
      if(!accepted.some(row=>row.customerId===customer.id&&getSalesOrderEmployeeId(row,customerById)===employee.id))continue;
      if(paymentRows.some(payment=>payment.customerId===customer.id&&getPaymentDateKey(payment).slice(0,7)===monthKey&&payment.matchedOrderId&&!rawOrders.some(order=>order.id===payment.matchedOrderId)))blockers.push(`Khách ${customer.id}: thiếu đơn nguồn của phiếu thu đã khớp; cần tải/đối soát đủ lịch sử.`);
      const ledger=buildCustomerReconciledLedger(customer,rawOrders,paymentRows);
      if(ledger.orders.some(order=>order.creditApplied>0&&orderById.has(order.id)&&getSalesOrderEmployeeId(order,customerById)===employee.id))blockers.push(`Khách ${customer.id}: tiền thu trước chưa có phân bổ về phiếu thu nguồn; cần đối soát trước khi tính hoa hồng thực thu.`);
      for(const payment of ledger.payments){
        const paymentDate=getPaymentDateKey(payment);if(paymentDate.slice(0,7)!==monthKey)continue;
        for(const allocation of payment.allocations||[]){
          const order=orderById.get(allocation.orderId);
          if(!order||order.isOpeningDebt||getSalesOrderEmployeeId(order,customerById)!==employee.id)continue;
          rows.push({orderId:order.id,paymentId:payment.id,customerId:customer.id,employeeId:employee.id,date:paymentDate,amount:allocation.amount,source:'payments.allocations',revision:payment.updatedAt||payment.createdAt||null});
        }
      }
    }
  }
  const revenue=rows.reduce((sum,row)=>sum+row.amount,0);
  if(!Number.isSafeInteger(revenue))blockers.push('Tổng doanh thu chưa ở độ chính xác tiền đồng an toàn.');
  const result=Object.freeze({ready:blockers.length===0,revenue,companyId,employeeId:employee.id,monthKey,revenueBasis:config.revenueBasis,rows,excluded,blockers:[...new Set(blockers)]});
  if(entries.size>=128)entries.clear();entries.set(key,result);return result;
}

export function buildCommissionCalculation({employee,orders,customers,payments,monthKey}) {
  if(!employee?.commissionPolicy)return null;
  try{
    const policy=normalizeCommissionPolicy(employee.commissionPolicy);
    // A draft is stored separately; never replace the active calculation.
    const inactive=policy.status!=='active'||monthKey<policy.effectiveFrom.slice(0,7)||(policy.effectiveTo&&monthKey>policy.effectiveTo.slice(0,7));
    const evidence=inactive?{ready:true,revenue:0,rows:[],excluded:[],blockers:[]}:reconcileCommissionRevenue({employee,policy,orders,customers,payments,monthKey});
    const calculation=calculateCommissionPolicy(policy,evidence.revenue,{monthKey});
    return {...calculation,actualRevenue:inactive?null:calculation.actualRevenue,revenueNotEvaluated:inactive,ready:evidence.ready,commission:evidence.ready?calculation.commission:0,sourceEvidence:evidence,policy};
  }catch(error){return {schemaVersion:2,ready:false,commission:0,rows:[],sourceEvidence:{ready:false,rows:[],excluded:[],blockers:[error.message]}};}
}

export function assertCommissionCalculationReady(details,employeeId) {
  if(details?.commissionCalculation?.ready===false)throw Error(`Chưa đối soát hoa hồng ${employeeId}: ${(details.commissionCalculation.sourceEvidence?.blockers||[]).join(' ')}`);
}
