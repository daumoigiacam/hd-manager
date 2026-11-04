import test from 'node:test';import assert from 'node:assert/strict';
import {build} from 'esbuild';import {chromium} from 'playwright-core';import {chromiumLaunchOptions} from './helpers/chromium-launch-options.mjs';
test('optional idle warmup reuses one index and cancels an old principal before publication',async()=>{
 const bundle=await build({stdin:{resolveDir:process.cwd(),loader:'jsx',contents:`
 import React,{useState,useCallback}from'react';import{createRoot}from'react-dom/client';import{usePreparedSearch}from'./src/hooks/usePreparedSearch.js';
 window.reads=0;function App(){const[q,setQ]=useState(''),[rows,setRows]=useState([{id:'a',name:'Alpha'}]);const fields=useCallback(r=>{window.reads++;return[{value:r.name}]},[]);
 const s=usePreparedSearch(rows,fields,q,undefined,undefined,undefined,{warmup:true});window.query=setQ;window.replace=()=>setRows([{id:'b',name:'Beta'}]);
 return <output data-ready={!!s.index} data-pending={s.pending}>{q?s.results.map(r=>r.id).join(','):'Unfiltered'}</output>}
 const root=createRoot(document.getElementById('root'));window.unmount=()=>root.unmount();root.render(<App/>);`},bundle:true,write:false,format:'iife',jsx:'automatic'});
 const browser=await chromium.launch(chromiumLaunchOptions());try{
  const page=await browser.newPage();await page.route('**/*',r=>r.abort());await page.setContent('<div id="root"></div>');await page.addScriptTag({content:bundle.outputFiles[0].text});
  await page.getByText('Unfiltered').waitFor();assert.equal(await page.evaluate(()=>window.reads),0,'first commit has no indexing');
  await page.locator('[data-ready=true]').waitFor();assert.equal(await page.evaluate(()=>window.reads),1);
  await page.evaluate(()=>window.query('Alpha'));await page.getByText('a',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.reads),1);
  await page.evaluate(()=>{window.query('');window.replace()});await page.locator('[data-ready=false]').waitFor();
  await page.evaluate(()=>window.query('Alpha'));await page.locator('[data-pending=false]').waitFor({state:'attached'});assert.equal(await page.locator('output').textContent(),'');
  await page.evaluate(()=>window.query('Beta'));await page.getByText('b',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.reads),2);
  await page.evaluate(()=>{window.query('');window.replace()});await page.locator('[data-ready=false]').waitFor();await page.evaluate(()=>window.unmount());
  await page.waitForTimeout(350);assert.equal(await page.evaluate(()=>window.reads),2,'unmount cancels background index preparation');
 }finally{await browser.close()}
});
