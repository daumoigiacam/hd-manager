import fs from 'node:fs/promises';
import http from 'node:http';
import { build } from 'esbuild';
import { chromium } from 'playwright-core';
import { extractBrowserInteraction } from './helpers/browser-interaction-timing.mjs';

// Fixed demo project and loopback transport only. Never import app config/Auth.
const project = 'demo-hdm-cache-lab', emulator = 'http://127.0.0.1:9195';
const output = process.env.HD_CACHE_LAB_OUTPUT || 'test-results/firestore-cache-ui-20261031';
const count = Number(process.env.HD_CACHE_LAB_RECORDS || 6000);
if (!Number.isSafeInteger(count) || count < 100 || count > 15000) throw Error('Invalid synthetic record count');
await fs.mkdir(output, { recursive: true });
for (let start = 0; start < count; start += 400) {
  const writes = Array.from({ length: Math.min(400, count - start) }, (_, i) => {
    const id = `fixture-${start + i}`;
    const fields = { companyId: { stringValue: 'fixture' }, status: { stringValue: 'active' },
      amount: { integerValue: String(start + i + 1) }, items: { arrayValue: { values: Array.from({ length: 20 }, (_, j) => ({
        mapValue: { fields: { productId: { stringValue: `synthetic-product-${j}` }, quantity: { integerValue: '2' },
          unitPrice: { integerValue: '50000' }, attributeLabel: { stringValue: 'Synthetic attribute' } } },
      })) } } };
    return { update: { name: `projects/${project}/databases/(default)/documents/orders/${id}`, fields } };
  });
  const response = await fetch(`${emulator}/v1/projects/${project}/databases/(default)/documents:commit`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ writes }),
  });
  if (!response.ok) throw Error(`Local fixture seed failed: ${response.status}`);
}
const bundled = await build({ stdin: { resolveDir: process.cwd(), loader: 'js', contents: `
  import {initializeApp} from 'firebase/app';
  import {initializeFirestore,connectFirestoreEmulator,collection,query,where,onSnapshot,
    memoryLocalCache,persistentLocalCache,persistentSingleTabManager} from 'firebase/firestore';
  window.prepare=async function(mode){
    const app=initializeApp({projectId:${JSON.stringify(project)},apiKey:'synthetic-only',appId:'synthetic-cache-lab'});
    const db=initializeFirestore(app,{experimentalAutoDetectLongPolling:false,useFetchStreams:true,
      localCache:mode==='persistent'?persistentLocalCache({cacheSizeBytes:40*1024*1024,tabManager:persistentSingleTabManager()}):memoryLocalCache()});
    connectFirestoreEmulator(db,'127.0.0.1',9195);
    const anchor=query(collection(db,'orders'),where('companyId','==','fixture'));
    const target=query(collection(db,'orders'),where('companyId','==','fixture'),where('status','==','active'));
    await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Anchor server confirmation timeout')),45000);
      onSnapshot(anchor,{includeMetadataChanges:true},s=>{if(!s.metadata.fromCache && s.size===${count}){clearTimeout(timer);resolve()}},reject)});
    // An anchor keeps the immutable records present while another query is
    // detached/reopened. Both modes observe the identical complete fixture.
    let unsubscribe;
    await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Target server confirmation timeout')),45000);
      unsubscribe=onSnapshot(target,{includeMetadataChanges:true},s=>{if(!s.metadata.fromCache && s.size===${count}){clearTimeout(timer);resolve()}},reject)});
    unsubscribe();
    window.trial=null;window.events=[];window.errors=[];
    new PerformanceObserver(list=>{for(const e of list.getEntries())window.events.push({name:e.name,interactionId:e.interactionId,duration:e.duration,processingStart:e.processingStart,startTime:e.startTime})}).observe({type:'event',buffered:true,durationThreshold:16});
    new PerformanceObserver(list=>{if(window.trial)for(const e of list.getEntries())window.trial.tasks.push({start:e.startTime,duration:e.duration})}).observe({entryTypes:['longtask']});
    const button=document.querySelector('button'),status=document.querySelector('[role=status]');
    button.onclick=function(){
      const t=window.trial;t.started=performance.now();status.textContent='Updating synthetic records';
      requestAnimationFrame(()=>requestAnimationFrame(()=>{t.feedback=performance.now()}));
      const start=()=>{t.subscribeStarted=performance.now();unsubscribe=onSnapshot(target,{includeMetadataChanges:true},s=>{
        if(s.metadata.fromCache || s.size!==${count})return;
        t.serverAt=performance.now();t.count=s.size;status.textContent='Ready: '+s.size;
        requestAnimationFrame(()=>requestAnimationFrame(()=>{t.ready=performance.now()}));
      },error=>{window.errors.push(error.code||error.message)})};
      if(t.deferred)requestAnimationFrame(()=>requestAnimationFrame(()=>setTimeout(start,0)));else start();
    };
    window.beginTrial=async function(deferred){unsubscribe();window.trial=null;await new Promise(r=>setTimeout(r,300));
      window.events=[];window.trial={deferred,started:null,subscribeStarted:null,feedback:null,serverAt:null,ready:null,count:null,tasks:[]};};
  };
` }, bundle: true, write: false, format: 'iife', define: { 'process.env.NODE_ENV': '"production"' } });
const script = bundled.outputFiles[0].text;
const server = http.createServer((request, response) => {
  if (request.url === '/lab.js') { response.setHeader('Content-Type', 'application/javascript'); response.end(script); }
  else { response.setHeader('Content-Type', 'text/html'); response.end('<button>Reopen query</button><div role="status">Prepare</div><script src="/lab.js"></script>'); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const samples = [], failures = [];
try {
  for (const [block, mode] of ['memory','persistent','persistent','memory'].entries()) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    page.on('pageerror', error => failures.push({ block, mode, error: error.message }));
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin === origin || url.origin === emulator) return route.continue();
      failures.push({ block, mode, error: `Blocked unexpected origin: ${url.origin}` });return route.abort();
    });
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 });
    await page.goto(origin);
    await page.evaluate(mode => window.prepare(mode), mode);
    for (let round = 0; round < 3; round++) for (const deferred of [false, true]) {
      await page.evaluate(deferred => window.beginTrial(deferred), deferred);
      await page.getByRole('button', { name: 'Reopen query' }).click();
      await page.waitForFunction(() => window.trial.ready !== null, null, { timeout: 45000 });
      await page.waitForTimeout(120);
      const raw = await page.evaluate(() => ({ trial: window.trial, events: window.events, errors: window.errors }));
      if (raw.errors.length || raw.trial.count !== count) throw Error('Query failed or incomplete fixture');
      const event = extractBrowserInteraction(raw.events, raw.trial.started);
      samples.push({ block, mode, round, deferred, count, feedbackMs: raw.trial.feedback-raw.trial.started,
        readyMs: raw.trial.ready-raw.trial.started, serverMs: raw.trial.serverAt-raw.trial.started,
        eventTimingMs: event.durationMs, eventStatus: event.status,
        over100Tasks: raw.trial.tasks.filter(t=>t.duration>100).length,
        maxTaskMs: raw.trial.tasks.length ? Math.max(...raw.trial.tasks.map(t=>t.duration)) : null, raw });
      await fs.writeFile(`${output}/progress.json`, JSON.stringify({ samples, failures }, null, 2));
    }
    await context.close();
  }
} catch (error) { failures.push({ error: error.message }); throw error; }
finally {
  await fs.writeFile(`${output}/result.json`, JSON.stringify({ project, emulator, count, cpuThrottle: 6,
    order: ['memory','persistent','persistent','memory'], samples, failures,
    scope:'Synthetic SDK cache experiment on desktop Chrome, CPU6. No authentication/app data/cloud access. Feedback is distinct from complete server-confirmed result. Missing EventTiming stays null, never PASS. Not Android or whole-app acceptance.' }, null, 2));
  await browser.close();await new Promise(resolve=>server.close(resolve));
}
const summary = ['memory','persistent'].flatMap(mode => [false,true].map(deferred => {
  const rows=samples.filter(s=>s.mode===mode && s.deferred===deferred);
  const median=key=>{const values=rows.map(s=>s[key]).filter(Number.isFinite).sort((a,b)=>a-b);return values[Math.floor(values.length/2)]??null};
  return {mode,deferred,samples:rows.length,feedbackMedianMs:median('feedbackMs'),readyMedianMs:median('readyMs'),
    eventMedianMs:median('eventTimingMs'),maxTaskMs:rows.some(s=>s.maxTaskMs!==null)?Math.max(...rows.map(s=>s.maxTaskMs).filter(Number.isFinite)):null,missingEvents:rows.filter(s=>s.eventTimingMs===null).length};
}));
await fs.writeFile(`${output}/summary.json`,JSON.stringify({summary,failures},null,2));console.log(JSON.stringify({summary,failures}));
