import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {chromiumLaunchOptions} from '../tests/helpers/chromium-launch-options.mjs';
const root='docs/reports/phase2-performance-20261102',raw='test-results/phase2-performance-20261102';
const previous=JSON.parse(await fs.readFile('docs/reports/technology-adoption-20261102/repository-inventory.json','utf8'));
const protectedFiles={};
for(const [file,expected] of Object.entries(previous.protectedFiles)){
 const actual=crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex');
 protectedFiles[file]=actual===expected;assert.equal(actual,expected,`${file}: unexpected architecture/backend/config change`);
}
const nativeManifest=await fs.readFile('performance/phase2/android-lab/app/build/intermediates/merged_manifests/release/processReleaseManifest/AndroidManifest.xml','utf8');
assert.ok(!nativeManifest.includes('android.permission.INTERNET'));
assert.ok(nativeManifest.includes('com.hdmanager.perflab'));assert.ok(!nativeManifest.includes('android:debuggable="true"'));
const status=JSON.parse(await fs.readFile(`${root}/status.json`,'utf8'));
assert.equal(status.reports.length,7);assert.equal(status.overall,'NOT_PASS');
const browser=await chromium.launch(chromiumLaunchOptions());const checks=[];
try{
 for(const viewport of [{width:390,height:844},{width:1440,height:1000}]){
  const page=await browser.newPage({viewport}),errors=[],external=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>{if(r.request().url().startsWith('file:'))return r.continue();external.push(r.request().url());return r.abort()});
  for(const file of ['index',...status.reports.map(r=>r.name)]){
   await page.goto(pathToFileURL(path.resolve(root,file+'.html')).href);
   assert.equal(await page.locator('h1').count(),1);
   const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);assert.equal(overflow,false,`${file}: body overflow`);
   checks.push({viewport:viewport.width,file,bodyOverflow:false});
  }
  await page.goto(pathToFileURL(path.resolve(root,'index.html')).href);
  await page.screenshot({path:`${raw}/report-${viewport.width}.png`,fullPage:true});
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);await page.close();
 }
}finally{await browser.close()}
const result={at:new Date().toISOString(),scope:'Report integrity and protected-file checks, not app performance acceptance',protectedFiles,
 nativeFixtureHasNoInternetPermission:true,releaseFixtureNonDebuggable:true,reportCount:7,checks,overall:'NOT_PASS'};
await fs.writeFile(`${root}/validation.json`,JSON.stringify(result,null,2));console.log(JSON.stringify({protectedFilesUnchanged:Object.keys(protectedFiles).length,reports:7,renderChecks:checks.length}));
