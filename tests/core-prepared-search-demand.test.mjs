import test from 'node:test';import assert from 'node:assert/strict';
import {build} from 'esbuild';import {chromium} from 'playwright-core';import {chromiumLaunchOptions} from './helpers/chromium-launch-options.mjs';
test('real search hook does no indexing for an empty query, reuses completed search and rejects old-source results',async()=>{
 const bundle=await build({stdin:{resolveDir:process.cwd(),loader:'jsx',contents:`
 import React,{useCallback,useState} from 'react';import {createRoot} from 'react-dom/client';import {usePreparedSearch} from './src/hooks/usePreparedSearch.js';
 window.fieldReads=0;window.emptyRenders=0;
 function Fixture(){const [query,setQuery]=useState(''),[records,setRecords]=useState(()=>Array.from({length:1500},(_,i)=>({id:'a-'+i,name:'Old tenant item '+i})));
 const fields=useCallback(row=>{window.fieldReads++;return [{value:row.name}]},[]);const result=usePreparedSearch(records,fields,query);
 window.setQuery=setQuery;window.changeSource=()=>setRecords([{id:'new',name:'Replacement tenant item'}]);
 if(!query)window.emptyRenders++;return <div data-query={query} data-pending={String(result.pending)} data-error={String(!!result.error)} data-index={String(!!result.index)}>{query?result.results.map(r=>r.id).join(','):'Unfiltered list'}</div>;
 }createRoot(document.getElementById('root')).render(<Fixture/>);`},bundle:true,write:false,format:'iife',jsx:'automatic'});
 const browser=await chromium.launch(chromiumLaunchOptions());try{
  const page=await browser.newPage();await page.route('**/*',route=>route.abort());await page.setContent('<div id="root"></div>');await page.addScriptTag({content:bundle.outputFiles[0].text});
  await page.getByText('Unfiltered list',{exact:true}).waitFor();await page.waitForTimeout(60);
  assert.equal(await page.evaluate(()=>window.fieldReads),0,'opening an unfiltered list never indexes histories');
  await page.evaluate(()=>window.setQuery('Old tenant item 1499'));await page.locator('[data-query="Old tenant item 1499"][data-pending="false"]').waitFor();
  assert.equal(await page.locator('[data-pending]').textContent(),'a-1499');assert.equal(await page.evaluate(()=>window.fieldReads),1500);
  await page.evaluate(()=>window.setQuery(''));await page.getByText('Unfiltered list',{exact:true}).waitFor();
  await page.evaluate(()=>window.setQuery('Old tenant item 1498'));await page.locator('[data-query="Old tenant item 1498"][data-pending="false"]').waitFor();
  assert.equal(await page.locator('[data-pending]').textContent(),'a-1498');assert.equal(await page.evaluate(()=>window.fieldReads),1500);
  await page.evaluate(()=>{window.setQuery('');window.changeSource()});await page.getByText('Unfiltered list',{exact:true}).waitFor();await page.waitForTimeout(60);
  assert.equal(await page.evaluate(()=>window.fieldReads),1500,'source changes while idle do not eagerly index');
  await page.evaluate(()=>window.setQuery('Replacement tenant'));await page.locator('[data-query="Replacement tenant"][data-pending="false"]').waitFor();
  assert.equal(await page.locator('[data-pending]').textContent(),'new');assert.equal(await page.evaluate(()=>window.fieldReads),1501);
 }finally{await browser.close()}
});
