import fs from 'node:fs/promises';
import http from 'node:http';
import { build } from 'esbuild';
import { chromium } from 'playwright-core';
import { extractBrowserInteraction } from './helpers/browser-interaction-timing.mjs';

const output = process.env.HD_WORKER_LAB_OUTPUT || 'test-results/firestore-worker-ui-20261031';
const project = 'demo-hdm-cache-lab', emulator = 'http://127.0.0.1:9195', count = 6000;
await fs.mkdir(output, { recursive: true });
const check = await fetch(`${emulator}/v1/projects/${project}/databases/(default)/documents:runAggregationQuery`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ structuredAggregationQuery: {
    structuredQuery: { from: [{ collectionId: 'orders' }], where: { fieldFilter: { field: { fieldPath: 'companyId' }, op: 'EQUAL', value: { stringValue: 'fixture' } } } },
    aggregations: [{ alias: 'total', count: {} }],
  } }), signal: AbortSignal.timeout(10000),
});
const aggregate = await check.json();
if (!check.ok || Number(aggregate[0]?.result?.aggregateFields?.total?.integerValue) !== count) throw Error('Seed the isolated cache lab fixture first');
const sdk = `
  import {initializeApp} from 'firebase/app';
  import {initializeFirestore,connectFirestoreEmulator,collection,query,where,onSnapshot,memoryLocalCache} from 'firebase/firestore';
  async function prepareSdk(){
    const app=initializeApp({projectId:${JSON.stringify(project)},apiKey:'synthetic-only',appId:'synthetic-worker-lab'});
    const db=initializeFirestore(app,{experimentalAutoDetectLongPolling:false,useFetchStreams:true,localCache:memoryLocalCache()});
    connectFirestoreEmulator(db,'127.0.0.1',9195);
    const anchor=query(collection(db,'orders'),where('companyId','==','fixture'));
    const target=query(collection(db,'orders'),where('companyId','==','fixture'),where('status','==','active'));
    const warm=q=>new Promise((resolve,reject)=>{let off;const timer=setTimeout(()=>reject(Error('SDK warm-up timeout')),45000);
      off=onSnapshot(q,{includeMetadataChanges:true},s=>{if(!s.metadata.fromCache && s.size===${count}){clearTimeout(timer);resolve(off)}},reject)});
    await warm(anchor);let off=await warm(target);off();
    return {subscribe(callback){off=onSnapshot(target,{includeMetadataChanges:true},s=>{if(!s.metadata.fromCache && s.size===${count})callback(s)},error=>{throw error})},stop(){off()}};
  }
`;
const worker = await build({ stdin: { resolveDir: process.cwd(), contents: sdk + `
  let api,ack,token=0;
  onmessage=async function(event){const message=event.data;
    if(message.type==='ack'){if(ack){const resolve=ack;ack=null;resolve()}return}
    try{
      if(message.type==='prepare'){api=await prepareSdk();postMessage({type:'prepared'});return}
      if(message.type==='stop'){api.stop();return}
      if(message.type==='start'){
        const current=++token;let sent=false;
        api.subscribe(async snapshot=>{
          if(sent || current!==token)return;sent=true;
          const docs=snapshot.docs;
          for(let start=0;start<docs.length;start+=64){
            if(current!==token)return;
            const rows=docs.slice(start,start+64).map(doc=>({id:doc.id,data:doc.data()}));
            await new Promise(resolve=>{ack=resolve;postMessage({type:'chunk',rows})});
          }
          postMessage({type:'complete',count:docs.length});
        });
      }
    }catch(error){postMessage({type:'error',error:error.message})}
  };
` }, bundle: true, write: false, format: 'iife', target: 'chrome74', define: { 'process.env.NODE_ENV': '"production"' } });
const main = await build({ stdin: { resolveDir: process.cwd(), contents: sdk + `
  const delay=()=>new Promise(resolve=>setTimeout(resolve,0));
  window.prepare=async function(mode){
    let api,worker,done;const rows=new Map();window.errors=[];
    if(mode==='worker'){
      worker=new Worker('/worker.js');
      await new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>reject(Error('Worker preparation timeout')),60000);
        worker.onmessage=e=>{if(e.data.type==='prepared'){clearTimeout(timer);resolve()}
          else if(e.data.type==='error')reject(Error(e.data.error))};
        worker.onerror=e=>reject(Error(e.message));worker.postMessage({type:'prepare'});
      });
      worker.onmessage=event=>{const m=event.data;
        if(m.type==='chunk'){for(const row of m.rows)rows.set(row.id,row.data);worker.postMessage({type:'ack'})}
        else if(m.type==='complete')done(m.count);
        else if(m.type==='error')window.errors.push(m.error);
      };
    }else api=await prepareSdk();
    window.events=[];window.trial=null;
    new PerformanceObserver(list=>{for(const e of list.getEntries())window.events.push({name:e.name,interactionId:e.interactionId,duration:e.duration,processingStart:e.processingStart,startTime:e.startTime})}).observe({type:'event',buffered:true,durationThreshold:16});
    new PerformanceObserver(list=>{if(window.trial)for(const e of list.getEntries())window.trial.tasks.push({start:e.startTime,duration:e.duration})}).observe({entryTypes:['longtask']});
    const button=document.querySelector('button'),status=document.querySelector('[role=status]');
    button.onclick=function(){const t=window.trial;rows.clear();t.started=performance.now();status.textContent='Updating synthetic records';
      requestAnimationFrame(()=>requestAnimationFrame(()=>{t.feedback=performance.now()}));
      done=expected=>{
        t.records=rows.size;t.amountSum=0;t.itemQuantitySum=0;
        for(const row of rows.values()){t.amountSum+=row.amount;for(const item of row.items)t.itemQuantitySum+=item.quantity}
        if(expected!==rows.size)window.errors.push('Incomplete snapshot transfer');
        status.textContent='Ready: '+rows.size;
        requestAnimationFrame(()=>requestAnimationFrame(()=>{t.ready=performance.now()}));
      };
      if(worker)worker.postMessage({type:'start'});
      else{let sent=false;api.subscribe(async snapshot=>{
        if(sent)return;sent=true;const docs=snapshot.docs;
        for(let start=0;start<docs.length;start+=64){for(const doc of docs.slice(start,start+64))rows.set(doc.id,doc.data());await delay()}
        done(docs.length);
      })}
    };
    window.beginTrial=async function(){if(worker)worker.postMessage({type:'stop'});else api.stop();
      window.trial=null;await new Promise(r=>setTimeout(r,300));window.events=[];
      window.trial={started:null,feedback:null,ready:null,records:null,amountSum:null,itemQuantitySum:null,tasks:[]};
    };
  };
` }, bundle: true, write: false, format: 'iife', target: 'chrome74', define: { 'process.env.NODE_ENV': '"production"' } });
const server = http.createServer((request,response)=>{
  if(request.url==='/worker.js' || request.url==='/main.js'){
    response.setHeader('Content-Type','application/javascript');response.end((request.url==='/worker.js'?worker:main).outputFiles[0].text);
  }else{response.setHeader('Content-Type','text/html');response.end('<button>Reopen query</button><div role="status">Prepare</div><script src="/main.js"></script>')}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const samples=[],failures=[];
try{
  for(const [block,mode]of ['main','worker','worker','main'].entries()){
    const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage();
    page.on('pageerror',error=>failures.push({block,mode,error:error.message}));
    await context.route('**/*',route=>{
      const requested=new URL(route.request().url()).origin;
      if(requested===origin || requested===emulator)return route.continue();
      failures.push({block,mode,error:'Blocked unexpected origin: '+requested});return route.abort();
    });
    const cdp=await context.newCDPSession(page);await cdp.send('Emulation.setCPUThrottlingRate',{rate:6});
    await page.goto(origin);await page.evaluate(mode=>window.prepare(mode),mode);
    for(let round=0;round<3;round++){
      await page.evaluate(()=>window.beginTrial());await page.getByRole('button',{name:'Reopen query'}).click();
      await page.waitForFunction(()=>window.trial.ready!==null,null,{timeout:45000});await page.waitForTimeout(120);
      const raw=await page.evaluate(()=>({trial:window.trial,events:window.events,errors:window.errors})),t=raw.trial;
      if(raw.errors.length || t.records!==count || t.amountSum!==count*(count+1)/2 || t.itemQuantitySum!==count*20*2)throw Error('Fixture transfer failed integrity checks');
      const event=extractBrowserInteraction(raw.events,t.started);
      samples.push({block,mode,round,feedbackMs:t.feedback-t.started,readyMs:t.ready-t.started,eventTimingMs:event.durationMs,eventStatus:event.status,
        over100Tasks:t.tasks.filter(t=>t.duration>100).length,maxTaskMs:t.tasks.length?Math.max(...t.tasks.map(t=>t.duration)):null,raw});
      await fs.writeFile(output+'/progress.json',JSON.stringify({samples,failures},null,2));
    }
    await context.close();
  }
}catch(error){failures.push({error:error.message});throw error}
finally{await fs.writeFile(output+'/result.json',JSON.stringify({project,emulator,count,samples,failures,
  scope:'Unauthenticated synthetic SDK worker prototype on desktop Chrome; CPU6 applies to main page only, worker CPU is not proven equivalently throttled. All rows/amounts/nested quantities verified. Not app/Firebase Auth/Android acceptance. Missing EventTiming never means zero latency or PASS.'},null,2));
  await browser.close();await new Promise(resolve=>server.close(resolve));}
console.log(JSON.stringify({samples:samples.map(({block,mode,feedbackMs,readyMs,eventTimingMs,over100Tasks,maxTaskMs})=>({block,mode,feedbackMs,readyMs,eventTimingMs,over100Tasks,maxTaskMs})),failures}));
