import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeVpsCustomer, normalizeVpsProduct, normalizeVpsOrder, normalizeVpsPayment, normalizeVpsFinanceExpense, normalizeVpsAttendance } from '../src/api/hdConnectStaging.js';

const marker = { sourceRecordId: 'legacy-original', historicalOnly: true };
test('native master IDs stay canonical while original identity, archive and category/unit labels remain visible', () => {
  const customer = normalizeVpsCustomer({ id: 'native-customer', companyId: 'tenant', status: 'ARCHIVED', attributes: { __hdcoProjection: marker, customBusinessField: 3 } });
  assert.equal(customer.id, 'native-customer'); assert.equal(customer.legacySourceId, 'legacy-original'); assert.equal(customer.isArchived, true); assert.equal(customer.customBusinessField, 3);
  const product = normalizeVpsProduct({ id: 'native-product', companyId: 'tenant', category: { id: 'native-category', name: 'Category' }, metadata: { __hdcoProjection: marker, unit: 'Con', stockUnit: 'Kg', isArchived: true } });
  assert.equal(product.category, 'Category'); assert.equal(product.unit, 'Con'); assert.equal(product.stockUnit, 'Kg'); assert.equal(product.isArchived, true); assert.equal(product.unitId, '');
});
test('historical order lines retain independent quantity/weight, billing facts, exact reference and unknown unit', () => {
  const order = normalizeVpsOrder({ id: 'native-order', companyId: 'tenant', customerId: 'native-customer', orderDate: '2026-07-01T00:00:00Z', status: 'CONFIRMED', metadata: { __hdcoProjection: marker, date: '2026-07-01', reviewStatus: 'approved', isArchived: true }, lines: [{ id: 'native-line', productId: 'native-product', quantity: '2.5', unitPrice: '100', unitId: null, metadata: { weightKg: 6.25, sourceQuantity: 2.5, billingWeightKg: 6.25, originalField: 'kept' } }] });
  assert.equal(order.customerId, 'native-customer'); assert.equal(order.date, '2026-07-01'); assert.equal(order.reviewStatus, 'approved'); assert.equal(order.isArchived, true);
  assert.equal(order.items[0].productId, 'native-product'); assert.equal(order.items[0].quantity, 2.5); assert.equal(order.items[0].weightKg, 6.25); assert.equal(order.items[0].billingWeightKg, 6.25); assert.equal(order.items[0].unit, ''); assert.equal(order.items[0].originalField, 'kept');
});
test('payment references use native mapped targets without dropping original approval and archive facts', () => {
  const payment = normalizeVpsPayment({ id: 'p', companyId: 'tenant', customerTargetId: 'native-customer', salesOrderTargetId: 'native-order', externalReference: 'external', amount: '100.25', metadata: { __hdcoProjection: marker, isArchived: true, handoverStatus: 'pending', approvalStatus: 'pending' } });
  assert.equal(payment.customerId, 'native-customer'); assert.equal(payment.matchedOrderId, 'native-order'); assert.equal(payment.reference, 'external'); assert.equal(payment.handoverStatus, 'pending'); assert.equal(payment.isArchived, true); assert.equal(payment.amount, 100.25); assert.equal(payment.readOnly, true);
});

test('historical payment eligibility is not replaced by migration reconciliation status', () => {
  const payment = normalizeVpsPayment({ id: 'p', companyId: 'tenant', status: 'RECONCILIATION_REQUIRED', reconciliationStatus: 'RECONCILIATION_REQUIRED', metadata: { __hdcoProjection: marker, requiresApproval: true, isPaymentIntent: true, status: 'pending', settlementStatus: 'unpaid', reconciliationStatus: 'processing', createdByRole: 'driver' } });
  assert.equal(payment.requiresApproval, true);
  assert.equal(payment.isPaymentIntent, true);
  assert.equal(payment.status, 'pending');
  assert.equal(payment.settlementStatus, 'unpaid');
  assert.equal(payment.reconciliationStatus, 'processing');
  assert.equal(payment.projectionReconciliationStatus, 'RECONCILIATION_REQUIRED');
  assert.equal(payment.createdByRole, 'driver');
  const noLegacyStatus = normalizeVpsPayment({ id: 'p2', companyId: 'tenant', status: 'approved', metadata: { __hdcoProjection: marker } });
  assert.equal(noLegacyStatus.status, '');
});
test('historical expenses preserve confirmed handover without pretending they were posted again', () => {
  const expense = normalizeVpsFinanceExpense({ id: 'e', amount: '30.50', status: 'APPROVED', expenseDate: '2026-07-01T00:00:00Z', metadata: { __hdcoProjection: { ...marker, references: { employee: 'native-employee' } }, approvalStatus: 'approved', handoverStatus: 'confirmed', sourceWarehouseImportId: 'original-import', isArchived: true } });
  assert.equal(expense.empId, 'native-employee'); assert.equal(expense.handoverStatus, 'confirmed'); assert.equal(expense.status, 'APPROVED'); assert.equal(expense.isArchived, true); assert.equal(expense.readOnly, true); assert.equal(expense.sourceWarehouseImportId, 'original-import');
});
test('attendance keeps source annotations and unknown worked minutes', () => {
  const attendance = normalizeVpsAttendance({ id: 'a', companyId: 'tenant', employeeId: 'native-employee', workDate: '2026-07-01T00:00:00Z', status: 'LEAVE', workedMinutes: null, metadata: { leaveReason: 'Synthetic annotation' } });
  assert.equal(attendance.employeeId, 'native-employee'); assert.equal(attendance.leaveReason, 'Synthetic annotation'); assert.equal(attendance.workedMinutes, null); assert.equal(attendance.status, 'leave');
});
