import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {build,preview} from 'vite';
import {chromium} from 'playwright-core';
import {extractBrowserInteraction} from './helpers/browser-interaction-timing.mjs';
const output=process.env.HD_CONTROLLED_UI_OUTPUT || 'test-results/cooperative-data-ui-20261031';fs.mkdirSync(output,{recursive:true});
const baseline=process.env.HD_CONTROLLED_UI_BASELINE || 'test-results/android10-backup-auth-init-fixed';
const oldBuild=path.join(baseline,'public/assets');
const replacements=new Map();
for(const file of fs.readdirSync(oldBuild).filter(file=>file.endsWith('.js.map'))){
  const map=JSON.parse(fs.readFileSync(path.join(oldBuild,file),'utf8'));
  map.sources.forEach((source,index)=>{
    for(const wanted of ['src/App.jsx','src/services/realtimeSnapshotItems.js','src/utils/salesRevenuePeriod.js']){
      if(source.replaceAll('\\','/').endsWith('/'+wanted))replacements.set(wanted,map.sourcesContent[index]);
    }
  });
}
assert.equal(replacements.size,3,'Baseline must come from the exact prior Acceptance source maps');
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const manifest=[...replacements].map(([file,before])=>({file,beforeSha256:sha(before),afterSha256:sha(fs.readFileSync(file))}));
const identity=JSON.parse(fs.readFileSync(path.join(baseline,'installed-apk-identity.json')));
assert.equal(manifest.find(x=>x.file==='src/App.jsx').beforeSha256,identity.sources['src/App.jsx']);
Object.assign(process.env,{VITE_DATA_MODE:'preview',VITE_ALLOW_PREVIEW_BUILD:'true',VITE_PERFORMANCE_PROFILE:'false',VITE_PERFORMANCE_MONITOR:'false'});
for(const variant of ['before','after'])await build({build:{outDir:`${output}/${variant}`},logLevel:'error',plugins:variant==='before'?[{
  name:'fixed-prior-snapshot-source',enforce:'pre',transform(code,id){const clean=id.replaceAll('\\','/');for(const [file,source]of replacements)if(clean.endsWith('/'+file))return source;},
}]:[]});
const make=(n,prefix,data)=>Object.fromEntries(Array.from({length:n},(_,i)=>{const id=prefix+i;return[id,{id,companyId:'comp_preview',...data(i)}]}));
const fixture={products:make(600,'p',i=>({name:`Sản phẩm ${i}`,unit:'Kg',price:50000,category:'Gà',isArchived:false})),
  customers:make(360,'c',i=>({name:`Khách ${String(i).padStart(3,'0')}`,phone:`09${String(i).padStart(8,'0')}`,empId:'emp_sales_01',isArchived:false})),
  orders:make(1800,'o',i=>({customerId:'c'+i%360,date:'2026-10-31',status:'completed',amount:100000+i,finalTotal:100000+i,
    items:[{productId:'p'+i%600,quantity:2,unitPrice:50000,amount:100000}]})),
  payments:make(900,'pay',i=>({customerId:'c'+i%360,date:'2026-10-31',amount:50000,status:'approved',isApproved:true}))};
const routes=[['home','Trang chủ',true],['order_requests','Đặt hàng',true],['warehouse_dispatch','Xuất kho',true],
  ['products','Kho sản phẩm'],['customers','Khách hàng'],['debt','Sổ nợ'],['finance','Thu chi'],['payroll','Bảng lương'],['price_quotes','Báo giá hàng loạt']];
