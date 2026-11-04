import fs from'node:fs/promises';import http from'node:http';import path from'node:path';import{chromium}from'playwright-core';import{chromiumLaunchOptions}from'../tests/helpers/chromium-launch-options.mjs';import{assertVerificationFixtureReady}from'./helpers/verification-fixture-preflight.mjs';
const candidate=process.argv[2],expectUnsafe=process.argv.includes('--expect-unsafe'),cataloguePending=process.argv.includes('--catalogue-pending');if(!/^after-[a-z0-9-]+$/.test(candidate||''))throw Error('Explicit fixture cohort required');
await assertVerificationFixtureReady();const root='test-results/performance-upgrade-20261103',dir=path.resolve(root,candidate,'capacitor-project/app/src/main/assets/public');
const report={at:new Date().toISOString(),candidate,expectUnsafe,status:'RUNNING',realAccounts:false,productionRequests:0,blocked:[],writeRequests:[],delayed:[],errors:[],conditions:'Functional regression only: actual emitted app, real SDK/local demo, same known customer ledger. Intentionally delay first financial read. Browser mutation + two-RAF stable-value samples; no latency acceptance, no business mutation or Android navigation/GC/install.'};
const server=http.createServer(async(req,res)=>{try{const u=new URL(req.url,'http://127.0.0.1'),file=path.resolve(dir,'.'+(u.pathname==='/'?'/index.html':decodeURIComponent(u.pathname)));if(!file.startsWith(dir+path.sep))throw Error('Outside fixture');res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.png')?'image/png':'text/html');res.end(await fs.readFile(file))}catch{res.writeHead(404);res.end()}});await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port,browser=await chromium.launch(chromiumLaunchOptions());
try{
 const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage();page.setDefaultTimeout(60000);page.on('pageerror',e=>report.errors.push(e.message));
 await context.route('**/*',async route=>{const req=route.request(),u=new URL(req.url());if(u.origin!==origin&&!(u.hostname==='127.0.0.1'&&['8185','9199','5002'].includes(u.port))){report.blocked.push(u.origin);return route.abort()}
  if(u.port==='8185'&&u.pathname.includes('/Write/')){report.writeRequests.push({path:u.pathname});return route.abort()}
  let body=req.postData()||'';try{body=decodeURIComponent(body.replace(/\+/g,'%20'))}catch{}
  if(u.port==='8185'&&report.delayed.length===0&&/orders|payments|customer_points/.test(body)){report.delayed.push({path:u.pathname,method:req.method(),delayMs:cataloguePending?5000:2500});await new Promise(r=>setTimeout(r,cataloguePending?5000:2500))}
  return route.continue();
 });
 await page.addInitScript(()=>{window.__financialGuardSamples=[];let queued=false;function value(label){const m=document.querySelector('.customer-portal-main');if(!m||m.querySelector('[data-hd-customer-bootstrap-status]'))return null;const p=Array.from(m.querySelectorAll('p')).find(p=>p.textContent.trim()===label);return p?.nextElementSibling?.textContent.trim()??null}function snapshot(){const m=document.querySelector('.customer-portal-main');if(!m||m.querySelector('[data-hd-customer-bootstrap-status]'))return null;return{debt:value('Công nợ'),paid:value('Đã thanh toán'),status:m.querySelector('[data-hd-customer-financial-status]')?.getAttribute('data-hd-customer-financial-status')||'UNGUARDED'}}new MutationObserver(()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{const before=snapshot();requestAnimationFrame(()=>{queued=false;const row=snapshot();if(row&&JSON.stringify(row)===JSON.stringify(before)){const a=window.__financialGuardSamples;if(!a.length||JSON.stringify(a[a.length-1])!==JSON.stringify(row)){a.push(row);if(a.length>100)a.shift()}}})})}).observe(document,{childList:true,subtree:true,attributes:true,characterData:true});});
 await page.goto(origin);await page.locator('input[type=tel]').fill('0900000003');await page.locator('input[type=password]').fill('Local-fixture-only-2026!');await page.getByRole('button',{name:'Vào Ứng Dụng',exact:true}).click();
 if(cataloguePending){
  await page.waitForFunction(()=>window.__financialGuardSamples.some(r=>r.status==='loading'));
  await page.locator('.customer-portal-nav button').filter({hasText:'Đặt hàng'}).click();
  await page.locator('input[data-hd-search-input]').fill('Synthetic Product 999');
  await page.waitForFunction(()=>document.querySelector('.customer-portal-main')?.innerText.includes('Synthetic Product 999'));
  report.catalogueWhileFinancePending=await page.locator('.customer-portal-shell').getAttribute('data-hd-customer-financial-source');
  if(report.catalogueWhileFinancePending!=='loading')throw Error('Catalogue independence was not exercised while finance was pending');
  await page.locator('.customer-portal-nav button').filter({hasText:'Trang chủ'}).click();
 }
 await page.waitForFunction(()=>window.__financialGuardSamples.some(r=>r.debt?.replace(/[^0-9]/g,'')==='80000'&&r.paid?.replace(/[^0-9]/g,'')==='40000'));
 report.samples=await page.evaluate(()=>window.__financialGuardSamples);
 report.unsafe=report.samples.filter(r=>r.debt==='0'||r.paid==='0'||r.status==='ready'&&(r.debt?.replace(/[^0-9]/g,'')!=='80000'||r.paid?.replace(/[^0-9]/g,'')!=='40000'));
 report.loading=report.samples.filter(r=>r.status==='loading');
 if(!report.delayed.length)throw Error('Financial delay was not exercised');if(report.errors.length||report.blocked.length||report.writeRequests.length)throw Error('Runtime/network/write guard failed');
 if(expectUnsafe){if(!report.unsafe.length)throw Error('Expected pre-fix unsafe zero was not reproduced');report.status='UNSAFE_ZERO_REPRODUCED_BEFORE_FIX';}
 else{if(report.unsafe.length||!report.loading.length||report.loading.some(r=>r.debt!=='—'||r.paid!=='—'))throw Error('Pending finance exposed a numeric value or loading state was not exercised');report.status='FINANCIAL_GUARD_VERIFIED_NOT_PERFORMANCE_ACCEPTANCE';}
 await page.screenshot({path:root+'/financial-guard-'+candidate+(cataloguePending?'-catalogue':'')+'.png'});await context.close();
}catch(error){report.status='FAILED';report.error=error.message;process.exitCode=1;}finally{await browser.close();await new Promise(r=>server.close(r));report.endedAt=new Date().toISOString();await fs.writeFile(root+'/financial-guard-'+candidate+(cataloguePending?'-catalogue':'')+'.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
