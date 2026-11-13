// Read scopes for EXISTING screens. No role-name inference, financial totals,
// mutation permission or alternative business rule is introduced here.
import {normalizeSearchText} from '../services/searchEngine.js';
const common=['companyId','date','status','customerId','customerName','empId','createdByEmpId','isArchived','note'];
const warehouse=[...common,'productId','productName','productNameSnapshot','supplierName','warehouseId','warehouseName','branchId','branchName','sourceOrderRequestId','orderId','quantity','pieceCount','totalQuantity','totalKg','weightKg','orderedUnit','quantityUnit','unit','pricingUnit','billingUnit','pricingQuantity','billingQuantity','unitPrice','price','amount','totalAmount','lineTotal','pricingAmount','reason'];
export const SCOPED_BUSINESS_SOURCES=Object.freeze({
 orders:{cap:'home.orders.read',module:'orders',action:'view_orders',fields:[...common,'code','orderCode','invoiceCode','salesEmpId','salesEmpName','branchName','total','amount','totalAmount','grandTotal','paymentStatus']},
 payments:{cap:'home.cashflow.read',module:'finance',action:'view_all_cashflow',fields:[...common,'amount','requiresApproval','approvalStatus','handoverStatus','sourceType','createdByRole','isPaymentIntent','paymentIntent','isCustomerDebtPaymentIntent','paymentStatus','settlementStatus','reconciliationStatus','type','orderId','orderCode','method','paymentMethod','paymentProvider','sourceLabel']},
 expenses:{cap:'home.cashflow.read',module:'finance',action:'view_all_cashflow',fields:[...common,'amount','category','requiresApproval','approvalStatus','handoverStatus','sourceType','createdByRole','isPaymentIntent','paymentIntent','isCustomerDebtPaymentIntent','paymentStatus','settlementStatus','reconciliationStatus','type','assetId','relatedDeliveryReportId','method','paymentMethod','paymentProvider','sourceLabel']},
 employees:{cap:'employees.directory.read',module:'employees',action:'view_employees',fields:['companyId','name','displayName','employeeCode','code','phone','address','email','position','department','status','isArchived']},
 deliveryReports:{cap:'deliveryReports.read',module:'delivery_reports',action:'view_delivery_reports',fields:[...warehouse,'dispatchId','warehouseDispatchId','customerNameSnapshot','reviewStatus','resolutionStatus','deliveryStatus','trackingStatus','deliveredAt','driverId','assignedDriverId','driverNameSnapshot','assignedDriverNameSnapshot','expectedWeightKg','actualWeightKg','differenceKg','expectedQuantity','expectedQuantityUnit','actualQuantity','actualQuantityUnit','actualPackageCount','actualPackageUnit','collectedAmount','collectedMethod']},
 warehouseImports:{cap:'home.imports.read',module:'warehouse_import',action:'view_warehouse_import',fields:warehouse},
 warehouseDispatches:{cap:'home.dispatches.read',module:'warehouse_dispatch',action:'view_warehouse_dispatch',fields:[...warehouse,'customerNameSnapshot','assignedDriverId','assignedDriverNameSnapshot','deliveryStatus']},
 warehouseStockCounts:{cap:'home.stock.read',module:'warehouse_import',action:'view_actual_inventory_stock',fields:warehouse},
});
export function scopedSources(capabilities){return Object.entries(SCOPED_BUSINESS_SOURCES).filter(([,s])=>capabilities.includes(s.cap)).map(([name])=>name);}
export function scopedQuery(input={}){
 const allowed=['from','to','text','customerId','employeeId','status','monthKey','limit','cursor','checkpoint','includeCount'];
 if(!input||Array.isArray(input)||Object.keys(input).some(k=>!allowed.includes(k)))throw Error('Invalid module query');
 const q={from:input.from||null,to:input.to||null,text:input.text||'',customerId:input.customerId||null,employeeId:input.employeeId||null,status:input.status||null,monthKey:input.monthKey||null,limit:input.limit??25,cursor:input.cursor||null};
 if(!Number.isInteger(q.limit)||q.limit<1||q.limit>100||typeof q.text!=='string'||q.text.length>128||[q.from,q.to].some(x=>x!==null&&(!/^\d{4}-\d{2}-\d{2}$/.test(x)||new Date(x+'T00:00:00Z').toISOString().slice(0,10)!==x))||[q.customerId,q.employeeId,q.status,q.monthKey,q.cursor].some(x=>x!==null&&(typeof x!=='string'||x.length>8192)))throw Error('Invalid module query');
 return q;
}
export const scopedSearch=document=>{const values=[];const visit=value=>{if(typeof value==='string'||typeof value==='number')values.push(value);else if(value&&typeof value==='object')Object.values(value).forEach(visit);};visit(document);return normalizeSearchText(values.join(' '));};
export function projectScopedDocument(source,document){
 const spec=SCOPED_BUSINESS_SOURCES[source];if(!spec)throw Error('Unknown module source');
 const scalar=v=>v===null||['string','number','boolean'].includes(typeof v);
 const result={id:document.id};for(const key of spec.fields)if(document[key]!==undefined&&scalar(document[key]))result[key]=document[key];
 // Existing order/warehouse details only. Never project arbitrary nested data,
 // employee salary policy, identity/auth fields or payment-provider payloads.
 if(['orders','warehouseImports','warehouseDispatches','warehouseStockCounts'].includes(source))for(const key of ['items','lines','products','measures','countedMeasures','extraMeasures'])if(Array.isArray(document[key])){
  if(document[key].length>1000)throw Error('Module detail exceeds bounded record contract');
  const fields=[...warehouse,'productNameSnapshot','description','name','actualQuantity','actualUnit','orderUnit','unit','expected','actual','countedQuantity','difference','adjustmentQuantity'];
  result[key]=document[key].map(line=>Object.fromEntries(fields.filter(k=>line?.[k]!==undefined&&scalar(line[k])).map(k=>[k,line[k]])));
 }
 return result;
}
