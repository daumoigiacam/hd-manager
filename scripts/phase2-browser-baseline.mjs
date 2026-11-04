import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import {chromium} from 'playwright-core';
import {chromiumLaunchOptions} from '../tests/helpers/chromium-launch-options.mjs';
import {makeFixture,installFixture} from '../performance/phase2/synthetic-fixture.mjs';
import {readModuleSourceReadiness as getModuleSourceReadiness,hasActiveModulePending,isExplicitlyVisible} from './helpers/module-source-readiness.mjs';

const out='test-results/phase2-performance-20261102';
const root=path.resolve(out,'preview');
const server=http.createServer(async(req,res)=>{
 try{const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname));
  if(file!==root&&!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return}
  const target=file===root+path.sep||file===root?path.join(root,'index.html'):file;
  res.setHeader('Content-Type',target.endsWith('.js')?'text/javascript':target.endsWith('.css')?'text/css':target.endsWith('.svg')?'image/svg+xml':target.endsWith('.png')?'image/png':target.endsWith('.json')?'application/json':'text/html');
  res.end(await fs.readFile(target));
 }catch{res.writeHead(404);res.end('Missing local asset')}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch(chromiumLaunchOptions());
const result={at:new Date().toISOString(),kind:'FULL_APP_SYNTHETIC_PREVIEW_DESKTOP_BASELINE',loginMeasured:false,
 qualification:'Mock claims restoration; no password verification, network Firebase, native Capacitor or production latency. No A/B adoption. Numbers are not Android acceptance.',runs:[],blockedRequests:[],source:'current workspace; see preview-build.json'};
