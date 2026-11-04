import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import {chromium} from 'playwright-core';
import {chromiumLaunchOptions} from '../tests/helpers/chromium-launch-options.mjs';
const root='test-results/phase2-verification-20261102',publicDir=path.resolve(root,'capacitor-project/app/src/main/assets/public');
const server=http.createServer(async(req,res)=>{try{
 const pathname=new URL(req.url,'http://127.0.0.1').pathname;
 const file=path.resolve(publicDir,'.'+(pathname==='/'?'/index.html':decodeURIComponent(pathname)));
 if(!file.startsWith(publicDir+path.sep))throw Error('outside fixture');
 res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(await fs.readFile(file));
}catch{res.writeHead(404);res.end()}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch(chromiumLaunchOptions()),context=await browser.newContext({viewport:{width:390,height:844}}),blocked=[],errors=[],steps=[];
await context.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin===origin||u.hostname==='127.0.0.1'&&['8185','9199','5002'].includes(u.port))return route.continue();blocked.push(u.origin);return route.abort()});
const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto(origin);await page.locator('input[type=tel]').waitFor({timeout:20000});
 await page.locator('input[type=tel]').fill('0900000001');await page.locator('input[type=password]').fill('Local-fixture-only-2026!');
 const start=Date.now();await page.getByRole('button',{name:'Vào Ứng Dụng',exact:true}).click();
 await page.waitForSelector('main[data-hd-module]',{timeout:30000});
 steps.push({kind:'synthetic-emulator-login-to-shell',wallMs:Date.now()-start});
 await new Promise(r=>setTimeout(r,15000));
 const state=await page.evaluate(()=>({module:document.querySelector('main[data-hd-module]')?.getAttribute('data-hd-module'),probe:window.__hdVerification,mainSdkCounters:window.__hdSdkListenerCounters,
  startup:window.__HD_STARTUP_TIMING__?.map(e=>({name:e.name,durationMs:e.durationMs}))}));
 await page.screenshot({path:`${root}/emulator-browser-smoke.png`});
 // Preflight actual navigation labels before the queued Android cohort.
 // Desktop samples are not substitutes for Android acceptance or A/B timings.
 for(const label of ['Khách hàng','Kho sản phẩm','Đơn hàng','Thu chi','Sổ nợ','Quản lý tài sản','Bảng lương','Xuất kho','Nhập Xuất Tồn','Trang chủ']){
  let button=page.getByRole('button',{name:label,exact:true}).filter({visible:true});
  if(!await button.count()){
   const more=page.getByRole('button',{name:'Thêm',exact:true}).filter({visible:true});
   if(await more.count()){await more.first().click();await page.waitForTimeout(200)}
   button=page.getByRole('button',{name:label,exact:true}).filter({visible:true});
  }
  const clicked=Boolean(await button.count());if(clicked)await button.first().click();
  await page.waitForTimeout(500);
  steps.push({kind:'actual-ui-route-preflight',label,clicked,module:await page.locator('main[data-hd-module]').getAttribute('data-hd-module')});
 }
 await fs.writeFile(`${root}/browser-emulator-smoke.json`,JSON.stringify({at:new Date().toISOString(),kind:'SYNTHETIC_AUTH_FIXTURE_REAL_FIREBASE_SDK_LOCAL_EMULATORS',steps,state,errors,blockedOrigins:blocked,productionRequests:0},null,2));
 console.log(JSON.stringify({steps,module:state.module,errors,workerHandles:state.probe?.workersCreated,mainSdkCounters:state.mainSdkCounters}));
}catch(error){await page.screenshot({path:`${root}/emulator-browser-smoke-failed.png`});await fs.writeFile(`${root}/browser-emulator-smoke-failure.json`,JSON.stringify({at:new Date().toISOString(),error:error.message,errors,blockedOrigins:blocked,body:(await page.locator('body').innerText()).slice(0,1200)},null,2));throw error}
finally{await context.close();await browser.close();await new Promise(r=>server.close(r))}
