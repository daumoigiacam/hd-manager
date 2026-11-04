import fs from'node:fs/promises';import crypto from'node:crypto';import{parse}from'@babel/parser';import{build}from'esbuild';import{chromium}from'playwright-core';import{chromiumLaunchOptions}from'../tests/helpers/chromium-launch-options.mjs';
const root='test-results/performance-upgrade-20261103';
const testSource=await fs.readFile('tests/price-quote-render-work.test.mjs','utf8'),tree=parse(testSource,{sourceType:'module'});let template;
const visit=node=>{if(!node||typeof node!=='object')return;if(node.type==='ObjectProperty'&&node.key.name==='contents'&&node.value.type==='TemplateLiteral')template=node.value;for(const value of Object.values(node))if(Array.isArray(value))value.forEach(visit);else if(value?.type)visit(value)};visit(tree);
if(template?.expressions.length!==1)throw Error('Quote regression fixture template changed');
const identities=JSON.parse(await fs.readFile(`${root}/after-integrated/capacitor-build-identity.json`,'utf8'));
const css=await fs.readFile(`${root}/after-integrated/capacitor-project/app/src/main/assets/public/${identities.files.find(f=>/^assets\/index-.*\.css$/.test(f.file)).file}`,'utf8');
const sources={before:`${root}/checkpoints/quote-picker/App.jsx`,after:'src/App.jsx'},bundles={};
for(const[cohort,file]of Object.entries(sources)){
 const source=await fs.readFile(file,'utf8'),component=parse(source,{sourceType:'module',plugins:['jsx']}).program.body.find(n=>n.type==='FunctionDeclaration'&&n.id.name==='PriceQuoteBroadcastView');
 const content=template.quasis[0].value.cooked+source.slice(component.start,component.end)+template.quasis[1].value.cooked;
 const result=await build({stdin:{resolveDir:process.cwd(),loader:'jsx',contents:content},bundle:true,write:false,outfile:'quote-fixture.js',target:'chrome74',format:'iife',jsx:'automatic',minify:true,define:{'process.env.NODE_ENV':'"production"'}});
 bundles[cohort]={sourceSha256:crypto.createHash('sha256').update(source.slice(component.start,component.end)).digest('hex'),script:result.outputFiles.find(f=>f.path.endsWith('.js')).text,css:result.outputFiles.filter(f=>f.path.endsWith('.css')).map(f=>f.text).join('\n')};
}
const report={at:new Date().toISOString(),conditions:'Desktop Chromium, 390×844, CPU throttle 6, interleaved 12 A/B pairs with fresh page contexts, exact current component and 1000-product regression fixture. Shared host with Android stability soak; not Android timing acceptance. No network, writes, sharing or GC.',results:{before:[],after:[]},bundles:Object.fromEntries(Object.entries(bundles).map(([k,b])=>[k,{sourceSha256:b.sourceSha256,jsBytes:Buffer.byteLength(b.script),cssBytes:Buffer.byteLength(b.css)}]))};
const browser=await chromium.launch(chromiumLaunchOptions());
try{for(let i=0;i<12;i++)for(const cohort of i%2?['after','before']:['before','after']){
 const page=await browser.newPage({viewport:{width:390,height:844}});await page.route('**/*',r=>r.abort());
 const errors=[];page.on('pageerror',e=>errors.push(e.message));const c=await page.context().newCDPSession(page);await c.send('Performance.enable');await c.send('Emulation.setCPUThrottlingRate',{rate:6});
 await page.setContent('<html class="hd-low-power-ui"><body><div class="hd-enterprise-app-shell mobile-app-shell hd-shell--staff"><main><div id="root"></div></main></div></body></html>');
 await page.addStyleTag({content:css+'\n'+bundles[cohort].css});
 await page.addScriptTag({content:`window.__quoteStart=performance.now();(function check(){if(Array.from(document.querySelectorAll('button')).some(b=>b.textContent.trim()==='Chọn tất cả'))requestAnimationFrame(()=>requestAnimationFrame(()=>window.__quoteReadyMs=performance.now()-window.__quoteStart));else requestAnimationFrame(check)})();\n`+bundles[cohort].script});
 await page.waitForFunction(()=>Number.isFinite(window.__quoteReadyMs));
 const row=await page.evaluate(()=>({readyMs:window.__quoteReadyMs,optionNodes:document.querySelectorAll('select option').length,domElements:document.querySelectorAll('*').length,savedWrites:window.saved.length}));
 row.heap=await c.send('Runtime.getHeapUsage');row.cpu=Object.fromEntries((await c.send('Performance.getMetrics')).metrics.filter(m=>['ScriptDuration','LayoutDuration','RecalcStyleDuration','TaskDuration'].includes(m.name)).map(m=>[m.name,m.value]));row.errors=errors;report.results[cohort].push(row);await page.close();
}}finally{await browser.close();const stats=a=>{a=a.slice().sort((a,b)=>a-b);return{n:a.length,median:a[Math.ceil(a.length*.5)-1]??null,p95:a[Math.ceil(a.length*.95)-1]??null}};
 report.summary=Object.fromEntries(Object.entries(report.results).map(([k,rows])=>[k,{readyMs:stats(rows.map(r=>r.readyMs)),heapBytes:stats(rows.map(r=>r.heap.usedSize)),scriptingSeconds:stats(rows.map(r=>r.cpu.ScriptDuration)),layoutSeconds:stats(rows.map(r=>r.cpu.LayoutDuration)),options:stats(rows.map(r=>r.optionNodes)),errors:rows.flatMap(r=>r.errors),writes:rows.reduce((n,r)=>n+r.savedWrites,0)}]));
 await fs.writeFile(`${root}/quote-browser-ab.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report.summary));}
