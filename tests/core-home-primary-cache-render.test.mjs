import test from 'node:test';import assert from 'node:assert/strict';
import {build} from 'esbuild';import {chromium} from 'playwright-core';import {chromiumLaunchOptions} from './helpers/chromium-launch-options.mjs';
test('valid RAM projection displays as pending before sources, while changed privacy/clock hides it immediately',{timeout:30000},async()=>{
 const bundle=await build({stdin:{resolveDir:process.cwd(),loader:'jsx',contents:`
 import React,{useState,useLayoutEffect}from'react';import{createRoot}from'react-dom/client';
 import{useHomePrimaryProjection}from'./src/services/useHomePrimaryProjection.js';
 import{buildHomePrimaryProjection}from'./src/services/executiveDashboardService.js';
 const scope={privacyScope:'verified-principal-tenant-grants-session',dashboardDayKey:'2026-11-04',dashboardClockScope:'2026-11-04|Asia/Saigon|-420'};
 const original={...scope,now:'2026-11-04T12:00:00',orders:[{id:'o',date:'2026-11-04',totalAmount:100000}],cashExpenseRecords:[],payrollCosts:[],debtLedger:[]};
 const snapshot=buildHomePrimaryProjection(original),cache={homePrimaryProjection:{inputs:original,snapshot}};
 const payroll=function*(){return[]};window.commits=[];
 function Fixture(){const[inputs,setInputs]=useState({...original,orders:[]});window.change=patch=>setInputs(previous=>({...previous,...patch}));
 const result=useHomePrimaryProjection(inputs,cache,payroll,{enabled:false});useLayoutEffect(()=>{window.commits.push({scope:inputs.privacyScope,visible:Boolean(result.snapshot),pending:result.pending})});
 return <p data-visible={Boolean(result.snapshot)} data-pending={result.pending}>{result.snapshot?.finance.revenueToday??'hidden'}</p>}
 createRoot(document.getElementById('root')).render(<Fixture/>);`},bundle:true,write:false,format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"development"'}});
 const browser=await chromium.launch(chromiumLaunchOptions());try{const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.setContent('<div id="root"></div>');await page.addScriptTag({content:bundle.outputFiles[0].text});
 await page.locator('[data-visible="true"][data-pending="true"]').waitFor();assert.equal(await page.locator('p').textContent(),'100000');
 for(const patch of [{privacyScope:'different-session'},{privacyScope:'verified-principal-tenant-grants-session',dashboardDayKey:'2026-11-05'},{dashboardDayKey:'2026-11-04',dashboardClockScope:'changed-zone'}]){await page.evaluate(patch=>window.change(patch),patch);await page.locator('[data-visible="false"]').waitFor();assert.equal(await page.locator('p').textContent(),'hidden')}
 assert.deepEqual(errors,[]);
 }finally{await browser.close()}
});
