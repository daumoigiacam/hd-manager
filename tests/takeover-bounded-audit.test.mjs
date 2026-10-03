import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { auditTimeout, runBoundedAudit } from '../scripts/helpers/bounded-audit-process.mjs';

test('audit deadlines cannot be infinite, disabled or exceed fifteen minutes', () => {
  assert.equal(auditTimeout(), 300000);
  for (const value of [0, -1, Infinity, NaN, 900001, 1.1, 'invalid']) assert.throws(() => auditTimeout(value));
});

for (const [name, source, expected] of [
  ['complete', 'process.exit(0)', 0],
  ['IPC listener released', 'process.on("message", () => {}); process.disconnect();', 0],
  ['failure', 'process.exit(7)', 7],
  ['blocked sync loop', 'while (true) {}', 124],
  ['unresolved await', 'setInterval(() => {}, 1000)', 124],
]) {
  test(`supervisor bounds ${name} and persists evidence`, { timeout: 10000 }, async () => {
    const output = await mkdtemp(path.join(os.tmpdir(), 'hd-audit-deadline-'));
    try {
      const script = path.join(output, 'fixture.mjs');
      await writeFile(script, source);
      const result = await runBoundedAudit({ script, output, timeoutMs: 1000, graceMs: 100 });
      assert.equal(result.code, expected);
      const evidence = JSON.parse(await readFile(path.join(output, 'deadline-status.json')));
      assert.equal(evidence.status, expected === 124 ? 'TIMEOUT' : expected === 0 ? 'COMPLETE' : 'FAILED');
      assert.ok(evidence.elapsedMs < 8000);
    } finally { await rm(output, { recursive: true, force: true }); }
  });
}
