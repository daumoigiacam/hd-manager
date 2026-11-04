import fs from'node:fs/promises';import http from'node:http';import path from'node:path';import{chromium}from'playwright-core';import{chromiumLaunchOptions}from'../tests/helpers/chromium-launch-options.mjs';
const candidate=process.argv[2]||'after-startup-split';if(!/^after-[a-z0-9-]+$/.test(candidate))throw Error('Invalid cohort');
const root='test-results/performance-upgrade-20261103',dir=path.resolve(root,candidate,'capacitor-project/app/src/main/assets/public'),out=`${root}/web-roles-${candidate}.json`;
const server=http.createServer(async(req,res)=>{try{const p=new URL(req.url,'http://127.0.0.1').pathname,file=path.resolve(dir,'.'+(p==='/'?'/index.html':decodeURIComponent(p)));if(!file.startsWith(dir+path.sep))throw Error('outside fixture');res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.png')?'image/png':'text/html');res.end(await fs.readFile(file))}catch{res.writeHead(404);res.end()}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`,browser=await chromium.launch(chromiumLaunchOptions());
const report={at:new Date().toISOString(),candidate,status:'RUNNING',productionRequests:0,conditions:'Functional browser smoke of actual emitted lazy chunks using real SDK/demo Emulator and local synthetic identity. Shared Windows host, no real business data. Shell/data/paint observations are local web only, not Android cold TTID or production authentication P95.',roles:[]};
if(process.argv.includes('--rich'))report.fixture=JSON.parse(await fs.readFile(`${root}/rich-service/fixture-manifest.json`,'utf8'));
try{for(const[role,identifier]of[['manager','0900000001'],['sales','0900000002'],['customer','0900000003']]){
 const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage(),row={role,errors:[],blocked:[],routes:[]};report.roles.push(row);await fs.writeFile(out,JSON.stringify(report,null,2));
 await context.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin===origin||u.hostname==='127.0.0.1'&&['8185','9199','5002'].includes(u.port))return route.continue();row.blocked.push(u.origin);return route.abort()});page.on('pageerror',error=>row.errors.push(error.message));
 try{
  await page.goto(origin);await page.locator('input[type=tel]').fill(identifier);await page.locator('input[type=password]').fill('Local-fixture-only-2026!');
  await page.evaluate(()=>document.addEventListener('click',event=>{const button=event.target.closest('button');if(button?.textContent.trim()==='Vào Ứng Dụng')window.__upgradeRoleLogin=performance.now()},true));
  await page.getByRole('button',{name:'Vào Ứng Dụng',exact:true}).click();
  await page.waitForFunction(()=>Boolean(document.querySelector('main[data-hd-module]')||document.querySelector('.customer-portal-shell')));
  row.shellMs=await page.evaluate(()=>performance.now()-window.__upgradeRoleLogin);
  if(role==='customer'){
   await page.waitForFunction(()=>{const main=document.querySelector('.customer-portal-main');return main&&!main.querySelector('[data-hd-customer-bootstrap-status]')});row.catalogReadyMs=await page.evaluate(()=>performance.now()-window.__upgradeRoleLogin);row.financialDataReady='NOT_VERIFIED_BY_THIS_ROUTE_SMOKE';
   const nav=page.locator('.customer-portal-nav button');const labels=await nav.allTextContents();for(const label of labels){await nav.filter({hasText:label.trim()}).click();await page.waitForTimeout(100);row.routes.push({label:label.trim(),visible:Boolean(await page.locator('.customer-portal-main').isVisible())})}
   row.limitations=report.fixture?['Rich customer has 1000 configured products. This route smoke does not certify each cart mutation; the existing portal limits initial catalog cards to 80, while full-catalog search is separate.']:['Default baseline fixture has no configured fixed products; this smoke does not certify cart/product completeness. The rich linked cohort is separate.'];
  }else{
   await page.waitForFunction(()=>{const m=document.querySelector('main[data-hd-module="home"]');return m&&window.__hdSourceContract(m,'home',window.__hdPlans).sourcesReady&&!window.__hdModulePending(m)});row.dataReadyMs=await page.evaluate(()=>performance.now()-window.__upgradeRoleLogin);
   await page.locator('button[aria-label="Thêm"]').filter({visible:true}).first().click();const ids=await page.locator('button[data-hd-more-module]').evaluateAll(list=>list.filter(e=>e.getClientRects().length).map(e=>e.dataset.hdMoreModule));
   for(const id of ids){
    // Personal attendance has its own footer and an explicit exit control.
    // Exercise that control rather than waiting for the main footer beneath it.
    if(!await page.locator('button[aria-label="Thêm"]').filter({visible:true}).count())await page.getByRole('button',{name:'Quay lại',exact:true}).filter({visible:true}).first().click();
    await page.locator('button[aria-label="Thêm"]').filter({visible:true}).first().click();await page.locator(`[data-hd-more-module="${id}"]`).click();await page.waitForFunction(id=>{const m=document.querySelector(`main[data-hd-module="${id}"]`);return m&&window.__hdSourceContract(m,id,window.__hdPlans).sourcesReady&&!window.__hdModulePending(m)},id);row.routes.push({id,ready:true})}
  }
  row.status=row.errors.length?'FAILED_JS_ERRORS':'FUNCTIONAL_LOCAL_WEB_SMOKE_PASS';await page.screenshot({path:`${root}/web-${candidate}-${role}.png`});
 }catch(error){row.status='FAILED';row.error=error.message;row.body=(await page.locator('body').innerText()).slice(0,1000);process.exitCode=1}
 finally{await context.close();await fs.writeFile(out,JSON.stringify(report,null,2))}
}}finally{await browser.close();await new Promise(r=>server.close(r));report.endedAt=new Date().toISOString();report.status=report.roles.every(r=>r.status==='FUNCTIONAL_LOCAL_WEB_SMOKE_PASS')?'FUNCTIONAL_LOCAL_WEB_SMOKE_PASS_NOT_PERFORMANCE_ACCEPTANCE':'FAILED';await fs.writeFile(out,JSON.stringify(report,null,2));console.log(JSON.stringify(report.roles.map(({body,...row})=>row)))}
