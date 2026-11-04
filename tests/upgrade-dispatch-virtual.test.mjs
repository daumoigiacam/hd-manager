import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {chromium} from 'playwright-core';
import {chromiumLaunchOptions} from './helpers/chromium-launch-options.mjs';

const bundle=await build({stdin:{resolveDir:process.cwd(),loader:'jsx',contents:`
 import React,{useState,useRef}from'react';import{createRoot}from'react-dom/client';import Picker from'./src/features/warehouse/DispatchSearchPicker.jsx';
 function App(){const[q,setQ]=useState(''),[selected,setSelected]=useState(''),[open,setOpen]=useState(true),input=useRef(null);
 const options=Array.from({length:1000},(_,i)=>({id:'c'+i,label:'Customer '+i,detail:i%2?'Long address for multi-line measurement, Fictional District, Synthetic City':'Fixture address'})).filter(o=>o.label.toLowerCase().includes(q.toLowerCase()));
 return <><Picker value={q} selectedId={selected} open={open} label="Fixture customers" placeholder="Search" toggleLabel="Toggle" emptyText="No match" showEmpty={!options.length}
 groups={[{title:'Customers',options}]} inputRef={input} onOpenChange={setOpen} onChange={setQ} onSelect={setSelected}/><output>{selected}</output></>}
 createRoot(document.getElementById('root')).render(<App/>);`},bundle:true,write:false,outfile:'fixture.js',format:'iife',jsx:'automatic',target:'chrome74'});
for(const fallback of [false,true])test(`actual picker ${fallback?'old-WebView paged fallback':'TanStack virtual'} preserves last record, filtering and keyboard`,async()=>{
 const browser=await chromium.launch(chromiumLaunchOptions());
 try{
  const page=await browser.newPage({viewport:{width:390,height:844}});await page.route('**/*',r=>r.abort());
  await page.setContent('<style>:root{--hd-touch-target:44px;--hd-space-1:4px;--hd-space-2:8px;--hd-space-3:12px}body{font:16px Arial}#root{width:350px}</style><div id="root"></div>');
  if(fallback)await page.evaluate(()=>{window.ResizeObserver=undefined});
  for(const file of bundle.outputFiles.filter(f=>f.path.endsWith('.css')))await page.addStyleTag({content:file.text});
  await page.addScriptTag({content:bundle.outputFiles.find(f=>f.path.endsWith('.js')).text});
  await page.getByRole('option').first().waitFor();assert.ok(await page.getByRole('option').count()<30,'large list has bounded mounted DOM');
  if(!fallback){
   assert.equal(await page.locator('[data-hd-virtual-options]').getAttribute('data-hd-virtual-options'),'1000');
   await page.getByRole('option').first().focus();await page.keyboard.press('End');
   await page.waitForFunction(()=>document.activeElement?.textContent?.includes('Customer 999'));
   await page.keyboard.press('Enter');
   // keyboard.press dispatches the key; unlike click it need not wait for the
   // following React commit. Functional correctness waits for that commit;
   // input latency is measured separately by the Android harness.
   await page.waitForFunction(()=>document.querySelector('output').textContent==='c999');assert.equal(await page.locator('output').textContent(),'c999');
  }else{
   await page.getByRole('button',{name:'Sau',exact:true}).click();
   assert.ok(await page.getByRole('option').count()<=20);
  }
  await page.getByRole('combobox').fill('Customer 999');
  await page.getByRole('option',{name:/Customer 999/}).waitFor();assert.equal(await page.getByRole('option').count(),1);
  await page.getByRole('option').click();assert.equal(await page.locator('output').textContent(),'c999');
  await page.getByRole('combobox').fill('No such fixture');assert.equal(await page.getByRole('option').count(),0);
  await page.getByRole('combobox').fill('');await page.getByRole('option').first().waitFor();
  assert.ok(await page.getByRole('option').count()<30);
 }finally{await browser.close()}
});
