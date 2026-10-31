import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
const adb = process.env.HD_ADB || 'D:/HD-DEV/android/sdk/platform-tools/adb.exe';
const serial = process.env.HD_ANDROID_SERIAL || 'emulator-5554';
const output = process.env.HD_NATIVE_HEALTH_OUTPUT || 'test-results/android10-native-health';
const seconds = Number(process.env.HD_NATIVE_HEALTH_SECONDS || 180);
if (!Number.isSafeInteger(seconds) || seconds < 10 || seconds > 1200) throw Error('Invalid observation duration');
const shell = (...args) => execFileSync(adb, ['-s', serial, ...args], { encoding: 'utf8', timeout: 10000 });
await mkdir(output, { recursive: true });
const started = new Date();
const samples = [];
const stopFile = process.env.HD_NATIVE_HEALTH_STOP_FILE;
// No DevTools connection, UI actions, credentials, document contents or general
// logcat saved. RSS is process resident memory, not JS heap or total app PSS.
for (let i = 0; i < seconds; i++) {
  if (stopFile && existsSync(stopFile)) break;
  const at = Date.now();
  try {
    const rows = shell('shell', 'ps', '-A', '-o', 'PID,RSS,NAME').trim().split(/\r?\n/).slice(1);
    samples.push({ at, processes: rows.flatMap(line => {
      const match = line.trim().match(/^(\d+)\s+(\d+)\s+(\S+)/);
      if (!match || !(match[3] === 'com.hdmanager.app.acceptance' || match[3].startsWith('com.google.android.webview:sandboxed_process'))) return [];
      return [{ pid: Number(match[1]), rssKb: Number(match[2]), name: match[3] }];
    }) });
  } catch (error) { samples.push({ at, error: error.code || 'adb-sampling-failed' }); }
  await writeFile(`${output}/progress.json`, JSON.stringify({ started, samples }, null, 2));
  await new Promise(resolve => setTimeout(resolve, Math.max(1, 1000 - (Date.now() - at))));
}
const log = shell('logcat', '-d', '-v', 'threadtime', '-s', 'HDManagerMainActivity:E');
const crashes = log.split(/\r?\n/).filter(line => /WebView renderer (crashed|was killed by Android)/.test(line));
await writeFile(`${output}/result.json`, JSON.stringify({ started, ended: new Date(), stoppedEarly: Boolean(stopFile && existsSync(stopFile)), samples, crashes,
  scope: 'Native PID/RSS observations without CDP. Crash lines may predate sampling; compare their timestamp and PID. Process RSS is not JS live heap, a memory leak or proof of OOM.' }, null, 2));
console.log(JSON.stringify({ samples: samples.length, crashLinesInBuffer: crashes.length }));
