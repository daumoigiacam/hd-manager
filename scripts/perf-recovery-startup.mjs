import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { preview } from 'vite';
import { chromium } from 'playwright-core';
import { seedData } from '../src/mocks/seed-data.js';

const phase = process.argv[2];
assert.match(phase || '', /^recovery-001-[a-z0-9-]+$/);
const outDir = path.resolve('test-results/full-interaction', phase, 'app');
const output = path.resolve('test-results/perf-recovery-001', phase);
const files = await fs.readdir(path.join(outDir, 'assets'));
const entry = files.find(file => /^index-.*\.js$/.test(file));
assert.ok(entry);
const code = await fs.readFile(path.join(outDir, 'assets', entry), 'utf8');
assert.ok(code.includes('hd-preview-auth-v1:') || code.includes('preview-project'), 'Only an isolated preview build is permitted');
await fs.mkdir(output, {recursive:true});
const server = await preview({build:{outDir},preview:{host:'127.0.0.1',port:0}});
const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
let browser;
const results = [];
const claims = {uid:'emp_admin',identityId:'emp_admin',appUserId:'emp_admin',companyId:'comp_preview',accountType:'employee',role:'super_admin',name:'QA',phone:'0909000001'};
try {
  browser = await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  for (let round=0;round<5;round++) {
    const context = await browser.newContext({viewport:{width:390,height:844}});
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate',{rate:3});
    const errors = [];
    const blockedOrigins = new Set();
    page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/*',route=>{
      const url = new URL(route.request().url());
      if(url.origin===origin) return route.continue();
      blockedOrigins.add(url.origin);
      return route.abort();
    });
    await page.addInitScript(({claims,seed})=>{
      if(!sessionStorage.getItem('recovery-seeded')) {
        localStorage.setItem('hd-manager-local-db-v2-clean-preview',JSON.stringify(seed));
        sessionStorage.setItem('recovery-seeded','true');
      }
      window.__initial_auth_token=`hd-preview-auth-v1:${encodeURIComponent(JSON.stringify(claims))}`;
      window.__recoveryBoot={longTasks:[], milestones:{}, inputResponseMs:null};
      new PerformanceObserver(list=>window.__recoveryBoot.longTasks.push(...list.getEntries().map(x=>({start:x.startTime,duration:x.duration})))).observe({type:'longtask',buffered:true});
      const inspect=()=>{
        const m=window.__recoveryBoot.milestones;
        if(!m.shell && document.querySelector('[data-hd-shell="enterprise"]')) m.shell=performance.now();
        if(!m.dashboard && document.querySelector('.business-report-workspace')) m.dashboard=performance.now();
        if(m.shell && m.dashboard) observer.disconnect();
      };
      const observer=new MutationObserver(inspect);
      observer.observe(document,{childList:true,subtree:true});
    },{claims,seed:seedData});
    for(const state of ['fresh-context','reload-existing-context']) {
      if(state==='fresh-context') await page.goto(`${origin}/`,{waitUntil:'commit'});
      else await page.reload({waitUntil:'commit'});
      await page.locator('.business-report-workspace').waitFor({timeout:30000});
      await page.locator('[data-hd-navigation="bottom"]').getByRole('button',{name:'Thêm',exact:true}).click();
      await page.locator('main[data-hd-module="more"]').waitFor();
      const record=await page.evaluate(()=>({
        ...window.__recoveryBoot,
        paints:performance.getEntriesByType('paint').map(x=>({name:x.name,ms:x.startTime})),
        navigation:performance.getEntriesByType('navigation').map(x=>({ttfb:x.responseStart,domContentLoaded:x.domContentLoadedEventEnd,load:x.loadEventEnd})),
        resources:performance.getEntriesByType('resource').map(x=>({path:new URL(x.name).pathname,durationMs:x.duration,transferBytes:x.transferSize,decodedBytes:x.decodedBodySize})),
      }));
      results.push({round,state,...record,errors:[...errors],blockedOrigins:[...blockedOrigins]});
    }
    await context.close();
  }
} finally {
  await browser?.close();
  await new Promise(resolve=>server.httpServer.close(resolve));
  await fs.writeFile(path.join(output,'startup.json'),JSON.stringify({
    phase,at:new Date().toISOString(),browser:browser?.version(),cpuThrottle:3,fixture:'src/mocks/seed-data.js',
    contract:'Fresh browser context vs reload of same context; local preview with injected mock identity. First paint and DOM milestones, NOT native cold/warm start, real authentication, permission API latency, or complete business-data readiness. HTTP interception disables normal browser cache; reload retains local storage, not a warm HTTP-cache benchmark.',
    authenticationMs:'NOT MEASURED',profileLoadMs:'NOT MEASURED',permissionLoadMs:'NOT MEASURED',fullDataReadyMs:'NOT MEASURED',results,
  },null,2));
}
console.log(JSON.stringify(results.map(({round,state,milestones,paints,longTasks,errors})=>({round,state,milestones,paints,longTaskCount:longTasks.length,maxLongTaskMs:Math.max(0,...longTasks.map(x=>x.duration)),errors}))));
