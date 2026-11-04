import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import {chromium} from 'playwright-core';
import {chromiumLaunchOptions} from '../tests/helpers/chromium-launch-options.mjs';
const root='test-results/performance-upgrade-20261103';
const result={at:new Date().toISOString(),status:'RUNNING',syntheticOnly:true,productionRequests:0,
 conditions:'Separate desktop Chromium diagnostic with explicit GC at checkpoints; retained objects only, NOT natural Android RAM, UI latency, or clean soak acceptance. Shared Windows host. Real app bundles, local demo SDK and fake identity.',cohorts:[]};
const persist=()=>fs.writeFile(`${root}/dom-retention-diagnostic.json`,JSON.stringify(result,null,2));
const routes=['home','order_requests','orders','customers','products','pricing','price_quotes','warehouse_import','warehouse_dispatch','delivery_reports','asset_management','debt','finance','bank_payments','messages','company_attendance','payroll','employee_reviews','employees','settings','role_permissions','billing','executive_dashboard'];
for(const cohort of ['after-integrated','after-share-memory']){
 const publicDir=path.resolve(root,cohort,'capacitor-project/app/src/main/assets/public');
 const server=http.createServer(async(req,res)=>{try{const p=new URL(req.url,'http://127.0.0.1').pathname,file=path.resolve(publicDir,'.'+(p==='/'?'/index.html':decodeURIComponent(p)));if(!file.startsWith(publicDir+path.sep))throw Error('outside fixture');res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.png')?'image/png':'text/html');res.end(await fs.readFile(file))}catch{res.writeHead(404);res.end()}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
 const browser=await chromium.launch(chromiumLaunchOptions()),context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage();
 const row={cohort,measurements:[],errors:[],blocked:[],completedRoutes:0};result.cohorts.push(row);await persist();
 await context.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin===origin||u.hostname==='127.0.0.1'&&['8185','9199','5002'].includes(u.port))return route.continue();row.blocked.push(u.origin);return route.abort()});page.on('pageerror',e=>row.errors.push(e.message));
 try{
  await page.goto(origin);await page.locator('input[type=tel]').fill('0900000001');await page.locator('input[type=password]').fill('Local-fixture-only-2026!');await page.getByRole('button',{name:'Vào Ứng Dụng',exact:true}).click();
  await page.waitForFunction(()=>Number.isFinite(window.__hdVerification?.homeDataReadyMs),{timeout:30000});
  const cdp=await context.newCDPSession(page);await cdp.send('Performance.enable');
  const measure=async cycle=>{await cdp.send('HeapProfiler.collectGarbage');await page.waitForTimeout(100);const heap=await cdp.send('Runtime.getHeapUsage'),dom=await cdp.send('Memory.getDOMCounters'),state=await page.evaluate(()=>({sdk:window.__hdSdkListenerCounters,workerCounters:window.__hdVerification.workerCounters,workers:window.__hdVerification.workersCreated-window.__hdVerification.workersTerminated}));row.measurements.push({cycle,heap,dom,state});await persist()};
  await measure(0);
  const heapCheckpoint=async cycle=>{
   let chunks=[];const handler=e=>chunks.push(e.chunk);cdp.on('HeapProfiler.addHeapSnapshotChunk',handler);
   try{await cdp.send('HeapProfiler.takeHeapSnapshot',{reportProgress:false});const snapshot=path.join(root,`dom-retention-${cohort}-${cycle}.heapsnapshot`);await fs.writeFile(snapshot,chunks.join(''));(row.snapshots||=[]).push({cycle,file:snapshot})}
   finally{cdp.off('HeapProfiler.addHeapSnapshotChunk',handler);chunks=[]}
  };
  for(let cycle=1;cycle<=10;cycle++){
   for(const id of routes){
    if(id==='home')await page.getByRole('button',{name:'Trang chủ',exact:true}).filter({visible:true}).first().click();
    else {await page.locator('button[aria-label="Thêm"]').filter({visible:true}).first().click();await page.locator(`[data-hd-more-module="${id}"]`).click();}
    await page.waitForFunction(id=>{const m=document.querySelector(`main[data-hd-module="${id}"]`);return m&&window.__hdSourceContract(m,id,window.__hdPlans).sourcesReady&&!window.__hdModulePending(m)},id,{timeout:30000});
    await page.waitForTimeout(100);row.completedRoutes++;
   }
   await page.getByRole('button',{name:'Trang chủ',exact:true}).filter({visible:true}).first().click();await page.waitForTimeout(400);await measure(cycle);
   if(cycle===1||cycle===10)await heapCheckpoint(cycle);
  }
  row.logoutMethod='Existing public component callback, same as Android soak; synthetic role only';
  row.logoutInvoked=await page.evaluate(()=>{const m=document.querySelector('main[data-hd-module]'),k=m&&Object.keys(m).find(k=>k.startsWith('__reactFiber$'));let f=k&&m[k];for(let n=0;f&&n<100;n++,f=f.return)if(typeof f.memoizedProps?.onLogout==='function'){f.memoizedProps.onLogout();return true}return false});
  if(!row.logoutInvoked)throw Error('No public logout callback');await page.locator('input[type=tel]').waitFor();await page.waitForTimeout(1000);await measure('logout');await heapCheckpoint('logout');row.status='DIAGNOSTIC_COMPLETED';
 }catch(e){row.status='FAILED';row.error=e.message;process.exitCode=1}
 finally{await context.close();await browser.close();await new Promise(r=>server.close(r));await persist()}
}
result.endedAt=new Date().toISOString();result.status=result.cohorts.every(c=>c.status==='DIAGNOSTIC_COMPLETED')?'DIAGNOSTIC_COMPLETED_NOT_MEMORY_ACCEPTANCE':'FAILED';await persist();console.log(JSON.stringify({status:result.status,cohorts:result.cohorts.map(c=>({cohort:c.cohort,status:c.status,routes:c.completedRoutes,error:c.error,measurements:c.measurements}))}));
