import fs from'node:fs/promises';import http from'node:http';import path from'node:path';import assert from'node:assert/strict';import{chromium}from'playwright-core';import{chromiumLaunchOptions}from'../tests/helpers/chromium-launch-options.mjs';
const root='test-results/performance-upgrade-20261103',optimized=process.argv[2]||'after-stable-search';if(!/^after-[a-z0-9-]+$/.test(optimized))throw Error('Invalid optimized cohort');const output=`${root}/product-dom-ab-${optimized}.json`,browser=await chromium.launch(chromiumLaunchOptions());
const report={at:new Date().toISOString(),status:'RUNNING',conditions:'Actual emitted App, local rich demo fixture; Chromium desktop CPU throttled 6x, 390x844 viewport, same low-power 15-row paging. Warm index, broad matching queries; not Android or cloud authentication acceptance.',productionRequests:0,cohorts:[]};
try{for(const candidate of['after-native-probe',optimized]){
 const dir=path.resolve(root,candidate,'capacitor-project/app/src/main/assets/public'),server=http.createServer(async(req,res)=>{try{const p=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname),file=path.resolve(dir,'.'+(p==='/'?'/index.html':p));if(!file.startsWith(dir+path.sep))throw Error('Outside');res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.png')?'image/png':'text/html');res.end(await fs.readFile(file))}catch{res.writeHead(404);res.end()}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`,context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage(),row={candidate,queries:[],errors:[]};report.cohorts.push(row);
 await context.route('**/*',route=>{const u=new URL(route.request().url());return u.origin===origin||u.hostname==='127.0.0.1'&&['8185','9199','5002'].includes(u.port)?route.continue():route.abort()});page.on('pageerror',e=>row.errors.push(e.message));
 try{
  await page.goto(origin);await page.locator('input[type=tel]').fill('0900000001');await page.locator('input[type=password]').fill('Local-fixture-only-2026!');await page.getByRole('button',{name:'Vào Ứng Dụng',exact:true}).click();
  await page.waitForFunction(()=>{const m=document.querySelector('main[data-hd-module=home]');return m&&window.__hdSourceContract(m,'home',window.__hdPlans).sourcesReady&&!window.__hdModulePending(m)});
  await page.evaluate(()=>document.documentElement.classList.add('hd-low-power-ui'));await page.getByRole('button',{name:'Thêm',exact:true}).click();await page.locator('[data-hd-more-module=products]').click();
  await page.waitForFunction(()=>{const m=document.querySelector('main[data-hd-module=products]');return m&&window.__hdSourceContract(m,'products',window.__hdPlans).sourcesReady&&!window.__hdModulePending(m)});
  await page.getByRole('button',{name:'Tìm kiếm',exact:true}).filter({visible:true}).first().click();const input=page.getByPlaceholder(/Tìm sản phẩm/).filter({visible:true}).first();
  await input.fill('no-match-fictional');await page.waitForFunction(()=>!document.querySelector('main[data-hd-module=products] [aria-busy=true]')&&!document.querySelector('.hd-product-list__name'));await input.fill('');await page.waitForFunction(()=>document.querySelectorAll('.hd-product-list__name').length===15);
  const expected=await page.locator('.hd-product-list__name').allTextContents(),cdp=await context.newCDPSession(page);await cdp.send('Emulation.setCPUThrottlingRate',{rate:6});
  for(let i=0;i<20;i++){
   const query=['s','sy','syn','synthetic','product'][i%5];
   await page.evaluate(()=>{const main=document.querySelector('main[data-hd-module=products]'),list=main.querySelector('.hd-product-list');let started,seenBusy=false,finishing=false,addedRows=0,removedRows=0,pending;
    window.__productDomPromise=new Promise((resolve,reject)=>{const timer=setTimeout(()=>{observer.disconnect();reject(Error('Search did not complete its actual busy/answer cycle'))},10000);
     const observer=new MutationObserver(records=>{
      if(started==null)return;
      for(const record of records)for(const[key,add]of[['addedNodes',true],['removedNodes',false]])for(const node of record[key]||[]){if(node.nodeType!==1)continue;const count=Number(node.matches('[role=listitem]'))+node.querySelectorAll('[role=listitem]').length;if(add)addedRows+=count;else removedRows+=count}
      const busy=Boolean(main.querySelector('[aria-busy=true]'));
      if(busy&&!seenBusy){seenBusy=true;pending={rows:list.querySelectorAll('[role=listitem]').length,retained:list.dataset.hdSearchRetained==='true',deleteDisabled:[...list.querySelectorAll('button')].every(b=>b.disabled||b.matches(':disabled'))};const item=list.querySelector('.hd-product-list__primary');if(pending.retained&&item)item.click();pending.editorOpened=Boolean(main.querySelector('.hd-product-editor-layer'))}
      if(seenBusy&&!busy&&!finishing){finishing=true;requestAnimationFrame(()=>requestAnimationFrame(()=>{clearTimeout(timer);observer.disconnect();resolve({ms:performance.now()-started,addedRows,removedRows,pending,names:[...main.querySelectorAll('.hd-product-list__name')].map(e=>e.textContent.trim())})}))}
     });observer.observe(main,{childList:true,subtree:true,attributes:true,attributeFilter:['aria-busy']});document.addEventListener('input',()=>{started=performance.now()},{capture:true,once:true});
    });
   });
   await input.fill(query);const result=await page.evaluate(()=>window.__productDomPromise);assert.deepEqual(result.names,expected);assert.equal(result.pending.editorOpened,false);if(candidate===optimized){assert.equal(result.pending.retained,true);assert.equal(result.pending.deleteDisabled,true);assert.equal(result.removedRows,0);assert.equal(result.addedRows,0)}row.queries.push({query,...result});
  }
  assert.equal(row.errors.length,0);const sorted=row.queries.map(q=>q.ms).sort((a,b)=>a-b);row.summary={n:sorted.length,p50:sorted[9],p95:sorted[18],max:sorted.at(-1),removedRows:row.queries.reduce((n,q)=>n+q.removedRows,0)};row.status='MEASURED_LOCAL_NOT_ANDROID_ACCEPTANCE';
 }catch(error){row.status='FAILED';row.error=error.message;process.exitCode=1}
 finally{await context.close();await new Promise(r=>server.close(r));await fs.writeFile(output,JSON.stringify(report,null,2))}
}}finally{await browser.close();report.endedAt=new Date().toISOString();report.status=report.cohorts.length===2&&report.cohorts.every(r=>r.status==='MEASURED_LOCAL_NOT_ANDROID_ACCEPTANCE')?'MEASURED_WITH_DATA_AND_PENDING_ACTION_GUARDS':'FAILED';await fs.writeFile(output,JSON.stringify(report,null,2));console.log(JSON.stringify(report.cohorts.map(({queries,...r})=>r)))}
