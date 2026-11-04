import test from'node:test';import assert from'node:assert/strict';
import{makeRichSyntheticFixture}from'../performance/upgrade-20261103/rich-synthetic-fixture.mjs';
import{buildProductStockBalanceIndex,productStockBalance}from'../src/utils/productMeasures.js';
test('linked synthetic business workload has exact stock movements, one payment per order and no duplicated dispatch',()=>{
 const{data,workload}=makeRichSyntheticFixture(),used=new Set();let sales=0,paid=0;
 assert.equal(Object.keys(data.orders).length,2000);assert.equal(Object.keys(data.warehouseDispatches).length,6000);
 for(const order of Object.values(data.orders)){assert.equal(order.items.length,3);assert.equal(order.items.reduce((sum,item)=>sum+item.quantity*item.unitPrice,0),order.amount);sales+=order.amount;
  for(const dispatchId of order.sourceDispatchIds){assert.equal(used.has(dispatchId),false);used.add(dispatchId);assert.equal(data.warehouseDispatches[dispatchId].linkedOrderId,order.id)}
 }
 for(const payment of Object.values(data.payments)){assert.equal(data.orders[payment.orderId].customerId,payment.customerId);paid+=payment.amount}
 assert.equal(sales,workload.expectedSalesAmount);assert.equal(paid,workload.expectedPayments);assert.equal(sales-paid,workload.expectedSalesLessPayments);
 const products=Object.values(data.products),imports=Object.values(data.warehouseImports),dispatches=Object.values(data.warehouseDispatches),index=buildProductStockBalanceIndex(products,imports,dispatches);
 for(const product of products){assert.deepEqual(index.get(product),productStockBalance(product,imports,dispatches));assert.equal(index.get(product).remaining,1088)}
 for(const expense of Object.values(data.expenses))if(expense.sourceWarehouseImportId)assert.equal(data.warehouseImports[expense.sourceWarehouseImportId].amount,expense.amount);
 for(const log of Object.values(data.assetCostLogs)){assert.ok(data.assets[log.assetId]);assert.equal(data.expenses[log.expenseId].sourceAssetCostLogId,log.id)}
});
