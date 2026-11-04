import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from 'playwright-core';
import { chromiumLaunchOptions } from './helpers/chromium-launch-options.mjs';

test('React StrictMode query lifecycle keeps cache, cancels unmounted consumers, observes empty pages and hides old access scopes', {timeout:30000}, async()=>{
  const bundle=await build({stdin:{resolveDir:process.cwd(),loader:'jsx',contents:`
    import React,{useState}from'react';import{createRoot}from'react-dom/client';
    import{useInstantDataEngine}from'./src/data/useInstantDataEngine.js';import{useInstantPage}from'./src/data/useInstantPage.js';
    window.reads=[];window.streams=[];window.engines=[];window.empty=false;
    const page=(scope,value,hasMore=false)=>({items:value===null?[]:[{id:'fixture-row-'+value,companyId:scope.tenantId,value}],
      hasMore,nextCursor:hasMore?'next-page':null,source:'server',coverage:'all-query-matches'});
    const transport={
      readPage:request=>new Promise(resolve=>{window.reads.push(request);setTimeout(()=>resolve(page(request.scope,window.empty?null:request.scope.tenantId+':'+(request.cursor||'first'),!request.cursor&&!window.empty)),40)}),
      subscribePage:request=>{const entry={request,stopped:false};window.streams.push(entry);return()=>{entry.stopped=true}},
    };
    function List({engine}){const state=useInstantPage(engine,{collection:'products'},{realtime:true});return <>
      <div data-status={state.status} data-live={state.realtimeStatus} data-source={state.dataSource||''}>
        {state.items.map(row=><p key={row.id} data-row>{row.value}</p>)}</div>
      <button onClick={()=>state.refresh()}>Refresh</button><button onClick={()=>state.next()}>Next page</button></>}
    function Fixture(){const[tenant,setTenant]=useState('a'),[shown,setShown]=useState(true);const engine=useInstantDataEngine({
      scope:{principalId:'actor-'+tenant,tenantId:tenant,permissionRevision:'fixture-v1',sessionId:'fixture-login-1'},transport,
      isCurrent:identity=>identity.tenantId===tenant});
      if(!window.engines.includes(engine))window.engines.push(engine);
      window.currentEngine=engine;
      return <><button onClick={()=>setShown(old=>!old)}>Toggle list</button><button onClick={()=>setTenant('b')}>Switch tenant</button>{shown&&<List engine={engine}/>}</>}
    const root=createRoot(document.getElementById('root'));root.render(<React.StrictMode><Fixture/></React.StrictMode>);window.stop=()=>root.unmount();
    window.emit=value=>window.streams.filter(entry=>!entry.stopped).forEach(entry=>entry.request.onData(page(entry.request.scope,value)));
  `},bundle:true,write:false,format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"development"'}});
  const browser=await chromium.launch(chromiumLaunchOptions());
  try {
    const page=await browser.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.setContent('<div id="root"></div>');await page.addScriptTag({content:bundle.outputFiles[0].text});
    await page.waitForFunction(()=>document.querySelector('[data-row]')?.textContent==='a:first'&&window.streams.some(row=>!row.stopped));
    assert.equal(await page.evaluate(()=>window.currentEngine.getDiagnostics().closed),false,'StrictMode cleanup/setup must keep the live engine');
    const reads=await page.evaluate(()=>window.reads.length);
    await page.getByText('Toggle list',{exact:true}).click();await page.waitForFunction(()=>window.streams.every(row=>row.stopped));
    await page.getByText('Toggle list',{exact:true}).click();await page.waitForFunction(()=>document.querySelector('[data-row]')?.textContent==='a:first');
    assert.equal(await page.evaluate(()=>window.reads.length),reads,'fresh remount reads a scoped cached page, without another physical request');
    await page.getByText('Next page',{exact:true}).click();await page.waitForFunction(()=>document.querySelector('[data-row]')?.textContent==='a:next-page');
    await page.getByText('Switch tenant',{exact:true}).click();
    assert.notEqual(await page.locator('[data-row]').count()?await page.locator('[data-row]').first().textContent():'','a:next-page');
    await page.waitForFunction(()=>document.querySelector('[data-row]')?.textContent==='b:first');
    await page.waitForFunction(()=>window.engines.filter(engine=>engine.scope.tenantId==='a').every(engine=>engine.getDiagnostics().closed));
    await page.evaluate(()=>{window.empty=true});await page.getByText('Refresh',{exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('[data-status]')?.dataset.status==='ready'&&!document.querySelector('[data-row]')&&window.streams.some(row=>!row.stopped));
    await page.evaluate(()=>window.emit('live-after-empty'));await page.waitForFunction(()=>document.querySelector('[data-row]')?.textContent==='live-after-empty');
    await page.evaluate(()=>window.stop());await page.waitForFunction(()=>window.currentEngine.getDiagnostics().closed&&window.streams.every(row=>row.stopped));
    assert.deepEqual(errors,[]);
  }finally{await browser.close()}
});
