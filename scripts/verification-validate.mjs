import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {chromium} from 'playwright-core';
import {chromiumLaunchOptions} from '../tests/helpers/chromium-launch-options.mjs';
const out='docs/reports/phase2-verification-20261102',raw='test-results/phase2-verification-20261102';
const previous=JSON.parse(await fs.readFile('docs/reports/technology-adoption-20261102/repository-inventory.json','utf8'));
const protectedFiles={};
for(const [file,expected] of Object.entries(previous.protectedFiles)) {
 const actual=crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex');
 assert.equal(actual,expected,`Unexpected protected-file change: ${file}`);protectedFiles[file]=actual;
}
const identity=JSON.parse(await fs.readFile(`${raw}/capacitor-build-identity.json`,'utf8'));
assert.equal(identity.project,'demo-hdm-perf-verification');assert.equal(identity.package,'com.hdmanager.caplab');
assert.equal(identity.productionEndpointsAllowed,false);
const manifest=await fs.readFile(`${raw}/capacitor-project/app/build/intermediates/merged_manifests/release/processReleaseManifest/AndroidManifest.xml`,'utf8');
assert.ok(manifest.includes('com.hdmanager.caplab'));assert.ok(!manifest.includes('android:debuggable="true"'));
assert.ok(manifest.includes('profileable'));assert.ok(manifest.includes('VerificationActivity'));
const original=crypto.createHash('sha256').update(await fs.readFile('android/app/src/main/java/com/hdmanager/app/MainActivity.java')).digest('hex');
assert.equal(identity.sourceMainActivitySha256,original);
assert.ok(identity.files.every(file=>!file.file.endsWith('.map')),'Source maps must remain outside the APK');
const status=JSON.parse(await fs.readFile(`${out}/status.json`,'utf8'));
assert.equal(status.overall,'NOT_PASS');assert.equal(status.reports.length,7);
const browser=await chromium.launch(chromiumLaunchOptions()),checks=[];
try {
 for(const viewport of [{width:390,height:844},{width:1440,height:1000}]) {
  const page=await browser.newPage({viewport}),errors=[],external=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',route=>{if(route.request().url().startsWith('file:'))return route.continue();external.push(route.request().url());return route.abort()});
  for(const name of ['index',...status.reports.map(report=>report.name)]) {
   await page.goto(pathToFileURL(path.resolve(out,name+'.html')).href);
   assert.equal(await page.locator('h1').count(),1);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,`${name}: body overflow`);
   checks.push({viewport:viewport.width,name});
  }
  await page.goto(pathToFileURL(path.resolve(out,'index.html')).href);
  await page.screenshot({path:`${raw}/verification-report-${viewport.width}.png`,fullPage:true});
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);await page.close();
 }
}finally{await browser.close()}
await fs.writeFile(`${out}/validation.json`,JSON.stringify({at:new Date().toISOString(),scope:'Report rendering, test APK configuration and protected hashes only; NOT performance acceptance',protectedFiles,checks,originalMainActivityUnchanged:true,sourceMapsOutsideApk:true,overall:'NOT_PASS'},null,2));
console.log(JSON.stringify({protectedFilesUnchanged:Object.keys(protectedFiles).length,reportRenderChecks:checks.length,overall:'NOT_PASS'}));
