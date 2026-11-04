import test from 'node:test';import assert from 'node:assert/strict';
import {getForegroundReadCollections,COMPANY_HOME_PRIMARY_COLLECTIONS,PERSONAL_HOME_COLLECTIONS,isCompanyPrimaryHomeReadPlan} from '../src/services/homeDataContract.js';
import {planForegroundRealtimeActivation} from '../src/services/realtimeListenerPlanner.js';
const byTab={home:['orders','warehouseDispatches'],executive_dashboard:['orders','warehouseDispatches','assets'],orders:['orders','payments']};
test('primary Home keeps all financial/payroll dependencies and excludes deep dispatch history',()=>{
 const plan=getForegroundReadCollections('home',{companyHome:true,primaryHome:true,byTab});assert.equal(plan,COMPANY_HOME_PRIMARY_COLLECTIONS);assert.ok(Object.isFrozen(plan));
 for(const name of ['orders','payments','expenses','warehouseImports','payrollPeriods','attendance','financials','performance','employeeReviews','customerComplaints','holidays','deliveryReports'])assert.ok(plan.includes(name),name);
 for(const name of ['products','warehouseDispatches','warehouseStockCounts','assets','assetCostLogs','orderRequests'])assert.ok(!plan.includes(name),name);
});
test('only explicit details demand widens Home; feature fallback and personal plans retain their original contracts',()=>{
 assert.equal(getForegroundReadCollections('home',{companyHome:true,primaryHome:true,detailsRequested:true,byTab}),byTab.executive_dashboard);
 assert.equal(getForegroundReadCollections('home',{companyHome:true,byTab}),byTab.home);
 assert.equal(getForegroundReadCollections('home',{companyHome:false,primaryHome:true,detailsRequested:true,byTab}),PERSONAL_HOME_COLLECTIONS);
 assert.equal(getForegroundReadCollections('orders',{companyHome:true,primaryHome:true,byTab}),byTab.orders);
});
test('current route demand evicts previous-only listeners while sharing one existing orders listener',()=>{
 const plan=planForegroundRealtimeActivation({requestedNames:['orders','payments'],activeNames:['orders','products','warehouseDispatches'],recentNames:['assets'],limit:8,retainRecent:false});
 assert.deepEqual(plan.liveNames,['orders','payments']);assert.deepEqual(plan.evictedNames,['products','warehouseDispatches']);assert.deepEqual(plan.overflowNames,[]);
});
test('native primary admission preserves every required source and overlaps imports through the existing REST lane',()=>{
 const names=COMPANY_HOME_PRIMARY_COLLECTIONS;
 assert.equal(isCompanyPrimaryHomeReadPlan(names),true);
 assert.equal(isCompanyPrimaryHomeReadPlan([...names.slice(1),names[1]]),false);
 const plan=planForegroundRealtimeActivation({requestedNames:names,limit:7,retainRecent:false});
 assert.ok(plan.overflowNames.includes('warehouseImports'));
 assert.deepEqual([...plan.liveNames,...plan.overflowNames],names);
 assert.equal(new Set([...plan.liveNames,...plan.overflowNames]).size,13);
});
