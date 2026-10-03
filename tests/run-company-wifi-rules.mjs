import { spawn } from 'node:child_process';
import { mkdtemp, copyFile, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';

const socket = net.createServer();
await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
const port = socket.address().port;
await new Promise(resolve => socket.close(resolve));
const cache = path.join(os.homedir(), '.cache/firebase/emulators');
const jar = (await readdir(cache)).filter(name => /^cloud-firestore-emulator-v[\d.]+\.jar$/.test(name)).sort((a,b) => b.localeCompare(a, 'en', { numeric: true }))[0];
if (!jar) throw new Error('Cached emulator not found');
const directory = await mkdtemp(path.join(os.tmpdir(), 'company-wifi-'));
await copyFile('firestore.rules', path.join(directory, 'firestore.rules'));
const child = spawn('java', ['-Xmx512m', '-Duser.language=en', '-Duser.country=US', '-jar', path.join(cache, jar), '--host', '127.0.0.1', '--port', String(port), '--project_id', 'demo-company-wifi', '--rules', 'firestore.rules'], { cwd: directory, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
const closed = new Promise(resolve => child.once('close', resolve));
let logs = '';
child.stdout.on('data', data => { logs += data; });
child.stderr.on('data', data => { logs += data; });
const deadline = setTimeout(() => { child.kill(); console.error('Emulator timeout'); process.exitCode = 1; }, 90000);
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try { await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(500) }); ready = true; break; } catch {}
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  if (!ready) throw new Error(logs || 'Emulator did not start');
  process.env.FIRESTORE_EMULATOR_HOST = `127.0.0.1:${port}`;
  await import('./company-wifi-rules.test.mjs');
  await import('./attendance-manual-firestore.integration.mjs');
} catch (error) { console.error(logs); throw error; }
finally { child.kill(); await closed; clearTimeout(deadline); }
