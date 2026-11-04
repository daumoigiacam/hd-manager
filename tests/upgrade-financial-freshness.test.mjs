import test from'node:test';import assert from'node:assert/strict';import{build}from'esbuild';import{chromium}from'playwright-core';import{chromiumLaunchOptions}from'./helpers/chromium-launch-options.mjs';
test('retained financial snapshot keeps its real as-of time, fixed metadata height and unchanged amounts while updating',async()=>{
 const bundle=await build({stdin:{resolveDir:process.cwd(),loader:'jsx',contents:`
 import React,{useState}from'react';import{createRoot}from'react-dom/client';import Workspace from'./src/features/business-report/BusinessReportWorkspace.jsx';
 import{buildExecutiveDashboardSnapshot}from'./src/services/executiveDashboardService.js';
 const snapshot=buildExecutiveDashboardSnapshot({now:new Date('2026-11-03T02:00:00Z'),orders:[{id:'o',date:'2026-11-03',customerId:'c',amount:1234567}],customers:[{id:'c',name:'Synthetic customer'}]});
 snapshot.generatedAt='2020-01-01T00:00:00Z';window.original=JSON.stringify(snapshot);
 function App(){const[pending,setPending]=useState(false);window.pending=setPending;window.snapshotJson=()=>JSON.stringify(snapshot);return <Workspace snapshot={snapshot} sourcePending={pending} accountName="Fixture"/>}
 createRoot(document.getElementById('root')).render(<App/>);`},bundle:true,write:false,outfile:'freshness.js',target:'chrome74',format:'iife',jsx:'automatic'});
 const browser=await chromium.launch(chromiumLaunchOptions());try{
  const page=await browser.newPage({viewport:{width:390,height:844},timezoneId:'Asia/Ho_Chi_Minh'});await page.route('**/*',r=>r.abort());await page.setContent('<div id="root"></div>');
  for(const f of bundle.outputFiles.filter(f=>f.path.endsWith('.css')))await page.addStyleTag({content:f.text});await page.addScriptTag({content:bundle.outputFiles.find(f=>f.path.endsWith('.js')).text});
  const status=page.locator('.business-report-freshness');await status.waitFor();assert.match(await status.textContent(),/Số liệu tại.*2020/);
  const height=await status.evaluate(e=>e.getBoundingClientRect().height),amounts=await page.locator('.business-report-kpi__value').allTextContents();
  await page.evaluate(()=>window.pending(true));await page.getByText(/Đang đối chiếu · Số liệu tại/).waitFor();assert.match(await status.textContent(),/2020/);
  assert.equal(await status.evaluate(e=>e.getBoundingClientRect().height),height);assert.deepEqual(await page.locator('.business-report-kpi__value').allTextContents(),amounts);
  await page.evaluate(()=>window.pending(false));await page.waitForFunction(()=>!document.querySelector('.business-report-freshness').textContent.includes('Đang đối chiếu'));
  assert.doesNotMatch(await status.textContent(),/Đang đối chiếu/);assert.equal(await page.evaluate(()=>window.snapshotJson()===window.original),true);
 }finally{await browser.close()}
});
