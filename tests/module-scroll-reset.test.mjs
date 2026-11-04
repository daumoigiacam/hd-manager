import test from 'node:test';import assert from 'node:assert/strict';import {build} from 'esbuild';import {chromium} from 'playwright-core';import {chromiumLaunchOptions} from './helpers/chromium-launch-options.mjs';

test('real navigation resets the old scroller before DOM replacement, preserving same-tab and unrelated input state', {timeout:30000},async()=>{
 const bundle=await build({stdin:{resolveDir:process.cwd(),loader:'jsx',contents:`
 import React,{useState,useRef} from 'react';import{createRoot}from'react-dom/client';import{useModuleScrollReset}from'./src/layout/useModuleScrollReset.js';
 window.writes=[];const original=Object.getOwnPropertyDescriptor(Element.prototype,'scrollTop');Object.defineProperty(Element.prototype,'scrollTop',{...original,set(value){if(this.hasAttribute('data-main'))window.writes.push({tab:this.getAttribute('data-route'),value});original.set.call(this,value)}});
 function Fixture(){const[tab,setTab]=useState('home'),[count,setCount]=useState(0),[draft,setDraft]=useState('');const ref=useRef(null);const navigate=useModuleScrollReset({activeTab:tab,mainContentRef:ref,onChange:setTab});
 return <><button onClick={()=>navigate('home')}>Home</button><button onClick={()=>navigate('orders')}>Orders</button><button onClick={()=>setTab('products')}>Parent restore</button><button onClick={()=>setCount(n=>n+1)}>Unrelated update</button>
 <main ref={ref} data-main data-route={tab} style={{height:200,overflow:'auto'}}><div key={tab} style={{height:2000}}><input aria-label="Draft" value={draft} onChange={e=>setDraft(e.target.value)}/>{count}</div></main></>}
 createRoot(document.getElementById('root')).render(<React.StrictMode><Fixture/></React.StrictMode>);
 `},bundle:true,write:false,format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'}});
 const browser=await chromium.launch(chromiumLaunchOptions());
 try{
  const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setContent('<div id="root"></div>');await page.addScriptTag({content:bundle.outputFiles[0].text});
  await page.getByLabel('Draft').fill('unsaved fixture');
  await page.evaluate(()=>{document.querySelector('main').scrollTop=350;window.writes=[]});
  await page.getByText('Unrelated update',{exact:true}).click();assert.equal(await page.evaluate(()=>document.querySelector('main').scrollTop),350);
  await page.getByText('Home',{exact:true}).click();assert.equal(await page.evaluate(()=>document.querySelector('main').scrollTop),350);
  assert.deepEqual(await page.evaluate(()=>window.writes),[]);
  await page.getByText('Orders',{exact:true}).click();await page.waitForFunction(()=>document.querySelector('main').dataset.route==='orders');
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  assert.deepEqual(await page.evaluate(()=>window.writes),[{tab:'home',value:0}]);assert.equal(await page.evaluate(()=>document.querySelector('main').scrollTop),0);
  assert.equal(await page.getByLabel('Draft').inputValue(),'unsaved fixture');
  await page.evaluate(()=>{document.querySelector('main').scrollTop=300;window.writes=[]});
  await page.getByText('Parent restore',{exact:true}).click();await page.waitForFunction(()=>document.querySelector('main').dataset.route==='products'&&document.querySelector('main').scrollTop===0);
  assert.deepEqual(await page.evaluate(()=>window.writes),[{tab:'products',value:0}]);assert.deepEqual(errors,[]);
 }finally{await browser.close()}
});
