import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';

const phase = process.argv[2] || 'before';
assert.match(phase, /^(before|after)$/);
const output = path.resolve('test-results/perf-recovery-001', phase);
await fs.mkdir(output, { recursive: true });
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const lock = JSON.parse(await fs.readFile('package-lock.json', 'utf8'));
const versions = Object.fromEntries(['react', 'react-dom', 'vite', '@capacitor/android', '@capacitor/core', 'firebase', 'playwright-core', 'typescript'].map(name => [name, lock.packages[`node_modules/${name}`]?.version]));
const environment = {
  task: 'HDM-PERF-RECOVERY-001', phase, at: new Date().toISOString(),
  repository: { root: git('rev-parse', '--show-toplevel'), branch: git('branch', '--show-current'), commit: git('rev-parse', 'HEAD'), status: git('status', '--short') },
  host: { os: os.platform(), release: os.release(), cpu: os.cpus()[0]?.model, logicalCpus: os.cpus().length, ramBytes: os.totalmem(), node: process.version }, versions,
  sourceSha256: createHash('sha256').update(await fs.readFile('src/App.jsx')).digest('hex'),
  runtimeEvidence: JSON.parse(await fs.readFile('test-results/runtime-backend-audit-20261012/evidence.json', 'utf8')),
  limits: { android: 'ADB emulator unauthorized; only API36 AVD listed. No real-device or Android10 measurement.', network: 'Local browser tests block external requests; no authenticated production backend latency measured.', typecheck: 'Existing command covers payroll and dispatch only, not all application JS.' },
};
await fs.writeFile(path.join(output, 'environment.json'), JSON.stringify(environment, null, 2));
const npmCli = path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
const commands = [
  ['module-inventory', ['scripts/audit-module-paths.mjs']],
  ['lint', [npmCli, 'run', 'lint']],
  ['typecheck', [npmCli, 'run', 'typecheck']],
  ['functional', [npmCli, 'run', 'test:all']],
];
const results = [];
for (const [name, args] of commands) {
  const start = performance.now();
  const file = await fs.open(path.join(output, `${name}.log`), 'w');
  console.log(`START ${name}`);
  const code = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { stdio: ['ignore', file.fd, file.fd], windowsHide: true });
    child.on('error', reject);
    child.on('close', code => resolve(code));
  });
  await file.close();
  results.push({ name, code, durationMs: Math.round(performance.now() - start), log: `${name}.log` });
  await fs.writeFile(path.join(output, 'tests.json'), JSON.stringify(results, null, 2));
  console.log(`END ${name}: ${code}`);
}
if (results.some(result => result.code !== 0)) process.exitCode = 1;
