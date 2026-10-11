import test from 'node:test';
import assert from 'node:assert/strict';
import { buildExecutiveDashboardSnapshot } from '../src/services/executiveDashboardService.js';
import { getReportPeriod, getTopSalesEmployees } from '../src/features/business-report/reportViewModel.js';
import { selectRevenueDetail } from '../src/features/business-report/revenueDetailModel.js';

test('drilldown uses ranking attribution and does not merge same-name customers', () => {
  const snapshot = buildExecutiveDashboardSnapshot({
    now: '2026-10-11T12:00:00',
    employees: [{ id: 'e', name: 'Sales', position: 'Kinh doanh' }],
    customers: [{ id: 'a', name: 'Same', salesEmpId: 'e' }, { id: 'b', name: 'Same', salesEmpId: 'e' }],
    orders: [
      { id: 'one', code: 'HD1', date: '2026-10-11', customerId: 'a', salesEmpId: 'e', amount: 100 },
      { id: 'two', date: '2026-10-11', customerId: 'b', salesEmpId: 'e', amount: 200 },
      { id: 'old', date: '2026-10-10', customerId: 'a', salesEmpId: 'e', amount: 300 },
      { id: 'deleted', date: '2026-10-11', customerId: 'a', amount: 900, isArchived: true },
    ],
  });
  const report = getReportPeriod(snapshot.finance, 'today');
  const customer = selectRevenueDetail(snapshot.business, { kind: 'customer', id: 'a' }, report);
  assert.equal(customer.revenue, 100);
  assert.deepEqual(customer.rows.map(row => row.orderId), ['one']);
  assert.equal(customer.rows[0].orderCode, 'HD1');
  const employee = selectRevenueDetail(snapshot.business, { kind: 'employee', id: 'e' }, report);
  assert.equal(employee.revenue, getTopSalesEmployees(snapshot.business, snapshot.finance, 'today')[0].revenue);
  assert.equal(employee.rows.length, 2);
  assert.equal(employee.rows[0].salesEmployeeName, 'Sales');
  assert.equal(selectRevenueDetail(snapshot.business, { kind: 'customer', id: 'missing' }, report).rows.length, 0);
});

test('period boundaries, refreshed snapshot and empty selection stay isolated', () => {
  const rows = [{id:'a',date:'2026-10-01',revenue:1},{id:'a',date:'2026-10-02',revenue:2},{id:'b',date:'2026-10-02',revenue:9}];
  const business = { customerPerformanceRows: rows };
  const report = { startDate:'2026-10-01',endDate:'2026-10-02' };
  assert.equal(selectRevenueDetail(business, {kind:'customer',id:'a'}, report).revenue, 3);
  assert.equal(rows[0].date, '2026-10-01');
  assert.equal(selectRevenueDetail({customerPerformanceRows:rows.slice(1)}, {kind:'customer',id:'a'}, report).revenue, 2);
  assert.equal(selectRevenueDetail(business, null, report).revenue, 0);
});
