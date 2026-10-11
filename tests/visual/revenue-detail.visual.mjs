import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
const deadline=setTimeout(()=>{console.error('TIMEOUT 120s');process.exit(1);},120000);
const server=await createServer({configFile:false,cacheDir:'test-results/revenue-detail-cache',optimizeDeps:{entries:['tests/visual/fixtures/revenue-detail.html']},esbuild:{jsx:'automatic'},server:{host:'127.0.0.1',port:0}});
await server.listen();
const origin='http://127.0.0.1:'+server.httpServer.address().port;
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try {
  await mkdir('test-results',{recursive:true});
  for(const width of [390,1440]){
    const page=await browser.newPage({viewport:{width,height:900}});
    page.setDefaultTimeout(15000);
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/*',r=>r.request().url().startsWith(origin)?r.continue():r.abort());
    await page.goto(origin+'/tests/visual/fixtures/revenue-detail.html',{waitUntil:'domcontentloaded',timeout:45000});
    for(const name of ['Nhân viên A','Khách hàng A']){
      await page.locator('button.business-report-sales-row, button.business-report-customer-row').filter({hasText:name}).click();
      await page.getByRole('region',{name:'Chi tiết doanh thu'}).waitFor();
      assert.equal(await page.locator('.business-report-revenue-orders li').count(),20);
      await page.getByRole('button',{name:'Trang sau',exact:true}).click();
      assert.equal(await page.locator('.business-report-revenue-orders li').count(),5);
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      await page.screenshot({path:'test-results/revenue-detail-'+width+'-'+(name.startsWith('Nhân')?'employee':'customer')+'.png'});
      await page.getByRole('button',{name:'Quay lại',exact:true}).click();
    }
    assert.deepEqual(errors,[]);
    await page.close();
  }
  console.log('PASS employee/customer drilldown, pagination, back, 390/1440px, no external requests');
} finally { await browser.close();await server.close();clearTimeout(deadline); }
