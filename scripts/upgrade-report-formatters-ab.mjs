import fs from'node:fs/promises';import{build}from'esbuild';import{chromium}from'playwright-core';import{chromiumLaunchOptions}from'../tests/helpers/chromium-launch-options.mjs';
const output='test-results/performance-upgrade-20261103/report-formatters-ab.json';
const cohorts={before:'./tests/fixtures/report-formatters-before-upgrade.mjs',after:'./src/features/business-report/reportViewModel.js'},bundles={};
for(const[k,file]of Object.entries(cohorts)){const b=await build({stdin:{resolveDir:process.cwd(),contents:`import{formatVnd,formatCompactVnd,formatPercent}from${JSON.stringify(file)};window.fmt={formatVnd,formatCompactVnd,formatPercent};`},bundle:true,write:false,minify:true,format:'iife',target:'chrome74'});bundles[k]=b.outputFiles[0].text}
const result={at:new Date().toISOString(),conditions:'Desktop Chromium CPU throttle 6; 12 interleaved fresh-page pairs; exact old/new helpers, 1000 calls per helper. Shared Windows host; not whole-screen or Android latency acceptance. No financial calculation changed, network or GC.',jsBytes:Object.fromEntries(Object.entries(bundles).map(([k,b])=>[k,Buffer.byteLength(b)])),rows:{before:[],after:[]}};
const browser=await chromium.launch(chromiumLaunchOptions());
try{for(let i=0;i<12;i++)for(const k of i%2?['after','before']:['before','after']){
 const page=await browser.newPage();await page.route('**/*',r=>r.abort());await page.setContent('<div></div>');const c=await page.context().newCDPSession(page);await c.send('Performance.enable');await c.send('Emulation.setCPUThrottlingRate',{rate:6});
 await page.addScriptTag({content:bundles[k]});const before=await c.send('Performance.getMetrics');
 const measured=await page.evaluate(()=>{const values=Array.from({length:1000},(_,i)=>(i%2?-1:1)*(i*1234567.89+i/10)),times={},digest=[];for(const[name,fn]of Object.entries(window.fmt)){const start=performance.now();let characters=0;for(const value of values)characters+=fn(value).length;times[name]=performance.now()-start;digest.push(characters)}return{times,digest}});
 measured.beforeCpu=before;measured.afterCpu=await c.send('Performance.getMetrics');measured.heap=await c.send('Runtime.getHeapUsage');result.rows[k].push(measured);await page.close();
}}finally{await browser.close();const summarize=a=>{a=a.slice().sort((a,b)=>a-b);return{median:a[Math.ceil(a.length*.5)-1],p95:a[Math.ceil(a.length*.95)-1]}};
 result.summary=Object.fromEntries(Object.entries(result.rows).map(([k,rows])=>[k,{per1000CallsMs:Object.fromEntries(['formatVnd','formatCompactVnd','formatPercent'].map(name=>[name,summarize(rows.map(r=>r.times[name]))])),jsHeapBytes:summarize(rows.map(r=>r.heap.usedSize)),parityDigests:rows.map(r=>r.digest)}]));
 await fs.writeFile(output,JSON.stringify(result,null,2));console.log(JSON.stringify(result.summary));}
