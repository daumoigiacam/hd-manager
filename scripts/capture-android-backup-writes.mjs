import { mkdir, writeFile } from 'node:fs/promises';
import { connectAndroidWebView } from './helpers/android-webview-cdp.mjs';

const output = process.env.HD_BACKUP_WRITE_OUTPUT;
if (!output) throw Error('Set HD_BACKUP_WRITE_OUTPUT');
await mkdir(output, { recursive: true });
const cdp = await connectAndroidWebView({ adb: 'D:/HD-DEV/android/sdk/platform-tools/adb.exe', serial: 'emulator-5554', packageName: 'com.hdmanager.app.acceptance', enableRuntime: false, port: 9231 });
const samples = [];
try {
  await cdp.evaluate(`(function(){
    if(window.__hdBackupWriteProbe)throw Error('Probe already installed');
    var cap=window.Capacitor;if(!cap || typeof cap.nativePromise!=='function')throw Error('Native bridge missing');
    var original=cap.nativePromise,calls=[],totals={count:0,maxCharacters:0,totalCharacters:0,resolved:0,rejected:0};
    function wrapper(plugin,method,options){
      var tracked=plugin==='ScopedBackupWriter' || (plugin==='Filesystem' && ['writeFile','appendFile','rename','deleteFile'].indexOf(method)>=0);
      var record;
      if(tracked){
        var size=options && typeof options.data==='string'?options.data.length:0;
        record={at:Date.now(),plugin:plugin,method:method,characters:size};
        totals.count++;totals.totalCharacters+=size;totals.maxCharacters=Math.max(totals.maxCharacters,size);
        calls.push(record);
        if(calls.length>50)calls.shift();
      }
      var promise=original.apply(this,arguments);
      if(record)promise.then(function(){record.settledAt=Date.now();record.status='resolved';totals.resolved++},function(){record.settledAt=Date.now();record.status='rejected';totals.rejected++});
      return promise;
    }
    cap.nativePromise=wrapper;
    window.__hdBackupWriteProbe={calls:calls,totals:totals,restore:function(){if(cap.nativePromise===wrapper)cap.nativePromise=original;delete window.__hdBackupWriteProbe}};
    return true;
  })()`);
  const deadline = Date.now() + 12 * 60 * 1000;
  while (Date.now() < deadline) {
    try {
      const state = await cdp.evaluate(`(function(){var p=window.__hdBackupWriteProbe;return {origin:performance.timeOrigin,calls:p?p.calls:null,totals:p?p.totals:null}})()`);
      samples.push({ at: Date.now(), ...state });
      await writeFile(`${output}/progress.json`, JSON.stringify({ samples, scope: 'Diagnostic native bridge wrapper; only method, timestamp and string length retained. No arguments, file paths, payloads or native return values exported. Not a latency benchmark.' }, null, 2));
      if (state.calls === null || state.calls.some(c => ['commit', 'abort', 'rename', 'deleteFile'].includes(c.method) && c.settledAt && Date.now() - c.settledAt > 15000)) break;
    } catch (error) { samples.push({ at: Date.now(), error: error.message }); break; }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
} finally {
  try { await cdp.evaluate('window.__hdBackupWriteProbe && window.__hdBackupWriteProbe.restore()'); } catch { /* Renderer may have exited. */ }
  await writeFile(`${output}/result.json`, JSON.stringify({ samples, scope: 'Read-only diagnostic metadata; no file operation initiated by this script.' }, null, 2));
  cdp.close();
}
