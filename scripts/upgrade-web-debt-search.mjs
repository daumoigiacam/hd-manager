import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import {chromium} from 'playwright-core';
import {chromiumLaunchOptions} from '../tests/helpers/chromium-launch-options.mjs';
import {assertVerificationFixtureReady} from './helpers/verification-fixture-preflight.mjs';
import {currentDebtAnswer,armDebtSearch} from './helpers/debt-search-observation.mjs';
import {searchCustomers} from '../src/services/searchEngine.js';
const candidate=process.argv[2];if(!/^after-[a-z0-9-]+$/.test(candidate||''))throw Error('Explicit fixture cohort required');
const fixtureAvailability=await assertVerificationFixtureReady(),root='test-results/performance-upgrade-20261103';
const dir=path.resolve(root,candidate,'capacitor-project/app/src/main/assets/public');
const result={at:new Date().toISOString(),candidate,fixtureAvailability,status:'RUNNING',runs:[],errors:[],blocked:[],writeRequests:[],realAccounts:false,productionRequests:0,
 conditions:'Actual emitted App with genuine local-demo SDK login, full committed result IDs and known80M debt oracle. Host browser functional/timing diagnostic only; shared host during Android soak, not Android or isolated performance acceptance.'};
const server=http.createServer(async(req,res)=>{try{const u=new URL(req.url,'http://127.0.0.1'),f=path.resolve(dir,'.'+(u.pathname==='/'?'/index.html':decodeURIComponent(u.pathname)));if(!f.startsWith(dir+path.sep))throw Error('Outside fixture');res.setHeader('Content-Type',f.endsWith('.js')?'text/javascript':f.endsWith('.css')?'text/css':f.endsWith('.png')?'image/png':'text/html');res.end(await fs.readFile(f))}catch{res.writeHead(404);res.end()}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port,browser=await chromium.launch(chromiumLaunchOptions());
try{
 const context=await browser.newContext({viewport:{width:393,height:830}}),page=await context.newPage();page.setDefaultTimeout(60000);page.on('pageerror',e=>result.errors.push(e.message));
 await context.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin!==origin&&!(u.hostname==='127.0.0.1'&&['8185','9199','5002'].includes(u.port))){result.blocked.push(u.origin);return route.abort()}if(u.port==='8185'&&u.pathname.includes('/Write/')){result.writeRequests.push(u.pathname);return route.abort()}return route.continue()});
 await page.goto(origin);await page.locator('input[type=tel]').fill('0900000001');await page.locator('input[type=password]').fill('Local-fixture-only-2026!');await page.getByRole('button',{name:'Vào Ứng Dụng',exact:true}).click();
 await page.locator('button[aria-label="Thêm"]').click();await page.locator('button[data-hd-more-module=debt]').click();
 await page.waitForFunction(()=>{const m=document.querySelector('main[data-hd-module=debt]');return m&&!window.__hdModulePending(m)&&window.__hdSourceContract(m,'debt',window.__hdPlans).sourcesReady});
 await page.evaluate('window.__upgradeDebtAnswer='+currentDebtAnswer.toString());
 await page.locator('button[aria-label="Tìm kiếm"]').click();const selector='input[data-hd-search-input]';
 const baseline=await page.evaluate(()=>window.__upgradeDebtAnswer());if(!baseline||baseline.base.length!==1000)throw Error('Expected complete fake manager scope');
 const base=baseline.base.filter(row=>row.ledger.currentDebt>0||row.ledger.creditBalance>0);result.sourceCount=base.length;result.totalDebt=base.reduce((n,row)=>n+row.ledger.currentDebt,0);if(result.totalDebt!==80000000)throw Error('Rich fake debt oracle mismatch');
 await page.evaluate(()=>{
  window.__debtPendingChecks=[];
  const observer=new MutationObserver(()=>{const e=document.querySelector('main[data-hd-module=debt] fieldset[data-hd-search-retained="true"]');if(!e||e.getAttribute('aria-busy')!=='true'||window.__debtPendingChecks.length)return;
   const row={hasCurrentQuery:e.hasAttribute('data-hd-debt-search-query'),disabled:e.disabled,retainedRows:e.querySelectorAll('.hd-render-contained').length};window.__debtPendingChecks.push(row);
   const card=e.querySelector('.hd-render-contained');if(card)card.click();requestAnimationFrame(()=>requestAnimationFrame(()=>{row.retainedClickBlocked=Boolean(document.querySelector('main[data-hd-module=debt] fieldset[data-hd-search-retained]'))}));
  });observer.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['aria-busy','data-hd-search-retained']});window.__debtPendingObserver=observer;
 });
 for(const query of ['Synthetic Customer 999','Synthetic','no-match-fictional','Synthetic Customer 99','Synthetic Customer 999']){
  const oracle=searchCustomers(base,query);await page.evaluate(`(${armDebtSearch.toString()})(${JSON.stringify({query,expectedIds:oracle.map(r=>r.id)})})`);
  await page.locator(selector).focus();await page.keyboard.press('Control+A');await page.keyboard.insertText(query);const timing=await page.evaluate(()=>window.__upgradeDebtPromise);
  const answer=await page.evaluate(()=>window.__upgradeDebtAnswer()),money=new Map(base.map(row=>[row.id,row.ledger.currentDebt]));if(answer.rows.some(row=>money.get(row.id)!==row.debt))throw Error('Filtering changed debt money');
  result.runs.push({query,rows:oracle.length,...timing});
 }
 result.pendingChecks=await page.evaluate(()=>{window.__debtPendingObserver.disconnect();return window.__debtPendingChecks});
 if(candidate==='after-debt-prepared'&&(!result.pendingChecks.length||result.pendingChecks.some(c=>c.hasCurrentQuery||!c.disabled||!c.retainedClickBlocked)))throw Error('Pending retained-query guard was not verified');
 if(result.errors.length||result.blocked.length||result.writeRequests.length)throw Error('Runtime/network/write guard failed');result.status='FULL_APP_DEBT_SEARCH_FUNCTIONAL_VERIFIED_NOT_ANDROID_ACCEPTANCE';
 await page.screenshot({path:root+'/web-debt-search-'+candidate+'.png'});await context.close();
}catch(error){result.status='FAILED';result.error=error.message;process.exitCode=1}finally{await browser.close();await new Promise(r=>server.close(r));result.endedAt=new Date().toISOString();await fs.writeFile(root+'/web-debt-search-'+candidate+'.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result))}
