import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {chromiumLaunchOptions} from '../tests/helpers/chromium-launch-options.mjs';

const output='test-results/full-system-transformation-20261101';
const report=JSON.parse(await fs.readFile(output+'/engineering-status.json','utf8'));
assert.equal(report.status,'IN_PROGRESS_NOT_FULLY_ACCEPTED');
assert.equal(report.android.allRecognizedCurrentSourcesMatchCandidate,true);
assert.equal(report.acceptanceObservations.fullSystem,'NOT_ACCEPTED');
assert.equal(report.startupRecovery.cohorts.length,6);
assert.equal(report.startupRecovery.persistentCacheSdk.checks.length,18);
assert.equal(report.startupRecovery.invalidFirstColdProbe.observation,null);
assert(report.startupRecovery.persistentCacheColdProcess.observation.homeReportObservedAt>100);
assert(report.android.startup.probe.homeServerConfirmedAt>100);
const browser=await chromium.launch(chromiumLaunchOptions());
const views=[],errors=[];
try{
 for(const width of [1365,390]){
  const page=await browser.newPage({viewport:{width,height:1000}});
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(pathToFileURL(path.resolve(output+'/report.html')).href);
  assert.match(await page.locator('h1').innerText(),/HD Manager/);
  const noPageOverflow=await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth);
  assert.equal(noPageOverflow,true);
  const links=await page.locator('a[href]').evaluateAll(nodes=>nodes.map(node=>node.href));
  for(const link of links)if(link.startsWith('file:'))await fs.access(fileURLToPath(link));
  assert.equal(await page.getByRole('heading',{name:'Kiểm chứng mốc 29,6 giây — chưa nghiệm thu'}).count(),1);
  await page.screenshot({path:output+`/startup-report-${width}.png`});
  views.push({width,noPageOverflow,localLinks:links.length});await page.close();
 }
 assert.deepEqual(errors,[]);
 const result={at:new Date().toISOString(),views,errors,apkSha256:report.android.candidate.apkSha256,
  sourceMatch:true,scope:'Generated report presentation, local evidence links and explicitly failed acceptance classification. This does not change Android measurements or assert speed acceptance.'};
 await fs.writeFile(output+'/startup-report-validation.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await browser.close()}