const modes=process.argv.includes('--soak')?['manager']:['manager','employee','customer'];
const plans=JSON.parse(await fs.readFile('docs/reports/phase2-performance-20261102/data-engine-integration.json','utf8')).descriptors.FOREGROUND_REALTIME_COLLECTIONS_BY_TAB;
const minutes=Number(process.env.HD_PHASE2_SOAK_MINUTES||120);
if(!Number.isFinite(minutes)||minutes<1||minutes>125)throw Error('Invalid local soak duration');
try{
 for(const role of modes){
  const fixture=makeFixture(role,1000);
  const context=await browser.newContext({viewport:{width:390,height:844}});
  await context.route('**/*',route=>{
   const url=route.request().url();
   if(url.startsWith(origin+'/'))return route.continue();
   if(url.includes('customerPortalBootstrap'))return route.fulfill({status:200,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify({success:true,
    company:fixture.data.companies[fixture.claims.companyId],customer:fixture.data.customers['fixture-customer'],
    customerAccount:{id:'fiction-account',customerId:'fixture-customer'},products:Object.values(fixture.data.products),rewardCatalog:[],promotions:[]})});
   result.blockedRequests.push({scheme:new URL(url).protocol,reason:'external-network-denied'});return route.abort();
  });
  await context.addInitScript(installFixture,fixture);
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const cdp=await context.newCDPSession(page);await cdp.send('Performance.enable');
  const start=Date.now();await page.goto(origin,{waitUntil:'domcontentloaded'});
  let shellMs=null,interactiveMs=null,sourceReadyMs=null,failure=null;
  let homeDataReadyMs=null,homeContract=null;
  try{
   await page.waitForSelector('main[data-hd-module],.customer-portal-nav',{timeout:30000});
   shellMs=await page.evaluate(()=>performance.now());
   await page.addScriptTag({content:`window.__phase2Sources=${getModuleSourceReadiness.toString()};const isExplicitlyVisible=${isExplicitlyVisible.toString()};window.__phase2Pending=${hasActiveModulePending.toString()};`});
   if(role!=='customer'){
    try{
     await page.waitForFunction(plans=>{const main=document.querySelector('main[data-hd-module="home"]');return main&&window.__phase2Sources(main,'home',plans).sourcesReady&&!window.__phase2Pending(main)},plans,{timeout:5000});
     homeDataReadyMs=await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(performance.now())))));
    }catch{/* Keep missing contract/source evidence, never replace it with core readiness. */}
    homeContract=await page.evaluate(plans=>window.__phase2Sources(document.querySelector('main[data-hd-module="home"]'),'home',plans),plans);
   }
   // Real trusted input to a visible bottom navigation button. Ack is the
   // document click event; it proves event handling, not data/form completion.
   const button=page.getByRole('button',{name:'Thêm',exact:true});
   if(await button.count()){
    await page.evaluate(()=>{document.addEventListener('pointerdown',()=>{window.__phase2ClickStart=performance.now()},{capture:true,once:true});document.addEventListener('click',()=>{window.__phase2ClickAck=performance.now()},{capture:true,once:true})});
    await button.click();interactiveMs=await page.evaluate(()=>window.__phase2ClickStart===undefined?null:window.__phase2ClickAck-window.__phase2ClickStart);
   }
   sourceReadyMs=await page.evaluate(()=>{
    // State-only mock core witness is explicitly NOT the Home data-ready gate.
    const events=window.__HD_STARTUP_TIMING__||[];return events.find(e=>e.name==='data.core.available')?.durationMs??null;
   });
  }catch(error){failure=error.name+':'+error.message.split('\n')[0]}
  await page.screenshot({path:`${out}/preview-${role}.png`});
  const samples=[],started=Date.now();
  const total=process.argv.includes('--soak')?minutes*60000:15000;
  // Scope metrics to this renderer session. No GC is forced in natural samples.
  for(let iteration=0;Date.now()-started<total;iteration++){
   try{
    const metrics=await cdp.send('Performance.getMetrics');
    const selected=Object.fromEntries(metrics.metrics.filter(m=>['JSHeapUsedSize','JSHeapTotalSize','TaskDuration','ScriptDuration','LayoutDuration','RecalcStyleDuration','Nodes','Documents','JSEventListeners'].includes(m.name)).map(m=>[m.name,m.value]));
    samples.push({elapsedMs:Date.now()-started,metrics:selected,module:await page.locator('main[data-hd-module]').getAttribute('data-hd-module').catch(()=>null)});
    if(process.argv.includes('--soak')){
     // Programmatic route churn in synthetic App only, not a UI latency sample.
     await page.evaluate(index=>{
      const main=document.querySelector('main[data-hd-module]');
      const k=main&&Object.keys(main).find(k=>k.startsWith('__reactFiber$'));
      let fiber=k&&main[k];for(let d=0;fiber&&d<100;d++,fiber=fiber.return){
       const p=fiber.memoizedProps;if(typeof p?.setActiveTab==='function'){
        p.setActiveTab(['home','customers','products','orders','finance','debt','asset_management','payroll'][index%8]);return true;
       }
      }return false;
     },iteration);
    }
   }catch(error){samples.push({elapsedMs:Date.now()-started,error:error.message});break}
   await fs.writeFile(`${out}/${process.argv.includes('--soak')?'soak-progress':'browser-progress'}.json`,JSON.stringify({role,samples,elapsedMs:Date.now()-started,requestedDurationMs:total},null,2));
   await new Promise(r=>setTimeout(r,process.argv.includes('--soak')?15000:1000));
  }
  const actualElapsedMs=Date.now()-started;
  const run={role,shellMs,clickAcknowledgementMs:interactiveMs,mockCoreWitnessMs:sourceReadyMs,homeDataReadyMs,homeContract,
   homeDataReadyReason:homeDataReadyMs!==null?'Mock source-confirmed contract + no visible pending projection + two RAF; not fresh Firestore/revision or password-login latency.':role==='customer'?'Customer portal needs a separate financial-source observer; bootstrap success is not substituted.':'Source/commit/projection contract not satisfied within bounded wait; missing flags retained.',
   failure,errors,samples,actualElapsedMs,requestedDurationMs:total,complete:actualElapsedMs>=total,
   longTasks:await page.evaluate(()=>window.__phase2Observed?.longTasks||[]),wallMs:Date.now()-start};
  result.runs.push(run);await context.close();
 }
}finally{
 await fs.writeFile(`${out}/${process.argv.includes('--soak')?'soak-result':'browser-baseline'}.json`,JSON.stringify(result,null,2));
 await browser.close();await new Promise(r=>server.close(r));
}
console.log(JSON.stringify(result.runs.map(r=>({role:r.role,shellMs:r.shellMs,clickAcknowledgementMs:r.clickAcknowledgementMs,errors:r.errors.length,complete:r.complete}))));
