export const HOME_FEED_SOURCES=Object.freeze(['companies','employees','customers','orders','payments','expenses','financials','attendance','performance','payrollPeriods','payrollSnapshots','products','warehouseImports','warehouseDispatches','warehouseStockCounts','holidays','deliveryReports','employeeReviews','customerComplaints','assets','assetCostLogs','advances','orderRequests']);
// A native backup is a different source schema, not a legacy accounting projection.
export const NATIVE_HOME_SOURCES=Object.freeze(['companies','nativeUsers','nativeCustomers','nativeProducts','nativeOrders','nativeOrderLines','nativeCashTransactions','nativeStockLedger','nativeStockBalances','nativeOrderRequests','nativeOrderRequestLines','nativeAuthorizations']);
export const PAYROLL_FEED_ADDITIONS=Object.freeze(['payrollDebtCarryovers','payrollAdjustments']);
export const PAYROLL_HOME_FEED_SOURCES=Object.freeze([...HOME_FEED_SOURCES,...PAYROLL_FEED_ADDITIONS]);
export function homeFeedSources(profile,advertised){
 if(profile===undefined||profile==='legacy-v1'){if(Array.isArray(advertised)&&advertised.length===PAYROLL_HOME_FEED_SOURCES.length&&PAYROLL_HOME_FEED_SOURCES.every(s=>advertised.includes(s)))return PAYROLL_HOME_FEED_SOURCES;return HOME_FEED_SOURCES;}
 if(profile==='native-isolation-v1')return NATIVE_HOME_SOURCES;
 throw Error('Unknown Home source profile');
}
// Home uses requests only for archived/cancelled filters and delivery signatures.
// Product/quantity/unit details continue to read the original full SQLite row.
export const HOME_REQUEST_CALCULATION_FIELDS=Object.freeze(['id','companyId','archived','isArchived','deleted','isDeleted','status','customerId','customerName','name','productId','productName','product','itemName','date','orderDate','requestDate','dispatchDate','importDate','paymentDate','expenseDate','createdAt','updatedAt','timestamp']);
export function homeCalculationBodySql(profile){
 if(profile==='native-isolation-v1')return 'body';
 return "CASE WHEN source='orderRequests' THEN json_object("+HOME_REQUEST_CALCULATION_FIELDS.map(key=>"'"+key+"',json_extract(body,'$."+key+"')").join(',')+") ELSE body END";
}
