import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync}from'node:fs';
import {build}from'esbuild';import {chromium}from'playwright-core';import {chromiumLaunchOptions}from'./helpers/chromium-launch-options.mjs';
test('same projection owner publishes primary before details and keeps cached finance interactive during background refresh',{timeout:30000},async()=>{
 const bundle=await build({stdin:{resolveDir:process.cwd(),loader:'jsx',contents:`
 import React,{useState}from'react';import{createRoot}from'react-dom/client';
 import{useCooperativeDashboardProjection}from'./src/services/useCooperativeDashboardProjection.js';
 const input={privacyScope:'verified',company:{id:'tenant'},employee:{id:'employee'},dashboardDayKey:'2026-11-07',orders:[]},cache={};
 window.calls=[];window.owners=0;window.closed=0;window.hold=false;window.release=null;
 function Fixture(){const[flags,setFlags]=useState({enabled:false,primaryReady:false}),[inputs,setInputs]=useState(input);window.flags=setFlags;window.scope=scope=>setInputs({...input,privacyScope:scope});
 const p=useCooperativeDashboardProjection(inputs,cache,function*(){return[]},flags);
 return <button data-kind={p.snapshot?.kind||'none'} data-pending={p.pending} onClick={()=>window.clicks=(window.clicks||0)+1}>{p.snapshot?.finance.revenueToday??'pending'}</button>}
 createRoot(document.getElementById('root')).render(<Fixture/>);`},bundle:true,write:false,jsx:'automatic',format:'iife',define:{'process.env.NODE_ENV':'"development"'},plugins:[{name:'controlled-worker',setup(api){api.onLoad({filter:/onlineHomeProjectionClient\.js$/},()=>({loader:'js',contents:`export function createOnlineHomeProjectionClient(){window.owners++;return {async calculate(input,mode){window.calls.push(mode);if(window.hold)await new Promise(r=>window.release=r);return {payrollCosts:[],snapshot:{kind:mode==='primary'?'home-primary-v1':'full',generatedAt:'2026-11-07T12:00:00Z',finance:{revenueToday:123}},timings:{totalMs:0}}},close(){window.closed++}}}` }));}}]});
 const browser=await chromium.launch(chromiumLaunchOptions());try{const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('http://home-test.local/',r=>r.fulfill({body:'<div id="root"></div>',contentType:'text/html'}));await page.goto('http://home-test.local/');await page.addScriptTag({content:bundle.outputFiles[0].text});
 await page.locator('[data-kind="none"]').waitFor();assert.deepEqual(await page.evaluate(()=>window.calls),[]);
 await page.evaluate(()=>window.flags({enabled:false,primaryReady:true}));await page.locator('[data-kind="home-primary-v1"]').waitFor();assert.deepEqual(await page.evaluate(()=>window.calls),['primary']);
 await page.evaluate(()=>{window.hold=true;window.flags({enabled:true,primaryReady:true})});await page.locator('button').click();assert.equal(await page.evaluate(()=>window.clicks),1);assert.equal(await page.locator('button').textContent(),'123');
 await page.waitForFunction?.(()=>window.release); // Optional backends use the next explicit state witness below.
 for(let i=0;i<40&&!await page.evaluate(()=>Boolean(window.release));i++)await new Promise(r=>setTimeout(r,10));
 await page.evaluate(()=>window.release());await page.locator('[data-kind="full"]').waitFor();assert.equal(await page.evaluate(()=>window.owners),1);assert.deepEqual(await page.evaluate(()=>window.calls),['primary','full']);
 await page.evaluate(()=>{window.flags({enabled:false,primaryReady:false});window.scope('other-tenant-session')});await page.locator('[data-kind="none"]').waitFor();assert.equal(await page.locator('button').textContent(),'pending');assert.deepEqual(errors,[]);
 }finally{await browser.close()}
});
test('live Home keeps both source-confirmation and completed ledger guards; logout clears only the report backing entry',()=>{
 const source=readFileSync('src/App.jsx','utf8');
 assert.match(source,/primarySourceReady=\{!mainLedgerProjection\.pending&&!mainLedgerProjection\.error&&serverConfirmedCollectionState/);
 assert.match(source,/sourceReady=\{!mainLedgerProjection\.pending&&!mainLedgerProjection\.error&&serverConfirmedCollectionState/);
 assert.match(source,/const clearAppSession = \(\) => \{\s*clearHomeSessionReport\(\)/);
 assert.match(source,/const snapshot = projection\.snapshot\?\.kind === 'home-primary-v1'\s*\? \{\.\.\.emptySnapshot,\.\.\.projection\.snapshot,finance:\{\.\.\.emptySnapshot\.finance,\.\.\.projection\.snapshot\.finance\}\}/);
 assert.match(source,/<BusinessReportWorkspace snapshot=\{projection\.snapshot\}/);
 assert.match(source,/projection\.snapshot\.kind!=='home-primary-v1'&&<SmartAIAssistant/);
});
