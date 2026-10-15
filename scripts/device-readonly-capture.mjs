import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const [name, x, y] = process.argv.slice(2);
assert.match(name, /^[a-z0-9-]+$/);
const adb = 'D:/HD-DEV/android/sdk/platform-tools/adb.exe';
const args = ['-s', 'R5CY147DYXR'];
if (x && y) {
  assert.ok([x,y].every(v => /^\d+$/.test(v)));
  await new Promise(resolve => setTimeout(resolve, 700));
  execFileSync(adb, [...args, 'shell', 'input', 'tap', x, y]);
}
// Observation delay only, not an application performance measurement.
await new Promise(resolve => setTimeout(resolve, 1800));
mkdirSync('test-results/firebase-device-readonly', { recursive: true });
writeFileSync(`test-results/firebase-device-readonly/${name}.png`, execFileSync(adb, [...args, 'exec-out', 'screencap', '-p']));
