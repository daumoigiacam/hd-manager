import fs from'node:fs/promises';import http from'node:http';import path from'node:path';import assert from'node:assert/strict';import{chromium}from'playwright-core';import{chromiumLaunchOptions}from'../tests/helpers/chromium-launch-options.mjs';
const root='test-results/performance-upgrade-20261103',candidate='after-startup-split',dir=path.resolve(root,candidate,'capacitor-project/app/src/main/assets/public');
const server=http.createServer(async(req,res)=>{try{const pathname=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname),file=path.resolve(dir,'.'+(pathname==='/'?'/index.html':pathname));if(!file.startsWith(dir+path.sep))throw Error('Outside');res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.png')?'image/png':'text/html');res.end(await fs.readFile(file))}catch{res.writeHead(404);res.end()}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`,browser=await chromium.launch(chromiumLaunchOptions()),context=await browser.newContext(),page=await context.newPage();
const report={at:new Date().toISOString(),candidate,productionRequests:0,errors:[],cycles:[],conditions:'Actual emitted app, real Firebase SDK/local demo only; disconnect/reconnect is browser network emulation, not physical radio loss. No business writes performed; this does not certify offline queued-write recovery.'};
await context.route('**/*',route=>{const u=new URL(route.request().url());return u.origin===origin||u.hostname==='127.0.0.1'&&['8185','9199','5002'].includes(u.port)?route.continue():route.abort()});page.on('pageerror',e=>report.errors.push(e.message));
try{
 await page.goto(origin);await page.locator('input[type=tel]').fill('0900000001');await page.locator('input[type=password]').fill('Local-fixture-only-2026!');await page.getByRole('button',{name:'Vào Ứng Dụng',exact:true}).click();
 await page.waitForFunction(()=>{const m=document.querySelector('main[data-hd-module=home]');return m&&window.__hdSourceContract(m,'home',window.__hdPlans).sourcesReady&&!window.__hdModulePending(m)});
 const documentOrigin=await page.evaluate(()=>performance.timeOrigin);
 await page.getByRole('button',{name:'Thêm',exact:true}).click();await page.locator('[data-hd-more-module=products]').click();
 await page.waitForFunction(()=>{const m=document.querySelector('main[data-hd-module=products]');return m&&window.__hdSourceContract(m,'products',window.__hdPlans).sourcesReady&&!window.__hdModulePending(m)});
 await page.getByRole('button',{name:'Tìm kiếm',exact:true}).filter({visible:true}).first().click();const input=page.getByPlaceholder(/Tìm sản phẩm/).filter({visible:true}).first();
 for(let cycle=0;cycle<3;cycle++){
  await context.setOffline(true);const query=`Synthetic Product ${900+cycle}`;await input.fill(query);
  await page.waitForFunction(query=>{const m=document.querySelector('main[data-hd-module=products]');return m&&!m.querySelector('[aria-busy=true]')&&[...m.querySelectorAll('.hd-product-list__name')].some(e=>e.textContent.trim()===query)},query);
  const offlineNames=await page.locator('.hd-product-list__name').allTextContents();assert.ok(offlineNames.length);
  await context.setOffline(false);await page.waitForFunction(()=>navigator.onLine);await input.fill('no-match-fictional');await page.waitForFunction(()=>!document.querySelector('main[data-hd-module=products] [aria-busy=true]')&&document.querySelectorAll('.hd-product-list__name').length===0);await input.fill(query);
  await page.waitForFunction(query=>[...document.querySelectorAll('.hd-product-list__name')].some(e=>e.textContent.trim()===query),query);
  assert.deepEqual(await page.locator('.hd-product-list__name').allTextContents(),offlineNames);assert.equal(await page.evaluate(()=>performance.timeOrigin),documentOrigin);
  report.cycles.push({cycle,query,offlineMatches:offlineNames.length,onlineMatches:offlineNames.length,reloaded:false,exact:true});
 }
 assert.equal(report.errors.length,0);report.status='LOCAL_OFFLINE_READ_SEARCH_RECONNECT_PASS';
}catch(e){report.status='FAILED';report.error=e.message;process.exitCode=1}
finally{report.endedAt=new Date().toISOString();await context.setOffline(false);await context.close();await browser.close();await new Promise(r=>server.close(r));await fs.writeFile(`${root}/web-offline-smoke.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report))}
