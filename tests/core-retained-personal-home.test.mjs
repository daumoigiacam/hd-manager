import test from 'node:test';import assert from 'node:assert/strict';import {build} from 'esbuild';
import {chromium} from 'playwright-core';import {chromiumLaunchOptions} from './helpers/chromium-launch-options.mjs';
test('hidden Home skips updates, preserves local state on return, and resets private state on scope change',{timeout:30000},async()=>{
 const bundle=await build({stdin:{resolveDir:process.cwd(),loader:'jsx',contents:`
 import React,{useState}from'react';import{createRoot}from'react-dom/client';import Retained from'./src/layout/RetainedReadOnlyHome.jsx';
 window.renders=0;
 function Home({value}){window.renders++;const[draft,setDraft]=useState('');return <><p>Value {value}</p><input aria-label="Draft" value={draft} onChange={event=>setDraft(event.target.value)}/></>}
 function Fixture(){const[active,setActive]=useState(true),[value,setValue]=useState(1),[scope,setScope]=useState('a');
 window.toggle=()=>setActive(v=>!v);window.update=()=>setValue(v=>v+1);window.scope=()=>setScope('b');
 return <div style={{display:active?undefined:'none'}}><Retained privacyScope={scope} isActive={active}><Home value={value}/></Retained></div>}
 createRoot(document.getElementById('root')).render(<Fixture/>);
 `},bundle:true,write:false,jsx:'automatic',format:'iife',define:{'process.env.NODE_ENV':'"production"'}});
 const browser=await chromium.launch(chromiumLaunchOptions());try{
  const page=await browser.newPage();await page.setContent('<div id="root"></div>');await page.addScriptTag({content:bundle.outputFiles[0].text});
  await page.getByLabel('Draft').fill('local');const initial=await page.evaluate(()=>window.renders);
  await page.evaluate(()=>{window.toggle();window.update()});await page.waitForTimeout(30);
  assert.equal(await page.evaluate(()=>window.renders),initial,'hidden source updates do not recalculate Home');
  await page.evaluate(()=>window.toggle());await page.getByText('Value 2',{exact:true}).waitFor();assert.equal(await page.getByLabel('Draft').inputValue(),'local');
  await page.evaluate(()=>window.scope());await page.waitForFunction(()=>document.querySelector('input').value==='');
  assert.equal(await page.getByLabel('Draft').inputValue(),'','permission scope resets old private local state');
 }finally{await browser.close()}
});
