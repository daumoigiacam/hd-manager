import { mkdir, writeFile } from 'node:fs/promises';
import { connectAndroidWebView } from './helpers/android-webview-cdp.mjs';
const output = process.env.HD_CPU_PROFILE_OUTPUT || 'test-results/android10-busy-profile';
const captureTasks = process.env.HD_CPU_PROFILE_TASKS === 'true';
const captureNavigationProbe = process.env.HD_CPU_PROFILE_NAVIGATION_PROBE !== 'false';
const armLogin = process.env.HD_CPU_PROFILE_ARM_LOGIN === 'true';
const captureSeconds=Number(process.env.HD_CPU_PROFILE_SECONDS||8);
if(!Number.isFinite(captureSeconds)||captureSeconds<2||captureSeconds>60)throw Error('Invalid CPU diagnostic duration');
await mkdir(output, { recursive: true });
const cdp = await connectAndroidWebView({ adb: 'D:/HD-DEV/android/sdk/platform-tools/adb.exe', serial: 'emulator-5554', packageName: 'com.hdmanager.app.acceptance', port: 9229, enableRuntime: false });
let complete;
const done = new Promise(resolve => { complete = resolve; });
const stop = cdp.onEvent(event => { if (event.method === 'Tracing.tracingComplete') complete(event.params); });
try {
  const route = process.env.HD_CPU_PROFILE_ROUTE;
  const prepRoute = process.env.HD_CPU_PROFILE_PREP_ROUTE;
  if (armLogin && (route || prepRoute)) throw Error('Login profiling cannot navigate modules');
  let target;
  if (armLogin) {
    const armed = await cdp.evaluate(`(function(){
      if(!document.querySelector('input[type="tel"]'))throw Error('Login screen required');
      if(window.__hdCpuLoginArm)throw Error('Login CPU probe already armed');
      var state={origin:performance.timeOrigin,submitAt:null,longTasks:[],longTaskSupported:false};
      var longTaskObserver=null;
      try{longTaskObserver=new PerformanceObserver(function(list){
        if(state.submitAt===null)return;
        list.getEntries().forEach(function(entry){if(entry.entryType==='longtask' && entry.startTime>=state.submitAt)state.longTasks.push({start:entry.startTime,duration:entry.duration})});
      });longTaskObserver.observe({entryTypes:['longtask']});state.longTaskSupported=true}catch(e){}
      function click(event){var b=event.target.closest && event.target.closest('button');
        if(state.submitAt===null && b && document.querySelector('input[type="tel"]')
          && /Vào Ứng Dụng|Vào ứng dụng|Đăng nhập/.test(b.innerText)){state.submitAt=performance.now();performance.mark('hd-cpu-login-submit')}}
      document.addEventListener('click',click,true);
      window.__hdCpuLoginArm={state:state,restore:function(){document.removeEventListener('click',click,true);if(longTaskObserver)longTaskObserver.disconnect();delete window.__hdCpuLoginArm}};
      return {origin:state.origin};
    })()`);
    await writeFile(`${output}/armed.json`,JSON.stringify({at:new Date(),...armed,captureSeconds,
      scope:'Wait for login button click without reading typed values; then sample CPU. Diagnostic overhead, never a clean latency benchmark.'},null,2));
    console.log(JSON.stringify({armed:true,captureSeconds}));
    const deadline=Date.now()+7200000;
    let submitted;
    while(Date.now()<deadline){
      submitted=await cdp.evaluate('window.__hdCpuLoginArm && window.__hdCpuLoginArm.state');
      if(!submitted || submitted.origin!==armed.origin)throw Error('Login page changed while armed');
      if(submitted.submitAt!==null)break;
      await new Promise(resolve=>setTimeout(resolve,250));
    }
    if(!submitted || submitted.submitAt===null)throw Error('Login CPU arm expired');
    await writeFile(`${output}/submitted.json`,JSON.stringify(submitted));
  }
  if (route) {
    const labels = { home: 'Trang chủ', executive_dashboard: 'Điều hành', payroll: 'Bảng lương', price_quotes: 'Báo giá hàng loạt', customers: 'Khách hàng', products: 'Kho sản phẩm', orders:'Đơn hàng',
      order_requests: 'Đặt hàng', warehouse_dispatch: 'Xuất kho',pricing:'Giá cả',employees:'Nhân sự',
      bank_payments:'Ngân hàng',warehouse_import:'Nhập Xuất Tồn',debt:'Sổ nợ',finance:'Thu chi' };
    if (!Object.hasOwn(labels, route)) throw Error('Unsupported read-only profiling route');
    const position = (label, selector) => cdp.evaluate(`(function(){var root=document.querySelector(${JSON.stringify(selector)});var b=root && Array.from(root.querySelectorAll('button')).find(function(b){return (b.getAttribute('aria-label')||b.innerText).trim()===${JSON.stringify(label)}});if(!b)throw Error('Navigation missing');b.scrollIntoView({block:'center'});var r=b.getBoundingClientRect();return {x:(r.x+r.width/2)*devicePixelRatio,y:(r.y+r.height/2)*devicePixelRatio}})()`);
    if (prepRoute) {
      if (!Object.hasOwn(labels, prepRoute)) throw Error('Unsupported read-only preparation route');
      const openMore = await position('Thêm', '[data-hd-navigation="bottom"]');
      cdp.shell('shell','input','tap',`${Math.round(openMore.x)}`,`${Math.round(openMore.y)}`);
      let deadline=Date.now()+20000;
      while(!await cdp.evaluate('Boolean(document.querySelector("main[data-hd-module=more]"))')){
        if(Date.now()>deadline)throw Error('Preparation More timeout');await new Promise(r=>setTimeout(r,100));
      }
      const isBottom=await cdp.evaluate(`Array.from(document.querySelectorAll('[data-hd-navigation="bottom"] button')).some(function(b){return (b.getAttribute('aria-label')||b.innerText).trim()===${JSON.stringify(labels[prepRoute])}})`);
      const prep=await position(labels[prepRoute],isBottom?'[data-hd-navigation="bottom"]':'main');
      cdp.shell('shell','input','tap',`${Math.round(prep.x)}`,`${Math.round(prep.y)}`);
      deadline=Date.now()+20000;
      while(!await cdp.evaluate(`(function(){var m=document.querySelector('main[data-hd-module="${prepRoute}"]');return !!m && !!m.innerText.trim() && !m.querySelector('[data-hd-module-loading],[aria-busy="true"]')})()`)){
        if(Date.now()>deadline)throw Error('Preparation module timeout');await new Promise(r=>setTimeout(r,100));
      }
      await new Promise(r=>setTimeout(r,1000));
    }
    const more = await position('Thêm', '[data-hd-navigation="bottom"]');
    cdp.shell('shell', 'input', 'tap', `${Math.round(more.x)}`, `${Math.round(more.y)}`);
    const deadline = Date.now() + 20000;
    while (!await cdp.evaluate('Boolean(document.querySelector("main[data-hd-module=more]"))')) {
      if (Date.now() > deadline) throw Error('More navigation timeout');
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    const isBottom=await cdp.evaluate(`Array.from(document.querySelectorAll('[data-hd-navigation="bottom"] button')).some(function(b){return (b.getAttribute('aria-label')||b.innerText).trim()===${JSON.stringify(labels[route])}})`);
    target = await position(labels[route], isBottom ? '[data-hd-navigation="bottom"]' : 'main');
  }
  if (captureTasks && route && captureNavigationProbe) await cdp.evaluate(`(function(){
    var expected=${JSON.stringify(route)},started=null,ready=null,observer,inputAt=null,inputCapturedAt=null;
    function input(event){if(!event.isTrusted)return;var at=performance.now(),stamp=event.timeStamp;
      if(stamp>1e12)stamp-=performance.timeOrigin;
      if(typeof stamp==='number' && stamp>=0 && stamp<=at && at-stamp<60000){inputAt=stamp;inputCapturedAt=at}}
    function click(){started=performance.now();ready=null;performance.mark('hd-cpu-navigation-start');observe()}
    function observe(){if(started===null || ready!==null)return;var main=document.querySelector('main[data-hd-module="'+expected+'"]');
      if(!main || !main.innerText.trim() || main.querySelector('[data-hd-module-loading],[aria-busy="true"]'))return;
      requestAnimationFrame(function(){requestAnimationFrame(function(){if(ready!==null || !main.isConnected || main.querySelector('[data-hd-module-loading],[aria-busy="true"]'))return;ready=performance.now();performance.mark('hd-cpu-navigation-ready')})})}
    observer=new MutationObserver(observe);observer.observe(document,{childList:true,subtree:true,attributes:true,attributeFilter:['data-hd-module','aria-busy']});
    document.addEventListener('click',click,true);
    document.addEventListener('pointerdown',input,true);
    window.__hdNavCpuProbe={read:function(){return {origin:performance.timeOrigin,module:expected,started:started,ready:ready,duration:ready===null?null:ready-started,
      inputAt:inputAt,inputCapturedAt:inputCapturedAt,pointerdownQueueMs:inputAt===null?null:inputCapturedAt-inputAt,inputToReadyMs:inputAt===null||ready===null?null:ready-inputAt}},restore:function(){observer.disconnect();document.removeEventListener('click',click,true);document.removeEventListener('pointerdown',input,true);delete window.__hdNavCpuProbe}};
  })()`);
  await cdp.send('Tracing.start', { categories: captureTasks
    ? 'disabled-by-default-v8.cpu_profiler,devtools.timeline,toplevel,blink.user_timing'
    : 'disabled-by-default-v8.cpu_profiler', options: 'record-as-much-as-possible', transferMode: 'ReturnAsStream' });
  if (target) cdp.shell('shell', 'input', 'tap', `${Math.round(target.x)}`, `${Math.round(target.y)}`);
  await new Promise(resolve => setTimeout(resolve, captureSeconds*1000));
  await cdp.send('Tracing.end');
  let completionTimer;
  let finished;
  try {
    finished = await Promise.race([done, new Promise((_, reject) => {
      completionTimer = setTimeout(() => reject(Error('Trace completion timeout')), 30000);
    })]);
  } finally { clearTimeout(completionTimer); }
  const chunks = [];
  for (;;) {
    const chunk = await cdp.send('IO.read', { handle: finished.stream, size: 65536 });
    chunks.push(chunk.base64Encoded ? Buffer.from(chunk.data, 'base64').toString('utf8') : chunk.data);
    if (chunk.eof) break;
  }
  await cdp.send('IO.close', { handle: finished.stream });
  const raw = JSON.parse(chunks.join(''));
  // Keep only CPU samples. No network URLs, request headers, document contents,
  // console arguments, screenshots or general trace metadata are saved.
  const events = raw.traceEvents.filter(e => ['Profile', 'ProfileChunk', 'CpuProfile'].includes(e.name));
  if (captureTasks) {
    // Strict metadata allowlist: never retain timeline args (URLs, DOM nodes,
    // console/native messages or user data can occur there).
    const names = new Set(['RunTask','ThreadControllerImpl::RunTask','EventDispatch','FunctionCall','EvaluateScript',
      'UpdateLayoutTree','Layout','Paint','CompositeLayers','MinorGC','MajorGC','TimerFire','FireAnimationFrame','UpdateLayerTree',
      'hd-cpu-navigation-start','hd-cpu-navigation-ready','hd-cpu-login-submit']);
    const tasks = raw.traceEvents.filter(e => names.has(e.name)).map(e => {
      const {name,cat,ph,ts,dur,pid,tid}=e;
      const type=e.name==='EventDispatch' && e.args?.data?.type;
      const data=e.name==='FunctionCall' && e.args?.data;
      const url=data && (data.url || data.scriptName);
      const asset=typeof url==='string' && /^https:\/\/localhost\/assets\/[A-Za-z0-9_.-]+\.js$/.test(url) ? url.split('/').at(-1) : null;
      const line=data && (data.lineNumber ?? data.scriptLine),column=data && (data.columnNumber ?? data.scriptColumn);
      return {name,cat,ph,ts,dur,pid,tid,...(typeof type==='string' && /^[A-Za-z][A-Za-z0-9_-]{0,40}$/.test(type)?{eventType:type}:{}),
        ...(asset?{localCallSite:{asset,...(Number.isSafeInteger(line)&&line>=0?{line}:{}),...(Number.isSafeInteger(column)&&column>=0?{column}:{})}}:{})};
    });
    const navigation=await cdp.evaluate('window.__hdNavCpuProbe && window.__hdNavCpuProbe.read()');
    const login=armLogin?await cdp.evaluate(`(function(){var p=window.__hdCpuLoginArm;if(!p)return null;return {state:p.state,
      startup:(window.__HD_STARTUP_TIMING__||[]).filter(function(e){return e.atEpochMs>=p.state.origin+p.state.submitAt}).map(function(e){return {name:e.name,atEpochMs:e.atEpochMs,durationMs:e.durationMs}})}})()`):undefined;
    await writeFile(`${output}/task-metadata.json`, JSON.stringify({tasks,navigation,login,captureNavigationProbe,
      scope:'Timeline timing/type/PID/TID metadata only, no args. Instrumented diagnostic, not a clean interaction benchmark. When captureNavigationProbe=false no DOM mutation/readiness observer is installed; navigation timings are unmeasured.'}));
  }
  for (const event of events) for (const node of event.args?.data?.cpuProfile?.nodes || []) {
    if (node.callFrame?.url) node.callFrame.url = node.callFrame.url.split(/[?#]/)[0];
  }
  await writeFile(`${output}/cpu-trace.json`, JSON.stringify({ events, scope: `${captureSeconds}-second on-device V8 CPU diagnostic, not a latency benchmark; only CPU sample events retained` }));
  console.log(JSON.stringify({ events: events.length, nodes: events.reduce((n,e)=>n+(e.args?.data?.cpuProfile?.nodes?.length || 0),0) }));
} finally {
  if(armLogin)try{await cdp.evaluate('window.__hdCpuLoginArm && window.__hdCpuLoginArm.restore()')}catch{/* lost renderer */}
  if(captureTasks)try{await cdp.evaluate('window.__hdNavCpuProbe && window.__hdNavCpuProbe.restore()')}catch{/* lost renderer */}
  stop(); cdp.close();
}
