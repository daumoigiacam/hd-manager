import test from 'node:test';
import assert from 'node:assert/strict';
import {readApplicationRootSource} from '../scripts/helpers/application-source.cjs';
import {parse} from '@babel/parser';
import {build} from 'esbuild';
import {chromium} from 'playwright-core';
import {chromiumLaunchOptions} from './helpers/chromium-launch-options.mjs';

test('actual customer wrapper/header keep typing out of the parent, retain focus/drafts, and cancel old-scope commits', {timeout:30000},async()=>{
  const source=readApplicationRootSource(),tree=parse(source,{sourceType:'module',plugins:['jsx']});
  const wrapper=tree.program.body.find(node=>node.type==='FunctionDeclaration'&&node.id?.name==='CustomerCRMView');
  assert(wrapper);assert(source.includes('const customerSearchStore = useMemo(() => createOrderSearchState(), [dashboardPrivacyScope])'));
  assert(source.indexOf('const dashboardPrivacyScope =')<source.indexOf('const customerSearchStore ='));
  assert(source.includes('searchStore={customerSearchStore} searchKeyword={customerSearchKeyword}'));
  assert(source.includes('key={`${activeTab}:${dashboardPrivacyScope}`}'));
  const bundle=await build({stdin:{resolveDir:process.cwd(),loader:'jsx',contents:`
    import React,{useCallback,useMemo,useState,useSyncExternalStore}from'react';import{createRoot}from'react-dom/client';
    import{createOrderSearchState}from'./src/services/orderSearchState.js';import OrderSearchInput from'./src/features/orders/OrderSearchInput.jsx';
    const noCustomerSearchSubscription=()=>()=>{},deferredCustomerCRMViewModule={};
    function PreloadedWorkspace({viewProps}){return <p data-query>{viewProps.searchKeyword}</p>}
    ${source.slice(wrapper.start,wrapper.end)}
    window.parentRenders=0;window.commits=[];
    function Parent(){window.parentRenders++;const[scope,setScope]=useState('actor-a'),[bump,setBump]=useState(0);
      const store=useMemo(()=>{const value=createOrderSearchState(),write=value.set;value.set=next=>{window.commits.push({scope,value:typeof next==='string'?next:'updater'});write(next)};return value},[scope]);
      window.setScope=setScope;window.bump=()=>setBump(v=>v+1);window.currentStore=store;
      return <><OrderSearchInput key={'input-'+scope} searchStore={store} onCommit={store.set} onClose={()=>{window.searchClosed=true}} commitDelayMs={400} placeholder="Search fixture"/>
        <CustomerCRMView key={'workspace-'+scope} searchStore={store}/><p>{bump}</p></>}
    createRoot(document.getElementById('root')).render(<React.StrictMode><Parent/></React.StrictMode>);
  `},bundle:true,write:false,format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"development"'}});
  const browser=await chromium.launch(chromiumLaunchOptions());
  try{
    const page=await browser.newPage(),errors=[];page.setDefaultTimeout(5000);page.on('pageerror',error=>errors.push(error.message));
    await page.setContent('<div id="root"></div>');await page.addScriptTag({content:bundle.outputFiles[0].text});
    const input=page.getByPlaceholder('Search fixture');await input.waitFor();await input.focus();
    const before=await page.evaluate(()=>window.parentRenders);
    await page.keyboard.type('abc',{delay:5});assert.equal(await input.inputValue(),'abc');
    assert.equal(await page.evaluate(()=>window.parentRenders),before,'keystrokes must not schedule the parent shell');
    await page.waitForFunction(()=>document.querySelector('[data-query]').textContent==='abc');
    assert.equal(await page.evaluate(()=>window.parentRenders),before,'committed filtering remains a local subscriber');
    await input.fill('unsaved draft');await page.evaluate(()=>window.bump());
    assert.equal(await input.inputValue(),'unsaved draft');assert.equal(await input.evaluate(el=>document.activeElement===el),true);
    await page.evaluate(()=>window.currentStore.set('notice query'));await page.waitForFunction(()=>document.querySelector('input').value==='notice query');
    await input.fill('flush-now');await input.press('Enter');await page.waitForFunction(()=>document.querySelector('[data-query]').textContent==='flush-now');
    await page.getByRole('button',{name:'Xóa tìm kiếm'}).click();await page.waitForFunction(()=>window.currentStore.getSnapshot()==='');
    await input.fill('must-not-cross-tenant');await page.evaluate(()=>window.setScope('actor-b'));
    await page.waitForFunction(()=>document.querySelectorAll('input').length===1&&document.querySelector('input').value==='');await page.waitForTimeout(600);
    assert.equal(await page.evaluate(()=>window.currentStore.getSnapshot()),'');
    assert.equal(await page.evaluate(()=>window.commits.some(row=>row.scope==='actor-b'&&row.value==='must-not-cross-tenant')),false);
    await page.getByRole('button',{name:'Xóa tìm kiếm'}).click();assert.equal(await page.evaluate(()=>window.searchClosed),true);
    assert.deepEqual(errors,[]);
  }finally{await browser.close()}
});
