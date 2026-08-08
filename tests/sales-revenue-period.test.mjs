import assert from 'node:assert/strict';
import {
  calculateEmployeeSalesRevenueForMonth,
  getSalesOrderMonthKey,
  normalizeSalesRevenueMonthKey,
  summarizeEmployeeSalesRevenueForMonth
} from '../src/utils/salesRevenuePeriod.js';

const customers = [
  { id: 'customer-a', empId: 'sales-a' },
  { id: 'customer-b', empId: 'sales-b' }
];

const orders = [
  { id: 'jul-a-1', customerId: 'customer-a', date: '2026-07-31', amount: 1_000_000 },
  { id: 'aug-a-1', customerId: 'customer-a', date: '2026-08-01', amount: 2_000_000 },
  { id: 'aug-a-2', customerId: 'customer-a', date: '2026-08-20T10:00:00+07:00', amount: 3_000_000 },
  { id: 'aug-b-1', customerId: 'customer-b', date: '2026-08-02', amount: 4_000_000 },
  { id: 'aug-direct', customerId: 'customer-b', salesEmpId: 'sales-a', date: '2026-08-03', amount: 500_000 },
  { customerId: 'customer-a', date: '2026-08-05', amount: 250_000 },
  { id: 'aug-archived', customerId: 'customer-a', date: '2026-08-04', amount: 9_000_000, isArchived: true },
  { id: 'sep-a-1', customerId: 'customer-a', date: '2026-09-01', amount: 7_000_000 }
];

assert.equal(normalizeSalesRevenueMonthKey('2026-08-15'), '2026-08');
assert.equal(normalizeSalesRevenueMonthKey('2026-13-01'), '');
assert.equal(getSalesOrderMonthKey({ date: '2026-07-31T23:59:59+07:00' }), '2026-07');

assert.equal(calculateEmployeeSalesRevenueForMonth({
  employeeId: 'sales-a', orders, customers, monthKey: '2026-07'
}), 1_000_000);

const august = summarizeEmployeeSalesRevenueForMonth({
  employeeId: 'sales-a', orders, customers, monthKey: '2026-08'
});
assert.equal(august.revenue, 5_750_000);
assert.equal(august.orderCount, 4);
assert.equal(august.customerCount, 2);
assert.deepEqual(august.orderIds, ['aug-a-1', 'aug-a-2', 'aug-direct']);

assert.equal(calculateEmployeeSalesRevenueForMonth({
  employeeId: 'sales-a', orders, customers, monthKey: '2026-09'
}), 7_000_000);
assert.equal(calculateEmployeeSalesRevenueForMonth({
  employeeId: 'sales-b', orders, customers, monthKey: '2026-08'
}), 4_000_000);
assert.equal(calculateEmployeeSalesRevenueForMonth({
  employeeId: 'sales-a', orders, customers, monthKey: 'invalid'
}), 0);

console.log('Sales revenue period tests passed.');