const samples=[],failures=[],memory=[],servers=new Map();
fs.writeFileSync(output+'/manifest.json',JSON.stringify({baselineApk:identity.hostSha256,sources:manifest,routes:routes.map(r=>r[0]),
  blockOrder:['before','after','after','before'],roundsPerBlock:2,cpuThrottle:6,viewport:{width:390,height:844},
  scope:'Controlled source comparison, production React on desktop Chrome with synthetic isolated preview. No real Firebase, API latency or universal phone guarantee.'},null,2));
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try{
  for(const variant of ['before','after'])servers.set(variant,await preview({build:{outDir:`${output}/${variant}`},preview:{host:'127.0.0.1',port:0},logLevel:'error'}));
  for(const [block,variant]of ['before','after','after','before'].entries()){
    const origin='http://127.0.0.1:'+servers.get(variant).httpServer.address().port;
    const context=await browser.newContext({viewport:{width:390,height:844}});
    await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
    await context.addInitScript(fixture=>{
      Object.defineProperty(navigator,'hardwareConcurrency',{get:()=>4});
      window.__initial_auth_token='hd-preview-auth-v1:'+encodeURIComponent(JSON.stringify({uid:'emp_admin',appUserId:'emp_admin',identityId:'emp_admin',companyId:'comp_preview',role:'super_admin',accountType:'employee'}));
      localStorage.setItem('hd-manager-local-db-v2-clean-preview',JSON.stringify(fixture));
      window.__audit={expected:null,click:null,ready:null,events:[]};
      document.addEventListener('click',event=>{if(event.isTrusted)window.__audit.click=performance.now()},true);
      new PerformanceObserver(list=>{for(const e of list.getEntries())window.__audit.events.push({name:e.name,startTime:e.startTime,duration:e.duration,processingStart:e.processingStart,processingEnd:e.processingEnd,interactionId:e.interactionId})}).observe({type:'event',buffered:true,durationThreshold:16});
      function observe(){const t=window.__audit;if(!t.expected || t.click===null || t.ready!==null)return;const main=document.querySelector('main[data-hd-module="'+t.expected+'"]');if(!main || !main.innerText.trim() || main.querySelector('[data-hd-module-loading],[aria-busy="true"]'))return;
        requestAnimationFrame(()=>requestAnimationFrame(()=>{if(t===window.__audit && t.ready===null && main.isConnected && !main.querySelector('[data-hd-module-loading],[aria-busy="true"]'))t.ready=performance.now()}));}
      new MutationObserver(observe).observe(document,{childList:true,subtree:true,attributes:true,attributeFilter:['data-hd-module','aria-busy']});
      document.addEventListener('click',observe);
    },fixture);
    const page=await context.newPage();let loads=0;
    page.on('domcontentloaded',()=>loads++);page.on('pageerror',error=>failures.push({block,variant,type:'pageerror',message:error.message}));
    const cdp=await context.newCDPSession(page);await cdp.send('Emulation.setCPUThrottlingRate',{rate:6});
    await page.goto(origin,{waitUntil:'domcontentloaded'});await page.locator('main[data-hd-module="home"]').waitFor({timeout:30000});
    const nav=page.locator('[data-hd-navigation="bottom"]');
    for(let round=1;round<=2;round++)for(const [module,label,bottom]of routes){
      try{
        await nav.getByRole('button',{name:'Thêm',exact:true}).click();await page.locator('main[data-hd-module="more"]').waitFor();
        await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
        await page.evaluate(expected=>{window.__audit={expected,click:null,ready:null,events:[]}},module);
        await (bottom?nav:page.locator('main')).getByRole('button',{name:label,exact:true}).click();
        await page.waitForFunction(()=>window.__audit.ready!==null,null,{timeout:20000});await page.waitForTimeout(180);
        const raw=await page.evaluate(()=>({...window.__audit,nodes:document.querySelectorAll('*').length,
          customerCards:[...document.querySelectorAll('[data-customer-card]')].slice(0,10).map(c=>({name:c.querySelector('.hd-customer-card__name')?.textContent.trim(),stats:c.querySelector('.hd-customer-card__stats-row')?.textContent.replace(/\s+/g,' ').trim()}))}));
        const event=extractBrowserInteraction(raw.events,raw.click);
        samples.push({block,variant,round,module,domReadyMs:raw.ready-raw.click,eventTimingMs:event.durationMs,eventStatus:event.status,raw});
      }catch(error){failures.push({block,variant,round,module,message:error.message})}
      fs.writeFileSync(output+'/progress.json',JSON.stringify({samples,failures},null,2));
    }
    memory.push({block,variant,loads,heap:await cdp.send('Runtime.getHeapUsage'),dom:await cdp.send('Memory.getDOMCounters')});
    if(loads!==1)failures.push({block,variant,type:'unexpected-load-count',loads});
    await context.close();
  }
}finally{await browser.close();for(const server of servers.values())await new Promise(r=>server.httpServer.close(r));fs.writeFileSync(output+'/result.json',JSON.stringify({samples,failures,memory},null,2));}
const cards=samples.filter(s=>s.module==='customers').map(s=>s.raw.customerCards);
assert.ok(cards[0]?.length>0);for(const value of cards)assert.deepEqual(value,cards[0],'Customer financial results changed');
const summary=routes.flatMap(([module])=>['before','after'].map(variant=>{
  const selected=samples.filter(s=>s.module===module && s.variant===variant);
  const dom=selected.map(s=>s.domReadyMs).sort((a,b)=>a-b),events=selected.map(s=>s.eventTimingMs).filter(x=>x!==null).sort((a,b)=>a-b);
  return {module,variant,attempts:selected.length,domMedianMs:dom[Math.floor(dom.length/2)]??null,domMaxMs:dom.at(-1)??null,
    eventMedianMs:events[Math.floor(events.length/2)]??null,eventMaxMs:events.at(-1)??null,missingEvents:selected.length-events.length,
    gate:failures.length || selected.length!==4?'UNVERIFIED':dom.at(-1)<=100 && events.length===selected.length && events.at(-1)<=100?'PASS_MEASURED_SAMPLES_ONLY':'FAIL'};
}));
fs.writeFileSync(output+'/summary.json',JSON.stringify({summary,failures,scope:'No missing sample treated as zero/PASS. Four observations/module/variant do not establish p95. DOM-ready includes no busy/loading flags and two RAF, not compositor paint or cloud ACK; EventTiming duration uses the entire browser interaction group.'},null,2));
console.log(JSON.stringify({visits:samples.length,failures,summary}));if(failures.length)process.exitCode=1;
