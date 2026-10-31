import { mkdir, writeFile } from 'node:fs/promises';
import { connectAndroidWebView } from './helpers/android-webview-cdp.mjs';
const output = process.env.HD_ALLOCATION_OUTPUT || 'test-results/android10-allocation-samples';
const seconds = Number(process.env.HD_ALLOCATION_SECONDS || 600);
if (!Number.isSafeInteger(seconds) || seconds < 10 || seconds > 1200) throw Error('Invalid capture duration');
await mkdir(output, { recursive: true });
const cdp = await connectAndroidWebView({ adb: 'D:/HD-DEV/android/sdk/platform-tools/adb.exe', serial: 'emulator-5554', packageName: 'com.hdmanager.app.acceptance', port: 9230, enableRuntime: false });
const samples = [];
let stopped = false;
let peakUsed = 0;
process.on('SIGINT', () => { stopped = true; });
const sanitizeNode = node => ({
  id: node.id, selfSize: node.selfSize,
  callFrame: { ...node.callFrame, url: (node.callFrame?.url || '').split(/[?#]/)[0] },
  children: (node.children || []).map(sanitizeNode),
});
try {
  await cdp.send('HeapProfiler.startSampling', { samplingInterval: 262144 });
  const end = Date.now() + seconds * 1000;
  while (!stopped && Date.now() < end) {
    const at = Date.now();
    try {
      const heap = await cdp.send('Runtime.getHeapUsage');
      const { profile } = await cdp.send('HeapProfiler.getSamplingProfile');
      const status = await cdp.evaluate('(function(){var main=document.querySelector("main[data-hd-module]");return {module:main && main.getAttribute("data-hd-module"),timeOrigin:performance.timeOrigin,startup:(window.__HD_STARTUP_TIMING__||[]).map(function(e){return {name:e.name,atEpochMs:e.atEpochMs}})}})()');
      samples.push({ at, heap, status });
      // Allocation stack metadata only; no object values, heap snapshot,
      // document contents, tokens, headers, console arguments or screenshots.
      const allocation = JSON.stringify({ at, heap, head: sanitizeNode(profile.head) });
      await writeFile(`${output}/latest-profile.json`, allocation);
      if (heap.usedSize > peakUsed) {
        peakUsed = heap.usedSize;
        await writeFile(`${output}/peak-profile.json`, allocation);
      }
      await writeFile(`${output}/progress.json`, JSON.stringify({ samples, scope: 'Sampled JS allocations, diagnostic overhead present; not latency, RSS/PSS, a complete heap snapshot or proof of OOM.' }, null, 2));
    } catch (error) {
      samples.push({ at, error: error.message });
      await writeFile(`${output}/progress.json`, JSON.stringify({ samples }, null, 2));
      break;
    }
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
} finally {
  try { await cdp.send('HeapProfiler.stopSampling'); } catch { /* Preserve last sample after renderer failure. */ }
  cdp.close();
}
