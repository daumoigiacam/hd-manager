import {readFile,writeFile,mkdir} from 'node:fs/promises';import {createHash} from 'node:crypto';import {pathToFileURL} from 'node:url';import path from 'node:path';import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
const root='docs/reports/technology-adoption-20261102',output='test-results/technology-adoption-20261102';
const report=JSON.parse(await readFile(root+'/technology-adoption-matrix.json','utf8'));
assert.equal(report.technologies.length,20);assert.equal(report.performanceAcceptance,'NOT_PASS');
for(const t of report.technologies){for(const key of ['problem','fit','android','overlap','dataRisk','operatingCost','benchmark','rollback'])assert.equal(typeof t[key],'string');assert.equal(t.metrics.ram.deltaMiB,null);assert.equal(t.metrics.cpu.deltaMs,null);assert.equal(t.metrics.bundle.deltaGzipBytes,null);assert.equal(t.metrics.bundle.deltaApkBytes,null);for(const evidence of t.evidence){const text=await readFile(evidence.file,'utf8');assert.equal(createHash('sha256').update(text).digest('hex'),evidence.sha256);assert(text.split(/\r?\n/)[evidence.line-1].includes(evidence.pattern))}}
for(const [file,expected]of Object.entries(report.inventory.protectedFiles))assert.equal(createHash('sha256').update(await readFile(file)).digest('hex'),expected);
await mkdir(output,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const errors=[],blocked=[];
try{
 const context=await browser.newContext({viewport:{width:1280,height:900}});await context.route('**/*',route=>{if(route.request().url().startsWith('file:'))return route.continue();blocked.push(new URL(route.request().url()).origin);return route.abort()});
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.name));
 await page.goto(pathToFileURL(path.resolve(root,'audit.html')).href);assert.equal(await page.locator('.tech').count(),20);
 await page.selectOption('#priority','P0');const p0=report.technologies.filter(t=>t.priority==='P0').length;assert.equal(await page.locator('.tech:not(.hidden)').count(),p0);
 await page.fill('#search','TanStack');assert.equal(await page.locator('.tech:not(.hidden)').count(),1);
 await page.selectOption('#priority','');assert.equal(await page.locator('.tech:not(.hidden)').count(),2);
 await page.fill('#search','');await page.click('#expand');assert.equal(await page.locator('details[open]').count(),20);
 await page.click('#collapse');assert.equal(await page.locator('details[open]').count(),0);
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:output+'/audit-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});await page.locator('#tech-3 summary').click();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:output+'/audit-mobile.png',fullPage:true});
 for(const file of ['technology-adoption-matrix.csv','technology-adoption-matrix.json','repository-inventory.json','primary-sources.json'])await readFile(root+'/'+file);
 assert.equal(errors.length,0);assert.equal(blocked.length,0);
 const result={at:new Date(),rows:20,priorityFilter:true,textFilter:true,expandCollapse:true,desktopAndMobileNoHorizontalOverflow:true,pageErrors:errors.length,externalRequests:blocked.length,productSourceHashesUnchanged:true,unknownMetricsNull:true,scope:'Report artifact/links/filters/privacy/completeness verification only. Headless desktop Chrome is NOT an Android app benchmark or technology acceptance.'};
 await writeFile(output+'/report-validation.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await browser.close()}
