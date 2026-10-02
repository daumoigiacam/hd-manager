import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const evidence = JSON.parse(readFileSync(new URL('../test-results/critical-business-audit/summary.json', import.meta.url), 'utf8'));
const report = readFileSync(new URL('../docs/reports/HD-Manager-Performance-Audit.html', import.meta.url), 'utf8');

test('critical business evidence covers all requested modules and dataset sizes', () => {
  assert.deepEqual(evidence.datasetSizes, [100, 1_000, 10_000, 50_000]);
  assert.deepEqual(
    [...new Set(evidence.moduleBenchmarks.map((row) => row.module))].sort(),
    ['orderRequests', 'orders', 'warehouseDispatches']
  );
  assert.equal(evidence.moduleBenchmarks.length, 12);
  for (const row of evidence.moduleBenchmarks) {
    assert.ok(row.serializedBytes > 0);
    assert.equal(row.operations.length, 7);
    for (const operation of row.operations) {
      assert.ok(Number.isFinite(operation.p50Ms));
      assert.ok(Number.isFinite(operation.p95Ms));
      assert.match(operation.checksum, /^[a-f0-9]{16}$/);
    }
  }
});

test('audit preserves integrity blockers instead of claiming unsupported PASS', () => {
  assert.equal(evidence.idempotency.pass, true);
  assert.equal(evidence.sourceEvidence.orderAwaitsAtomicServerConfirmation, true);
  assert.equal(evidence.sourceEvidence.warehouseDispatchUsesStockTransaction, false);
  assert.equal(evidence.sourceEvidence.warehouseDispatchChecksAvailableStock, false);
  assert.equal(evidence.sourceEvidence.tenantReadsHaveCursorPagination, false);
  assert.equal(evidence.sourceEvidence.centralizedOrderRequestTransitionGuard, false);
  assert.equal(evidence.acceptance.final, 'NOT PASS');
  assert.equal(evidence.acceptance.warehouseDispatch, 'NOT PASS');
});

test('HTML report contains every required deep-audit section and honest load status', () => {
  const headings = [
    'Critical Business Module Deep Audit',
    'Xuất kho',
    'Đơn đặt hàng',
    'Đơn hàng',
    'Cross-module Workflow',
    'Concurrency',
    'Idempotency',
    'Inventory Integrity',
    'Large Dataset',
    'Mobile Performance',
    'Load Test',
    'Bottlenecks',
    'Before/After',
    'Final Status',
  ];
  for (const heading of headings) assert.match(report, new RegExp(`>${heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}<`));
  assert.match(report, /100 \/ 250 \/ 500 \/ 750 \/ 1\.000 concurrent users: NOT RUN/);
  assert.match(report, /FINAL STATUS: NOT PASS/);
  assert.match(report, /CRITICAL-BUSINESS-AUDIT:START/);
  assert.match(report, /CRITICAL-BUSINESS-AUDIT:END/);
});
