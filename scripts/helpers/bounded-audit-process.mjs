import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export function auditTimeout(value = 300000) {
  const ms = Number(value);
  if (!Number.isSafeInteger(ms) || ms < 1 || ms > 900000) {
    throw new TypeError('Audit timeout must be a positive integer, at most 900000 ms.');
  }
  return ms;
}

// The parent deadline also applies when the child is blocked in synchronous work.
export function runBoundedAudit({ script, args = [], output, timeoutMs = 300000, graceMs = 5000, env = process.env }) {
  const deadline = auditTimeout(timeoutMs);
  const grace = auditTimeout(graceMs);
  mkdirSync(output, { recursive: true });
  const started = Date.now();
  let progress = 'startup';
  let timedOut = false;
  const record = data => writeFileSync(path.join(output, 'deadline-status.json'), JSON.stringify({
    timeoutMs: deadline, elapsedMs: Date.now() - started, progress, ...data,
  }, null, 2));
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...args], {
      env: { ...env, HD_AUDIT_SUPERVISED: '1' }, stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
    });
    let forceTimer;
    const timer = setTimeout(() => {
      timedOut = true;
      record({ status: 'TIMEOUT', pid: child.pid });
      if (child.connected) child.send({ type: 'audit-timeout' }, () => {});
      forceTimer = setTimeout(() => child.kill(), grace);
    }, deadline);
    child.on('message', message => {
      if (message?.type === 'audit-progress' && typeof message.stage === 'string') progress = message.stage.slice(0, 300);
    });
    child.once('error', error => { clearTimeout(timer); clearTimeout(forceTimer); reject(error); });
    child.once('exit', (code, signal) => {
      clearTimeout(timer);
      clearTimeout(forceTimer);
      const result = { status: timedOut ? 'TIMEOUT' : code === 0 ? 'COMPLETE' : 'FAILED',
        code: timedOut ? 124 : code ?? 1, signal };
      record(result);
      resolve(result);
    });
  });
}
