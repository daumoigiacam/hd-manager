import { spawn } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const workspace = fileURLToPath(new URL('../', import.meta.url));
const root = await mkdtemp(path.join(os.tmpdir(), 'hd-dispatch-cert-'));
await copyFile(path.join(workspace, 'firestore.rules'), path.join(root, 'firestore.rules'));
await mkdir(path.join(root, 'cli-config'));
await writeFile(path.join(root, 'firebase.json'), JSON.stringify({
  firestore: { rules: 'firestore.rules' },
  emulators: {
    firestore: { host: '127.0.0.1', port: 8187 },
    hub: { host: '127.0.0.1', port: 4407 },
    logging: { host: '127.0.0.1', port: 4507 },
    ui: { enabled: false }, singleProjectMode: false,
  },
}));
console.log(`Evidence directory: ${root}`);
const testFile = path.join(workspace, process.argv.includes('--probe')
  ? 'tests/warehouse-dispatch-boundary.probe.mjs'
  : 'tests/firestore-tenant-isolation.test.mjs');
const child = spawn(process.execPath, [require.resolve('firebase-tools/lib/bin/firebase'),
  'emulators:exec', '--project', 'demo-hd-dispatch-cert', '--only', 'firestore',
  '--config', path.join(root, 'firebase.json'),
  `"${process.execPath}" --test --test-timeout=60000 "${testFile}"`,
], {
  cwd: root, stdio: 'inherit', windowsHide: true,
  env: { ...process.env, XDG_CONFIG_HOME: path.join(root, 'cli-config'),
    GOOGLE_APPLICATION_CREDENTIALS: '', FIREBASE_TOKEN: '', CI: 'true' },
});
let timedOut = false;
const stop = () => {
  if (!child.pid) return;
  if (process.platform === 'win32') {
    spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
  } else child.kill('SIGTERM');
};
const timer = setTimeout(() => {
  timedOut = true;
  console.error('TIMEOUT: emulator certification exceeded 180 seconds. Logs retained.');
  stop();
}, 180000);
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
child.once('error', error => { console.error(error); clearTimeout(timer); process.exitCode = 1; });
child.once('exit', code => {
  clearTimeout(timer);
  process.removeListener('SIGINT', stop);
  process.removeListener('SIGTERM', stop);
  process.exitCode = timedOut ? 124 : (code ?? 1);
});
