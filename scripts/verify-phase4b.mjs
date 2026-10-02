import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
const packageRequire = createRequire(import.meta.url);
const eslintCli = path.join(path.dirname(packageRequire.resolve('eslint/package.json')), 'bin/eslint.js');
const checks = [
  ['inventory-unit', ['--test', 'tests/inventory-reconciliation.test.cjs', 'tests/inventory-backfill.test.cjs', 'tests/inventory-transaction-concurrency.test.cjs']],
  ['phase4b-lint', [eslintCli, 'functions/inventoryReconciliation.js', 'functions/inventoryBackfill.js', 'tests/inventory-reconciliation.test.cjs', 'tests/inventory-backfill.test.cjs', 'tests/firestore-inventory-backfill.test.cjs', 'scripts/reconcile-inventory.cjs', 'scripts/report-phase4b-audit.mjs', 'scripts/verify-phase4b.mjs']],
];
const results = [];
for (const [name, args] of checks) {
  const startedAt = new Date().toISOString();
  const result = spawnSync(process.execPath, args, { encoding: 'utf8', stdio: 'pipe' });
  process.stdout.write(result.stdout || '');
  process.stderr.write(result.stderr || '');
  results.push({ name, startedAt, exitCode: result.status, status: result.status === 0 ? 'PASS' : 'FAIL' });
}
mkdirSync('test-results/phase4b', { recursive: true });
writeFileSync('test-results/phase4b/checks.json', JSON.stringify(results, null, 2));
if (results.some(row => row.status !== 'PASS')) process.exitCode = 1;
