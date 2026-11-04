import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {chromium} from 'playwright-core';
import {chromiumLaunchOptions} from './helpers/chromium-launch-options.mjs';

test('real background refresh marker never moves layout and subscribes to busy transitions only', {timeout:30000},async()=>{
 const bundle=await build({stdin:{resolveDir:process.cwd(),loader:'jsx',contents:`
 import React from 'react';import{createRoot}from'react-dom/client';
 import Notice from './src/layout/ReadWorkerActivityNotice.jsx';
 import{createReadWorkerActivityStore}from'./src/services/readWorkerActivity.js';
 window.store=createReadWorkerActivityStore();window.reads=0;const get=window.store.getBusySnapshot;
 window.store.getBusySnapshot=()=>{window.reads++;return get()};
 createRoot(document.getElementById('root')).render(<><header>Home</header><Notice store={window.store}/><section id="report">Completed report</section></>);
 `},bundle:true,write:false,format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'}});
 const browser=await chromium.launch(chromiumLaunchOptions());
 try{
  const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setContent('<div id="root"></div>');await page.addScriptTag({content:bundle.outputFiles[0].text});
  await page.locator('#report').waitFor();
  const top=await page.locator('#report').evaluate(n=>n.getBoundingClientRect().top);
  const set=async(id,busy)=>{await page.evaluate(([id,busy])=>window.store.setPending(id,busy),[id,busy]);await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))))};
  await set('orders',true);
  assert.equal(await page.locator('[data-hd-read-refreshing][aria-busy="true"]').count(),1);
  assert.equal(await page.locator('[data-hd-read-refreshing]').isVisible(),false);
  assert.equal(await page.locator('body').innerText(),'Home\nCompleted report');
  assert.equal(await page.locator('#report').evaluate(n=>n.getBoundingClientRect().top),top);
  // useSyncExternalStore checks once per notification; a React render adds reads.
  const reads=await page.evaluate(()=>window.reads);
  await set('payments',true);await set('orders',false);
  assert.equal(await page.evaluate(()=>window.reads),reads+2,'positive count changes must not trigger a React render');
  assert.equal(await page.locator('[data-hd-read-refreshing]').count(),1,'remaining collection is still busy');
  await set('payments',false);
  assert.equal(await page.locator('[data-hd-read-refreshing]').count(),0);
  assert.equal(await page.locator('#report').evaluate(n=>n.getBoundingClientRect().top),top);
  assert.deepEqual(errors,[]);
 }finally{await browser.close()}
});
