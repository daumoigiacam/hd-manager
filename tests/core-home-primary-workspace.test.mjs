import test from 'node:test';import assert from 'node:assert/strict';
import {build} from 'esbuild';import {chromium} from 'playwright-core';import {chromiumLaunchOptions} from './helpers/chromium-launch-options.mjs';
test('primary Home shows verified finance, requests details only on click, and never renders unready costing as zero',{timeout:30000},async()=>{
 const bundle=await build({stdin:{resolveDir:process.cwd(),loader:'jsx',contents:`
 import React,{useState}from'react';import{createRoot}from'react-dom/client';
 import Workspace from './src/features/business-report/BusinessReportWorkspace.jsx';
 import{createHomePrimarySnapshotIterator,buildExecutiveDashboardSnapshot}from'./src/services/executiveDashboardService.js';
 const expenses=[{id:'e',date:'2026-11-04',amount:30000,category:'Chi khác'}];
 const input={now:'2026-11-04T12:00:00',orders:[{id:'o',date:'2026-11-04',totalAmount:100000}],payments:[],expenses,cashExpenseRecords:expenses,payrollCosts:[],debtLedger:[{id:'c',debt:25000}],employees:[]};
 const iterator=createHomePrimarySnapshotIterator(input);let step;do{step=iterator.next()}while(!step.done);const primary=step.value;
 window.requests=0;window.closedCount=0;
 function Fixture(){const[snapshot,setSnapshot]=useState(primary),[pending,setPending]=useState(false),[stale,setStale]=useState(false);
 window.revealFull=()=>{setSnapshot(buildExecutiveDashboardSnapshot(input));setPending(false)};window.markStale=()=>setStale(true);
 return <Workspace snapshot={snapshot} detailsPending={pending} sourcePending={stale} onCloseDetails={()=>{window.closedCount++}} onRequestDetails={()=>{window.requests++;setPending(true)}}/>}
 createRoot(document.getElementById('root')).render(<Fixture/>);
 `},bundle:true,write:false,format:'iife',jsx:'automatic',loader:{'.css':'empty'},define:{'process.env.NODE_ENV':'"development"'}});
 const browser=await chromium.launch(chromiumLaunchOptions());
 try{
  const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.setContent('<div id="root"></div>');await page.addScriptTag({content:bundle.outputFiles[0].text});
  await page.locator('.business-report-kpi-grid').waitFor();
  const values=()=>page.locator('.business-report-kpi').evaluateAll(nodes=>nodes.map(e=>e.title.replace(/[^0-9-]/g,'')));
  assert.deepEqual(await values(),['100000','70000','30000','25000']);assert.equal(await page.evaluate(()=>window.requests),0);assert.equal(await page.getByText('Xem phân tích',{exact:true}).count(),1);
  await page.locator('.business-report-kpi--expense').click();assert.equal(await page.evaluate(()=>window.requests),1);await page.getByText('Đang lấy dữ liệu chi tiết theo yêu cầu…',{exact:true}).waitFor();assert.equal(await page.locator('.business-report-view-tabs').count(),0);
  await page.evaluate(()=>window.revealFull());await page.locator('.business-report-view-tabs').waitFor();
  await page.getByRole('button',{name:'Quay lại',exact:true}).click();await page.locator('.business-report-kpi-grid').waitFor();assert.deepEqual(await values(),['100000','70000','30000','25000']);
  assert.equal(await page.evaluate(()=>window.closedCount),1);
  await page.evaluate(()=>window.markStale());await page.getByText(/Đang đối chiếu ·/).waitFor();assert.deepEqual(await values(),['100000','70000','30000','25000']);assert.deepEqual(errors,[]);
 }finally{await browser.close()}
});

