import { mkdir, writeFile } from 'node:fs/promises';
import { connectAndroidWebView } from './helpers/android-webview-cdp.mjs';
const output = process.env.HD_CLOUD_CAPTURE_OUTPUT || 'test-results/android10-cloud-startup-20261031';
const lightweight = process.env.HD_CLOUD_LIGHTWEIGHT === 'true';
await mkdir(output, { recursive: true });
const cdp = await connectAndroidWebView({ adb: process.env.HD_ADB || 'D:/HD-DEV/android/sdk/platform-tools/adb.exe', serial: process.env.HD_ANDROID_SERIAL || 'emulator-5554', packageName: 'com.hdmanager.app.acceptance', enableRuntime: !lightweight });
const requests = new Map();
const network = [];
const stop = cdp.onEvent(({method, params}) => {
  if (method === 'Network.requestWillBeSent') {
    const url = new URL(params.request.url);
    if (!/googleapis\.com$|cloudfunctions\.net$/.test(url.hostname)) return;
    const entry = { requestId: params.requestId, host: url.hostname, endpoint: url.pathname.split('/').slice(-1)[0], start: params.timestamp };
    requests.set(params.requestId, entry); network.push(entry);
  } else if (method === 'Network.responseReceived') {
    const entry = requests.get(params.requestId); if (entry) { entry.status=params.response.status; entry.responseAt=params.timestamp; }
  } else if (method === 'Network.loadingFinished' || method === 'Network.loadingFailed') {
    const entry = requests.get(params.requestId); if (entry) { entry.end=params.timestamp; entry.durationMs=(params.timestamp-entry.start)*1000; entry.bytes=params.encodedDataLength; entry.error=params.errorText; }
  }
});
try {
  if (!lightweight) await cdp.send('Network.enable');
  const instrumentation = `(function(){
    window.__cloudLoginProbe={submitAt:null,submitEpoch:null,shellAt:null,dataAt:null,firstRefreshAt:null,refreshReadyAt:null};
    document.addEventListener('click',function(e){var b=e.target.closest('button');if(b && /Vào Ứng Dụng|Vào ứng dụng/i.test(b.innerText)){window.__cloudLoginProbe.submitAt=performance.now();window.__cloudLoginProbe.submitEpoch=Date.now()}},true);
    new MutationObserver(function(){var s=window.__cloudLoginProbe;if(s.submitAt===null)return;
      if(s.shellAt===null && document.querySelector('main[data-hd-module]'))s.shellAt=performance.now();
      var timing=window.__HD_STARTUP_TIMING__ || [];
      if(s.dataAt===null && timing.some(function(e){return e.name==='background.sync.core_ready'}))s.dataAt=performance.now();
      var refreshing=!!document.querySelector('[data-hd-read-refreshing="true"]');
      if(refreshing){if(s.firstRefreshAt===null)s.firstRefreshAt=performance.now();s.refreshReadyAt=null}
      else if(s.firstRefreshAt!==null && s.refreshReadyAt===null && s.shellAt!==null)s.refreshReadyAt=performance.now();
    }).observe(document,{childList:true,subtree:true});
  })()`;
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: instrumentation });
  await cdp.evaluate(instrumentation);
  const seconds = Number(process.env.HD_CLOUD_CAPTURE_SECONDS || 180);
  if (!Number.isFinite(seconds) || seconds < 10 || seconds > 1200) throw Error('Invalid capture duration');
  const deadline = Date.now() + seconds * 1000;
  let latest;
  while (Date.now() < deadline) {
    latest = await cdp.evaluate(`({probe:window.__cloudLoginProbe,loginVisible:!!document.querySelector('input[type=tel]'),module:document.querySelector('main[data-hd-module]') && document.querySelector('main[data-hd-module]').getAttribute('data-hd-module'),startup:(window.__HD_STARTUP_TIMING__ || []).map(function(e){return {name:e.name,durationMs:e.durationMs,atEpochMs:e.atEpochMs,level:e.level}})})`);
    await writeFile(`${output}/progress.json`, JSON.stringify({ latest, network }, null, 2));
    if (latest.probe?.submitAt != null && latest.module && latest.startup.some(e => e.name === 'background.sync.core_ready')
      && (latest.probe.firstRefreshAt === null || latest.probe.refreshReadyAt !== null)) break;
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  await writeFile(`${output}/result.json`, JSON.stringify({ latest, network, runtimeEvents:cdp.events,
    contract:`User logs in on-device. No credentials, request headers/payloads, response bodies or business documents captured. shellAt/dataAt are DOM/telemetry witnesses, not compositor paint or all module data ready. No reload is initiated. ${lightweight ? 'Network and Runtime domains disabled; no network/exception coverage.' : 'Network metadata and Runtime domain enabled.'}` }, null, 2));
  console.log(JSON.stringify({ loginVisible:latest.loginVisible,module:latest.module,probe:latest.probe,requestCount:lightweight ? null : network.length,exceptions:lightweight ? null : cdp.events.filter(e=>e.method==='Runtime.exceptionThrown').length }));
} finally { stop(); cdp.close(); }
