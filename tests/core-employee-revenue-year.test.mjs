import test from 'node:test';
import assert from 'node:assert/strict';
import {getEmployeeRevenueYears,selectEmployeeRevenueYear,selectRevenueDetail} from '../development/hd-manager/application/src/features/business-report/revenueDetailModel.js';
import {buildExecutiveDashboardSnapshot} from '../development/hd-manager/application/src/services/executiveDashboardService.js';
const employee={kind:'employee',id:'a'};
const row=(date,revenue,id='a')=>({date,revenue,id,orderId:date+'-'+id});

test('12 month totals reconcile exactly with annual and monthly invoice drilldowns',()=>{
  const business={salesEmployeeOrders:[row('2026-01-01',10),row('2026-01-31',15),row('2026-02-01',20),row('2026-12-31',30),row('2025-12-31',999),row('2027-01-01',999),row('2026-01-01',999,'b')]};
  const original=JSON.stringify(business);const annual=selectEmployeeRevenueYear(business,employee,'2026','2026-12-31');
  assert.equal(annual.months.length,12);assert.equal(annual.revenue,75);assert.equal(annual.orders,4);
  assert.equal(annual.months[0].revenue,25);assert.equal(annual.months[1].revenue,20);assert.equal(annual.months[11].revenue,30);
  for(const month of annual.months){const detail=selectRevenueDetail(business,employee,month);assert.equal(detail.revenue,month.revenue);assert.equal(detail.rows.length,month.orders);}
  assert.equal(selectRevenueDetail(business,employee,{startDate:'2026-01-01',endDate:'2026-12-31'}).revenue,annual.revenue);
  assert.equal(JSON.stringify(business),original);
});
test('snapshot reporting date excludes future invoices and marks future months without inventing revenue',()=>{
  const business={salesEmployeeOrders:[row('2026-11-28',100),row('2026-11-29',200),row('2026-12-01',300)]};
  const annual=selectEmployeeRevenueYear(business,employee,2026,'2026-11-28');assert.equal(annual.revenue,100);assert.equal(annual.orders,1);
  assert.equal(annual.months[10].endDate,'2026-11-28');assert.equal(annual.months[10].future,false);assert.equal(annual.months[11].future,true);assert.equal(annual.months[11].revenue,0);
  assert.equal(selectRevenueDetail(business,employee,annual.months[10]).revenue,100);
});
test('leap days, historical December, empty months and invalid dates stay isolated',()=>{
  const business={salesEmployeeOrders:[row('2024-02-29',100),row('2024-02-30',999),row('2024-12-31',300),row('2025-02-29',999),row('2024-11-28Z',999)]};
  const annual=selectEmployeeRevenueYear(business,employee,2024,'2026-11-28');assert.equal(annual.months[1].endDate,'2024-02-29');assert.equal(annual.revenue,400);assert.equal(annual.orders,2);assert.equal(annual.months[0].orders,0);assert.ok(annual.months.every(m=>!m.future));
  assert.equal(selectEmployeeRevenueYear(business,employee,2025,'2026-11-28').revenue,0);
  for(const month of annual.months)assert.equal(selectRevenueDetail(business,employee,month).revenue,month.revenue);
});
test('year choices use only the selected employee and verified reporting date',()=>{
  const business={salesEmployeeOrders:[row('2024-01-01',1),row('2023-01-01',1,'b'),row('2027-01-01',1),row('invalid',1)]};
  assert.deepEqual(getEmployeeRevenueYears(business,employee,'2026-11-28','2025'),['2026','2025','2024']);
  assert.deepEqual(getEmployeeRevenueYears(business,employee,'2026-11-28','2027'),['2026','2024']);
  assert.deepEqual(getEmployeeRevenueYears(business,{kind:'customer',id:'a'},'2026-11-28'),[]);
  assert.equal(selectEmployeeRevenueYear(business,null,'2026','2026-11-28'),null);assert.equal(selectEmployeeRevenueYear(business,employee,'bad','2026-11-28'),null);assert.equal(selectEmployeeRevenueYear(business,employee,'2026','bad'),null);
});
test('annual view retains canonical attribution, discounted totals, archived order filtering and negative adjustments',()=>{
  const snapshot=buildExecutiveDashboardSnapshot({now:'2026-11-28T12:00:00',employees:[{id:'a',name:'Sales',position:'Kinh doanh'},{id:'b',name:'Sales',position:'Kinh doanh'}],customers:[{id:'c',name:'Customer',salesEmpId:'a'},{id:'c2',name:'Customer',salesEmpId:'b'}],orders:[
    {id:'net',date:'2026-01-01',customerId:'c',salesEmpId:'a',amount:900,subTotal:1000,discount:100},
    {id:'other',date:'2026-02-01',customerId:'c2',salesEmpId:'b',amount:700},
    {id:'archived',date:'2026-02-01',customerId:'c',salesEmpId:'a',amount:999,isArchived:true}
  ]});
  const annual=selectEmployeeRevenueYear(snapshot.business,employee,2026,'2026-11-28');assert.equal(annual.revenue,900);assert.equal(annual.orders,1);
  assert.equal(selectEmployeeRevenueYear(snapshot.business,{...employee,id:'b'},2026,'2026-11-28').revenue,700);
  const adjusted={salesEmployeeOrders:[row('2026-01-01',100),row('2026-02-01',-20)]};assert.equal(selectEmployeeRevenueYear(adjusted,employee,2026,'2026-11-28').revenue,80);
});
