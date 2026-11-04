import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parse } from '@babel/parser';
import { build } from 'esbuild';
import { chromium } from 'playwright-core';
import { chromiumLaunchOptions } from './helpers/chromium-launch-options.mjs';

test('navigation updates only the subscribing shell; source lifecycle follows routes, identity and unmount', {timeout:30000}, async () => {
  const bundle = await build({stdin:{resolveDir:process.cwd(),loader:'jsx',contents:`
    import React,{useState}from'react';import{createRoot}from'react-dom/client';
    import{createModuleNavigation,useModuleNavigationSnapshot,useModuleNavigationEffect}from'./src/layout/moduleNavigation.js';
    window.log=[];window.rootRenders=0;
    function Shell({store,route}){const tab=useModuleNavigationSnapshot(store,route);return <>
      <main data-route={tab}>{tab}</main><button onClick={()=>store.set('orders')}>Orders</button>
      <button onClick={()=>store.set(old=>old==='orders'?'customers':'orders')}>Next</button></>}
    function DataOwner(){window.rootRenders++;const[store]=useState(()=>createModuleNavigation('home'));
      const route=useModuleNavigationSnapshot(store,store.getSnapshot(),false);const[identity,setIdentity]=useState('a');
      useModuleNavigationEffect(store,tab=>{window.log.push('open:'+identity+':'+tab);return()=>window.log.push('close:'+identity+':'+tab)},[identity]);
      return <><Shell store={store} route={route}/><button onClick={()=>setIdentity('b')}>Switch scope</button></>}
    const root=createRoot(document.getElementById('root'));root.render(<React.StrictMode><DataOwner/></React.StrictMode>);window.stop=()=>root.unmount();
  `},bundle:true,write:false,jsx:'automatic',format:'iife',define:{'process.env.NODE_ENV':'"production"'}});
  const browser=await chromium.launch(chromiumLaunchOptions());
  try {
    const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.setContent('<div id="root"></div>');await page.addScriptTag({content:bundle.outputFiles[0].text});
    await page.waitForFunction(()=>window.log.length===1);
    const baseline=await page.evaluate(()=>window.rootRenders);
    await page.getByText('Orders',{exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('main').dataset.route==='orders');
    assert.equal(await page.evaluate(()=>window.rootRenders),baseline);
    await page.getByText('Orders',{exact:true}).click();
    assert.deepEqual(await page.evaluate(()=>window.log),['open:a:home','close:a:home','open:a:orders']);
    await page.getByText('Next',{exact:true}).click();
    assert.equal(await page.locator('main').getAttribute('data-route'),'customers');
    assert.equal(await page.evaluate(()=>window.rootRenders),baseline);
    await page.getByText('Switch scope',{exact:true}).click();
    await page.waitForFunction(()=>window.log.at(-1)==='open:b:customers');
    await page.evaluate(()=>window.stop());
    assert.deepEqual(await page.evaluate(()=>window.log),['open:a:home','close:a:home','open:a:orders','close:a:orders',
      'open:a:customers','close:a:customers','open:b:customers','close:b:customers']);
    assert.deepEqual(errors,[]);
  } finally {await browser.close();}
});

test('App uses the independent shell store and route effects without root activeTab state', async () => {
  const source=await readFile('src/App.jsx','utf8');
  const ast=parse(source,{sourceType:'module',plugins:['jsx']});
  const root=ast.program.body.find(node=>node.type==='ExportDefaultDeclaration').declaration;
  const declarations=root.body.body.filter(node=>node.type==='VariableDeclaration').flatMap(node=>node.declarations);
  assert(!declarations.some(node=>node.id.type==='ArrayPattern'&&node.id.elements[0]?.name==='activeTab'));
  const effects=root.body.body.filter(node=>node.type==='ExpressionStatement'&&node.expression.callee?.name==='useModuleNavigationEffect');
  assert.equal(effects.length,6,'startup, persistence, foreground sources, loyalty fetch/scan and backup keep their route lifecycle');
  assert(source.includes('moduleNavigation={moduleNavigation}'));
});
