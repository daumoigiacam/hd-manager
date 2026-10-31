import { mkdir, writeFile } from 'node:fs/promises';
import { connectAndroidWebView } from './helpers/android-webview-cdp.mjs';

const output = process.env.HD_BACKUP_STABILITY_OUTPUT;
if (!output) throw Error('Set HD_BACKUP_STABILITY_OUTPUT');
await mkdir(output, { recursive: true });
const cdp = await connectAndroidWebView({ adb: 'D:/HD-DEV/android/sdk/platform-tools/adb.exe', serial: 'emulator-5554', packageName: 'com.hdmanager.app.acceptance', enableRuntime: false, port: 9232 });
const started = Date.now(), samples = [];
const eventMinEpoch = Number(process.env.HD_BACKUP_EVENT_MIN_EPOCH || started);
if (!Number.isSafeInteger(eventMinEpoch) || eventMinEpoch < 0 || eventMinEpoch > started) throw Error('Invalid backup event epoch');
let terminalAt = null, origin = null;
try {
  while (Date.now() - started < 20 * 60 * 1000) {
    try {
      const heap = await cdp.send('Runtime.getHeapUsage');
      const state = await cdp.evaluate(`(function(){
        var main=document.querySelector('main[data-hd-module]');
        var states=JSON.parse(localStorage.getItem('hd-manager-auto-backup-state-v1')||'{}');
        return {module:main && main.getAttribute('data-hd-module'),origin:performance.timeOrigin,
          backupStates:Object.keys(states).map(function(k){var s=states[k];return {status:s.status,recordCount:s.recordCount,savedAt:s.savedAt,failedAt:s.failedAt,updatedAt:s.updatedAt}}),
          startup:(window.__HD_STARTUP_TIMING__||[]).map(function(e){return {name:e.name,atEpochMs:e.atEpochMs}})};
      })()`);
      samples.push({ at: Date.now(), heap, ...state });
      if (origin !== null && origin !== state.origin) throw Error('Page origin changed during observation');
      origin = state.origin;
      if (!terminalAt && state.backupStates.some(s => Date.parse(s.updatedAt) >= eventMinEpoch && ['saved', 'failed', 'manual_required'].includes(s.status))) terminalAt = Date.now();
      await writeFile(`${output}/progress.json`, JSON.stringify({ started, eventMinEpoch, terminalAt, samples }, null, 2));
      if (terminalAt && Date.now() - terminalAt >= 120000) break;
    } catch (error) { samples.push({ at: Date.now(), error: error.message }); break; }
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
} finally {
  cdp.close();
  await writeFile(`${output}/result.json`, JSON.stringify({ started, eventMinEpoch, ended: Date.now(), terminalAt, samples,
    scope: 'Diagnostic heap polling without allocation/CPU profiler, Runtime/Network event domains disabled. Only module, backup status/count/time and startup event names retained, no business values, storage keys, paths, tokens or errors containing document contents. Not a latency benchmark or native OOM proof.' }, null, 2));
}
