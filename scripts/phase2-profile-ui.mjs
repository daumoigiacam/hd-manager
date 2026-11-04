import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import {chromium} from 'playwright-core';
import {TraceMap,originalPositionFor} from '@jridgewell/trace-mapping';
import {makeFixture,installFixture} from '../performance/phase2/synthetic-fixture.mjs';
import {chromiumLaunchOptions} from '../tests/helpers/chromium-launch-options.mjs';
const out='test-results/phase2-performance-20261102',root=path.resolve(out,'diagnostic');
const server=http.createServer(async(req,res)=>{try{
 const pathname=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);
 const file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
 if(!file.startsWith(root+path.sep))throw Error('outside fixture');
 res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(await fs.readFile(file));
}catch{res.writeHead(404);res.end()}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch(chromiumLaunchOptions()),context=await browser.newContext({viewport:{width:390,height:844}});
await context.route('**/*',r=>r.request().url().startsWith(origin+'/')?r.continue():r.abort());
await context.addInitScript(installFixture,makeFixture('manager',1000));
const page=await context.newPage(),cdp=await context.newCDPSession(page),errors=[];
page.on('pageerror',e=>errors.push(e.message));const routes=[];
try{
 await page.goto(origin);await page.waitForSelector('main[data-hd-module]');
 await cdp.send('Profiler.enable');await cdp.send('Profiler.setSamplingInterval',{interval:1000});await cdp.send('Profiler.start');
 for(const module of ['home','customers','products','orders','finance','debt','asset_management','payroll','order_requests','warehouse_import','warehouse_dispatch','pricing','price_quotes','employees']){
  const requested=await page.evaluate(module=>{
   const main=document.querySelector('main[data-hd-module]'),key=main&&Object.keys(main).find(k=>k.startsWith('__reactFiber$'));
   let fiber=key&&main[key];for(let i=0;fiber&&i<100;i++,fiber=fiber.return){const p=fiber.memoizedProps;if(typeof p?.setActiveTab==='function'){p.setActiveTab(module);return true}}return false;
  },module);
  await new Promise(r=>setTimeout(r,1000));
  routes.push(await page.evaluate(({module,requested})=>({requestedModule:module,requested,actualModule:document.querySelector('main[data-hd-module]')?.getAttribute('data-hd-module'),nodes:document.getElementsByTagName('*').length}),{module,requested}));
 }
 const {profile}=await cdp.send('Profiler.stop');await fs.writeFile(`${out}/ui-diagnostic.cpuprofile`,JSON.stringify(profile));
 const times=new Map();let gaps=0;
 profile.samples.forEach((id,i)=>{const delta=profile.timeDeltas?.[i];if(!Number.isFinite(delta)||delta<0)return;if(delta>50000)gaps++;times.set(id,(times.get(id)||0)+delta/1000)});
 const byId=new Map(profile.nodes.map(n=>[n.id,n])),maps=new Map(),top=[];
 for(const [id,selfSampleMs] of [...times].sort((a,b)=>b[1]-a[1]).slice(0,80)){
  const frame=byId.get(id).callFrame;let original=null;
  if(frame.url.startsWith(origin+'/assets/')){
   const name=path.basename(new URL(frame.url).pathname);
   if(!maps.has(name))maps.set(name,await fs.readFile(path.join(root,'assets',name+'.map'),'utf8').then(s=>new TraceMap(JSON.parse(s))).catch(()=>null));
   if(maps.get(name))original=originalPositionFor(maps.get(name),{line:frame.lineNumber+1,column:frame.columnNumber});
  }
  top.push({selfSampleMs,functionName:frame.functionName,asset:frame.url.startsWith(origin)?new URL(frame.url).pathname:null,original});
 }
 await fs.writeFile(`${out}/ui-diagnostic-summary.json`,JSON.stringify({at:new Date().toISOString(),scope:'DIAGNOSTIC_WITH_PROFILER_NOT_BENCHMARK; synthetic App, same source but source-mapped build; sample interval sums include idle and off-CPU gaps; no exact function CPU/latency attribution',routes,errors,gapsOver50ms:gaps,top},null,2));
 console.log(JSON.stringify({errors:errors.length,routes:routes.length,appFrames:top.filter(t=>t.original?.source?.includes('/src/')).slice(0,8)}));
}finally{await context.close();await browser.close();await new Promise(r=>server.close(r))}
