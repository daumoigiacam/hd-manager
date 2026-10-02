import { spawn } from 'node:child_process';
import { copyFile, mkdir, readdir, symlink, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import process from 'node:process';
import os from 'node:os';

const workspace = process.cwd();
const root = path.join(os.tmpdir(), 'hd-manager-local-firebase-runtime');
const source = path.join(root, 'functions');
const require = createRequire(import.meta.url);
await mkdir(source, { recursive: true });
// Copy source only: production .env files and credentials must never enter this runtime.
for (const entry of await readdir(path.join(workspace, 'functions'), { withFileTypes: true })) {
  if (entry.isFile() && (/\.(?:js|mjs|cjs)$/.test(entry.name) || entry.name === 'package.json')) {
    await copyFile(path.join(workspace, 'functions', entry.name), path.join(source, entry.name));
  }
}
try { await symlink(path.join(workspace, 'functions', 'node_modules'), path.join(source, 'node_modules'), 'junction'); }
catch (error) { if (error.code !== 'EEXIST') throw error; }
await copyFile(path.join(workspace, 'firestore.rules'), path.join(root, 'firestore.rules'));
await writeFile(path.join(root, 'firebase.json'), JSON.stringify({
  functions: { source: 'functions' },
  firestore: { rules: 'firestore.rules' },
  emulators: {
    auth: { host: '127.0.0.1', port: 9199 },
    firestore: { host: '127.0.0.1', port: 8185 },
    functions: { host: '127.0.0.1', port: 5002 },
    hub: { host: '127.0.0.1', port: 4405 },
    logging: { host: '127.0.0.1', port: 4505 },
    ui: { enabled: false }, singleProjectMode: true,
  },
}, null, 2));
const child = spawn(process.execPath, [require.resolve('firebase-tools/lib/bin/firebase'),
  'emulators:start', '--config', path.join(root, 'firebase.json'),
  '--project', 'demo-hd-manager-local', '--only', 'auth,firestore,functions'], {
  cwd: root, stdio: 'inherit', windowsHide: true,
  env: { ...process.env, HD_MANAGER_APP_ID: 'hd-manager-local',
    GOOGLE_APPLICATION_CREDENTIALS: '', XDG_CONFIG_HOME: path.join(root, 'cli-config') },
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('exit', code => { process.exitCode = code || 0; });
