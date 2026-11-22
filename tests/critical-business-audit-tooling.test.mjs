import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import test,{after} from 'node:test';
import {createLegacyAuditFixture,legacyAuditScope} from './helpers/legacy-audit-fixture.mjs';
// Current financial behavior is a separate canonical gate, never inferred
// from the legacy source flags or the synthetic benchmark's timings.
import '../development/hd-manager/application/tests/manual-order-integrity.test.mjs';

const fixture=await createLegacyAuditFixture();after(fixture.dispose);
await fixture.run('scripts/audit-critical-business-modules.mjs');
await mkdir(path.join(fixture.directory,'docs/reports'),{recursive:true});
await writeFile(path.join(fixture.directory,'docs/reports/HD-Manager-Performance-Audit.html'),'<!doctype html><main></main>');
await fixture.run('scripts/report-critical-business-audit.mjs');
const evidence=JSON.parse(await fixture.read('test-results/critical-business-audit/summary.json'));
const report=await fixture.read('docs/reports/HD-Manager-Performance-Audit.html');
const classification=JSON.parse(await fixture.read('test-results/harness-scope.json'));

test('legacy audit generator fixture is explicitly outside canonical Firebase acceptance',()=>{
  assert.equal(classification.scope,legacyAuditScope);
  assert.equal(evidence.scope.productionAccess,false);
  assert.match(evidence.scope.notMeasured,/Authenticated API latency/);
});

test('legacy-root tooling: generated synthetic evidence covers all requested modules and dataset sizes', () => {
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

test('legacy-root tooling: audit preserves integrity blockers instead of claiming unsupported PASS', () => {
  assert.equal(evidence.idempotency.pass, true);
  assert.equal(evidence.sourceEvidence.orderAwaitsAtomicServerConfirmation, false,
    'The checked-in legacy handler lacks the canonical exact atomic receipt check');
  assert.equal(evidence.sourceEvidence.warehouseDispatchUsesStockTransaction, false);
  assert.equal(evidence.sourceEvidence.warehouseDispatchChecksAvailableStock, false);
  assert.equal(evidence.sourceEvidence.tenantReadsHaveCursorPagination, false);
  assert.equal(evidence.sourceEvidence.centralizedOrderRequestTransitionGuard, false);
  assert.equal(evidence.acceptance.final, 'NOT PASS');
  assert.equal(evidence.acceptance.warehouseDispatch, 'NOT PASS');
});

test('legacy-root tooling: generated HTML contains every required deep-audit section and honest load status', () => {
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
