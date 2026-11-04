import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {build,preview} from 'vite';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright-core';
// Compile the actual App with a test-only catalogue transport. The normal
// preview transport deliberately blocks every Identity API. Never use this
// presentation fixture as proof of Firebase authentication or network speed.
const output=process.env.HD_CUSTOMER_BOOTSTRAP_UI_OUTPUT||'test-results/perf-target-20261102/customer-bootstrap-ui';
const buildOutput=output+'/app';
await mkdir(output,{recursive:true});
Object.assign(process.env,{VITE_DATA_MODE:'preview',VITE_ALLOW_PREVIEW_BUILD:'true'});
await build({build:{outDir:buildOutput},logLevel:'warn',resolve:{alias:{'@hd/identity-center':fileURLToPath(new URL('../helpers/customer-bootstrap-ui-transport.mjs',import.meta.url))}}});
const server=await preview({build:{outDir:buildOutput},preview:{host:'127.0.0.1',port:0}});
const origin=`http://127.0.0.1:${server.httpServer.address().port}`;
const browser=await chromium.launch({executablePath:process.env.CHROME_EXECUTABLE||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const checks=[],errors=[];let requests=0,blocked=0,release,activePage;
try{
 const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage();
 activePage=page;
 page.on('pageerror',error=>errors.push(error.message));
 await context.route('**/*',async route=>{
  if(route.request().url()===origin+'/fixture/customer-bootstrap'){
   if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'content-type,authorization'}});
   requests++;
   if(requests===1)return route.fulfill({status:503,headers:{'Access-Control-Allow-Origin':'*'},contentType:'application/json',body:JSON.stringify({success:false,message:'Fixture temporary outage'})});
   await new Promise(resolve=>{release=resolve});
   return route.fulfill({status:200,headers:{'Access-Control-Allow-Origin':'*'},contentType:'application/json',body:JSON.stringify({success:true,
    company:{id:'comp_preview',name:'Public fixture company'},customer:{id:'c_preview_01',companyId:'comp_preview',name:'Fixture customer'},
    customerAccount:{id:'account-fixture',customerId:'c_preview_01'},products:[],rewardCatalog:[],promotions:[]})});
  }
  if(route.request().url().startsWith(origin+'/'))return route.continue();
  blocked++;return route.abort();
 });
 const claims={uid:'customer-fixture',identityId:'customer-fixture',appUserId:'account-fixture',customerId:'c_preview_01',companyId:'comp_preview',accountType:'customer',role:'customer'};
 await page.addInitScript(token=>{window.__initial_auth_token=token},`hd-preview-auth-v1:${encodeURIComponent(JSON.stringify(claims))}`);
 await page.goto(origin);await page.locator('[data-hd-customer-bootstrap-status="error"]').waitFor({timeout:20000});
 assert.equal(await page.locator('.customer-portal-main .customer-product-card').count(),0);
 checks.push('Unsuccessful bootstrap shows retry instead of complete Home or an old catalogue');
 await page.getByRole('button',{name:'Thử lại',exact:true}).evaluate(button=>{button.click();button.click()});
 await page.locator('[data-hd-customer-bootstrap-status="loading"]').waitFor();
 await page.waitForFunction(()=>document.querySelector('.customer-portal-nav button:not([disabled])'));
 await page.waitForTimeout(150);assert.equal(requests,2,'two retry callbacks share one in-flight request');
 assert.equal(await page.locator('[data-hd-customer-bootstrap-status]').getAttribute('aria-busy'),'true');
 checks.push('Retry is single-flight; navigation remains mounted while catalogue content is pending');
 assert.equal(typeof release,'function');release();
 await page.locator('[data-hd-customer-bootstrap-status]').waitFor({state:'hidden',timeout:20000});
 await page.waitForFunction(()=>/fixture customer/i.test(document.body.innerText));
 checks.push('Complete scoped bootstrap commits and renders the customer Home');
 await page.screenshot({path:output+'/customer-home.png',fullPage:true});
 assert.deepEqual(errors,[]);
 await writeFile(output+'/result.json',JSON.stringify({status:'PASS_SYNTHETIC_UI_RECOVERY_ONLY',checks,requests,blockedExternalRequests:blocked,errors,
  scope:'Actual built App with preview Firebase and synthetic customer; every external request intercepted or blocked. No real login, network-latency acceptance, production writes or business payloads.'},null,2));
 console.log(JSON.stringify({checks,requests,blocked,errors}));await context.close();
}catch(error){await writeFile(output+'/failure.json',JSON.stringify({requests,blocked,errors,error:String(error),fixtureOnlyBody:await activePage?.locator('body').innerText().catch(()=>null)},null,2));throw error;}
finally{await browser.close();await new Promise(resolve=>server.httpServer.close(resolve));}
