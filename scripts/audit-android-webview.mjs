import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { connectAndroidWebView } from './helpers/android-webview-cdp.mjs';
import { resolveAccessibleAuditRoutes } from './helpers/android-audit-routes.mjs';
import { normalizeTrustedInputTimestamp } from './helpers/browser-interaction-timing.mjs';

// Never attaches to a user's signed release or changes cloud business data.
const packageName = 'com.hdmanager.app.acceptance';
const adb = process.env.HD_ADB || 'D:/HD-DEV/android/sdk/platform-tools/adb.exe';
const serial = process.env.HD_ANDROID_SERIAL || 'emulator-5554';
const authenticated = process.env.HD_ANDROID_AUTHENTICATED_AUDIT === 'true';
const accessibleOnly = process.env.HD_ANDROID_AUDIT_ACCESSIBLE_ONLY === 'true';
const lightweight = process.env.HD_ANDROID_AUDIT_LIGHTWEIGHT === 'true';
const rounds = Number(process.env.HD_ANDROID_AUDIT_ROUNDS || 1);
if (!Number.isSafeInteger(rounds) || rounds < 1 || rounds > 5) throw Error('Audit rounds must be between 1 and 5');
const output = path.resolve(process.env.HD_ANDROID_AUDIT_OUTPUT || 'test-results/android10-modules-20261031');
await mkdir(output, { recursive: true });
const cdp = await connectAndroidWebView({ adb, serial, packageName, enableRuntime: !authenticated });
const routes = [
  ['home', 'Trang chủ', true], ['order_requests', 'Đặt hàng', true], ['orders', 'Đơn hàng', true],
  ['warehouse_dispatch', 'Xuất kho', true], ['executive_dashboard', 'Điều hành'], ['warehouse_import', 'Nhập Xuất Tồn'],
  ['delivery_reports', 'Báo cáo giao hàng'], ['products', 'Kho sản phẩm'], ['customers', 'Khách hàng'], ['debt', 'Sổ nợ'],
  ['finance', 'Thu chi'], ['bank_payments', 'Ngân hàng'], ['messages', 'Tin nhắn'], ['pricing', 'Giá cả'],
  ['company_attendance', 'Chấm công'], ['employee_reviews', 'Đánh giá'], ['asset_management', 'Quản lý tài sản'],
  ['payroll', 'Bảng lương'], ['employees', 'Nhân sự'], ['price_quotes', 'Báo giá hàng loạt'], ['settings', 'Cài đặt'],
  ['role_permissions', 'Vai trò'], ['billing', 'Gói cước'],
];
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitFor(expression, timeout = 20000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { const result = await cdp.evaluate(expression); if (result) return result; await sleep(100); }
  throw Error(`DOM condition timeout: ${expression}`);
}
async function touchButton(label, bottom, expected) {
  const position = await cdp.evaluate(`(function(){
    var root=document.querySelector(${JSON.stringify(bottom ? '[data-hd-navigation="bottom"]' : 'main')});
    var button=root && Array.from(root.querySelectorAll('button')).find(function(b){return (b.getAttribute('aria-label') || b.innerText).trim()===${JSON.stringify(label)}});
    if(!button) throw Error('Navigation button missing: '+${JSON.stringify(label)});
    button.scrollIntoView({block:'center'}); var r=button.getBoundingClientRect();
    window.__androidInteraction={started:null,ready:null,feedback:null,feedbackScheduled:false,inputAt:null,inputCapturedAt:null,pointerdownQueueMs:null,inputToFeedbackMs:null,inputToReadyMs:null,expected:${JSON.stringify(expected)}};
    return {x:(r.x+r.width/2)*devicePixelRatio,y:(r.y+r.height/2)*devicePixelRatio};
  })()`);
  // WebView 74 ignores CDP touch injection on this AVD. Send actual Android
  // input; its shell/ADB overhead occurs before the in-page click timestamp.
  cdp.shell('shell', 'input', 'tap', `${Math.round(position.x)}`, `${Math.round(position.y)}`);
  return waitFor('window.__androidInteraction && window.__androidInteraction.ready !== null && window.__androidInteraction');
}
const samples = [], failures = [], skippedModules = [];
try {
  const device = {
    serial, packageName, android: cdp.shell('shell', 'getprop', 'ro.build.version.release'),
    webview: cdp.shell('shell', 'dumpsys', 'webviewupdate'), memory: cdp.shell('shell', 'cat', '/proc/meminfo'),
  };
  const instrumentation = `(function(){
    if(window.__hdAndroidAuditProbe){window.__hdAndroidAuditProbe.restore()}
    if(window.__androidLoadCount===1)throw Error('Old audit probe requires a fresh page; do not stack anonymous observers');
    window.__androidLoadCount=1;
    var normalizeStamp=${normalizeTrustedInputTimestamp.toString()};
    function input(event){var t=window.__androidInteraction;if(!t || t.started!==null)return;
      var at=performance.now(),stamp=normalizeStamp(event.timeStamp,at,performance.timeOrigin,event.isTrusted);
      if(stamp!==null){t.inputAt=stamp;t.inputCapturedAt=at;t.pointerdownQueueMs=at-stamp}}
    function click(){if(window.__androidInteraction)window.__androidInteraction.started=performance.now()}
    document.addEventListener('click',click,true);
    document.addEventListener('pointerdown',input,true);
    function observe(){var t=window.__androidInteraction;if(!t || t.started===null || t.ready!==null)return;
      var main=document.querySelector('main[data-hd-module="'+t.expected+'"]');
      if(!main || ${lightweight ? '!main.firstElementChild' : '!main.innerText.trim()'})return;
      // Report shell feedback separately; the existing ready/gate still waits
      // for data/loading/busy indicators. Feedback alone cannot make it PASS.
      if(t.feedback===null && !t.feedbackScheduled){t.feedbackScheduled=true;
        requestAnimationFrame(function(){requestAnimationFrame(function(){
          if(t!==window.__androidInteraction || !main.isConnected)return;
          t.feedback=performance.now();t.feedbackMs=t.feedback-t.started;
          if(t.inputAt!==null)t.inputToFeedbackMs=t.feedback-t.inputAt;
        })});
      }
      if(main.querySelector('[data-hd-module-loading],[aria-busy="true"]'))return;
      requestAnimationFrame(function(){requestAnimationFrame(function(){
        if(t!==window.__androidInteraction || t.ready!==null || !main.isConnected || main.querySelector('[data-hd-module-loading],[aria-busy="true"]'))return;
        t.ready=performance.now();t.duration=t.ready-t.started;
        if(t.inputAt!==null)t.inputToReadyMs=t.ready-t.inputAt;
      })});
    }
    var observer=new MutationObserver(observe);observer.observe(document,{childList:true,subtree:true,attributes:true,attributeFilter:['data-hd-module','aria-busy']});
    document.addEventListener('click',observe);
    window.__hdAndroidAuditProbe={restore:function(){observer.disconnect();document.removeEventListener('click',click,true);document.removeEventListener('click',observe);document.removeEventListener('pointerdown',input,true);delete window.__hdAndroidAuditProbe;delete window.__androidLoadCount}};
  })();`;
  if (authenticated) {
    if (!await cdp.evaluate('Boolean(document.querySelector("main[data-hd-module]"))')) throw Error('Authenticated audit requires an existing module session; it never logs in or reloads');
    await cdp.evaluate(instrumentation);
    await touchButton('Trang chủ', true, 'home');
  } else {
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: instrumentation });
    await cdp.send('Page.reload', { ignoreCache: true });
  }
  await waitFor('Boolean(document.querySelector("main[data-hd-module=home]"))', 45000);
  const coreReadiness = await waitFor(`(function(){
    if(window.__HD_STARTUP_TIMING__ && window.__HD_STARTUP_TIMING__.some(function(e){return e.name==='background.sync.core_ready'}))return 'startup-event';
    if(!${JSON.stringify(authenticated)})return false;
    // The bounded startup event buffer can expire during long authenticated
    // sessions. Recheck current core flags instead of inventing a startup event.
    var main=document.querySelector('main[data-hd-module]');
    var key=main && Object.keys(main).find(function(k){return k.indexOf('__reactFiber$')===0});
    var fiber=key && main[key];
    for(var depth=0;fiber && depth<80;depth++,fiber=fiber.return){
      var hook=fiber.memoizedState;
      for(var i=0;hook && i<1000;i++,hook=hook.next){
        var value=hook.memoizedState;
        if(value && typeof value==='object' && Object.prototype.hasOwnProperty.call(value,'tenantId')
          && value.collections && value.collections.companies===true && value.collections.employees===true)return 'live-core-flags';
      }
    }
    return false;
  })()`, 45000);
  let eligibleRoutes = routes;
  if (authenticated && accessibleOnly) {
    await touchButton('Thêm', true, 'more');
    const surfaces = await cdp.evaluate(`(function(){var allowed=${JSON.stringify(routes.map(r=>r[1]))};function labels(selector){return Array.from(document.querySelectorAll(selector)).map(function(b){return (b.getAttribute('aria-label')||b.innerText).trim()}).filter(function(label){return allowed.indexOf(label)>=0})}return {more:labels('main button'),bottom:labels('[data-hd-navigation="bottom"] button')};})()`);
    const allowed = resolveAccessibleAuditRoutes(routes, surfaces);
    eligibleRoutes = allowed.eligibleRoutes;
    skippedModules.push(...allowed.skippedModules);
    await touchButton('Trang chủ', true, 'home');
  }
  const routeSequence = process.env.HD_ANDROID_AUDIT_ROUTE_SEQUENCE
    ? JSON.parse(process.env.HD_ANDROID_AUDIT_ROUTE_SEQUENCE) : null;
  if (routeSequence) {
    if (!Array.isArray(routeSequence) || routeSequence.length < 1 || routeSequence.length > 30
      || routeSequence.some(module => !eligibleRoutes.some(route => route[0] === module))) {
      throw Error('Diagnostic route sequence must contain only permitted inventory modules');
    }
    eligibleRoutes = routeSequence.map(module => eligibleRoutes.find(route => route[0] === module));
  }
  const visits = Array.from({ length: rounds }, (_, index) => eligibleRoutes.map(([module, label, bottom]) => [module, label, Boolean(bottom), index + 1])).flat();
  for (const [module, label, bottom, round] of visits) {
    try {
      await touchButton('Thêm', true, 'more');
      const timing = await touchButton(label, bottom, module);
      samples.push({ module, round, ...timing, gate100ms: timing.duration <= 100 ? 'PASS' : 'FAIL',
        inputFeedbackGate100ms:Number.isFinite(timing.inputToFeedbackMs)?timing.inputToFeedbackMs<=100?'PASS':'FAIL':'UNMEASURED',
        nodes: await cdp.evaluate('document.getElementsByTagName("*").length') });
    } catch (error) {
      failures.push({ module, round, error: error.message });
      await writeFile(path.join(output, 'progress.json'), JSON.stringify({ samples, failures }, null, 2));
      // Once the renderer/session disappears, further route attempts are not
      // independent measurements. Leave remaining modules unmeasured.
      if (/CDP timeout|Connection closed|context.*destroyed|Target closed/i.test(error.message)) break;
    }
    await writeFile(path.join(output, 'progress.json'), JSON.stringify({ samples, failures }, null, 2));
  }
  const startup = await cdp.evaluate('(window.__HD_STARTUP_TIMING__||[]).map(function(e){return {name:e.name,atEpochMs:e.atEpochMs,durationMs:e.durationMs}})');
  const capabilities = await cdp.evaluate('({allSettled:typeof Promise.allSettled,randomUUID:typeof crypto.randomUUID,hasOwn:typeof Object.hasOwn,arrayAt:typeof Array.prototype.at})');
  const appPss = cdp.shell('shell', 'dumpsys', 'meminfo', packageName);
  const apkPath = process.env.HD_ANDROID_AUDIT_APK || (authenticated
    ? 'test-results/android10-history-index/HD-Manager-Acceptance-debug.apk'
    : 'test-results/android10-candidate/HD-Manager-Acceptance-debug.apk');
  const apk = await readFile(apkPath);
  await writeFile(path.join(output, 'result.json'), JSON.stringify({ harnessVersion:lightweight?3:2,lightweight,device, apkSha256: createHash('sha256').update(apk).digest('hex'), capabilities, startup,
    samples, failures, runtimeEvents: cdp.events, appPss, coreReadiness, accessibleOnly, skippedModules, routeSequence,
    contract: `${authenticated ? 'Existing authenticated cloud session, no reload/login or explicit data-write calls in harness; only known navigation buttons tapped. Normal app background maintenance may run. Runtime domain disabled; exception monitoring unavailable.' : 'Synthetic fixture, no cloud login or writes.'} click capture to expected module DOM plus two requestAnimationFrame callbacks; not compositor paint, EventTiming/INP, complete cloud data or server ACK. V2 additionally records validated trusted pointerdown timestamps and input-to-feedback/readiness proxies; missing or invalid clocks stay null, not zero/PASS. ${lightweight?'V3 uses element presence instead of layout-forcing main.innerText inside the observer; global/hidden busy selectors and 100ms thresholds remain. Kept separate from original V2 measurements.':'Existing click-based readiness gate is unchanged.'} No timeout/missing sample counts as PASS. Android Activity/app PSS excludes separate renderer process.` }, null, 2));
  console.log(JSON.stringify({ modules: new Set(samples.map(sample => sample.module)).size, rounds, visits: samples.length, failures, over100Count: samples.filter(x=>x.duration>100).length, exceptions: authenticated ? null : cdp.events.filter(x=>x.method==='Runtime.exceptionThrown').length }));
} finally { try{await cdp.evaluate('window.__hdAndroidAuditProbe && window.__hdAndroidAuditProbe.restore()')}catch{/* renderer lost */}cdp.close(); }
