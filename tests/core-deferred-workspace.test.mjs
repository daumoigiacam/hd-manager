import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parse } from '@babel/parser';
import traverseModule from '@babel/traverse';
import { build } from 'esbuild';
import { chromium } from 'playwright-core';
import { chromiumLaunchOptions } from './helpers/chromium-launch-options.mjs';

test('extracted workspace receives exactly its declared local bindings, with direct imports and unchanged component identity',async()=>{
  const manifest=JSON.parse(await readFile('src/features/legacy/view-manifest.json','utf8'));
  const root=parse(await readFile('src/App.jsx','utf8'),{sourceType:'module',plugins:['jsx']});
  const traverse=traverseModule.default||traverseModule;
  for(const view of manifest.views){
    const source=parse(await readFile(view.file,'utf8'),{sourceType:'module',plugins:['jsx']});
    let factory,component,destructured;
    traverse(source,{FunctionDeclaration(p){if(p.node.id?.name===view.factory)factory=p;if(p.node.id?.name===view.name)component=p;},
      VariableDeclarator(p){if(p.node.id.type==='ObjectPattern'&&p.node.init?.name==='runtime')destructured=p.node.id.properties.map(property=>property.key.name).sort();}});
    assert(factory&&component);assert.deepEqual(destructured,view.runtimeBindings);
    const supplied=[];
    traverse(root,{CallExpression(p){if(p.node.callee.name===view.factory){const object=p.node.arguments[0]?.arguments?.[0];assert.equal(object?.type,'ObjectExpression');supplied.push(...object.properties.map(property=>property.key.name))}}});
    assert.deepEqual(supplied.sort(),view.runtimeBindings);
    const missing=[];
    component.traverse({ReferencedIdentifier(p){if(!p.scope.getBinding(p.node.name)&&!view.browserGlobals.includes(p.node.name))missing.push(p.node.name)}});
    assert.deepEqual(missing,[],'no invisible App closure dependency may become undefined in the split bundle');
  }
});

test('deferred workspace deduplicates loading, retries explicitly, preserves draft focus, and never shows a previous module while loading another', {timeout:30000},async()=>{
  const bundle=await build({stdin:{resolveDir:process.cwd(),loader:'jsx',contents:`
    import React,{useState}from'react';import{createRoot}from'react-dom/client';
    import PreloadedWorkspace from'./src/layout/PreloadedWorkspace.jsx';import{createPreloadableModule}from'./src/utils/preloadableModule.js';
    window.calls=0;window.fail=true;window.resolveOther=null;
    function View({count}){const[value,setValue]=useState('');return <><p>Loaded {count}</p><input aria-label="Draft" value={value} onChange={event=>setValue(event.target.value)}/></>}
    const first=createPreloadableModule(async()=>{window.calls++;if(window.fail)throw Error('Synthetic chunk failure');return{default:View}});
    const other=createPreloadableModule(()=>new Promise(resolve=>{window.resolveOther=()=>resolve({default:()=> <p>Other workspace</p>})}));
    function Fixture(){const[module,setModule]=useState(first),[count,setCount]=useState(0);window.bump=()=>setCount(value=>value+1);return <>
      <button onClick={()=>setCount(value=>value+1)}>Update parent</button><button onClick={()=>setModule(other)}>Other</button>
      <PreloadedWorkspace module={module} viewProps={{count}} label="danh sách thử"/></>}
    createRoot(document.getElementById('root')).render(<React.StrictMode><Fixture/></React.StrictMode>);
  `},bundle:true,write:false,format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"development"'}});
  const browser=await chromium.launch(chromiumLaunchOptions());
  try{
    const page=await browser.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.setContent('<div id="root"></div>');await page.addScriptTag({content:bundle.outputFiles[0].text});
    await page.getByRole('alert').waitFor();assert.equal(await page.evaluate(()=>window.calls),1);
    const origin=await page.evaluate(()=>performance.timeOrigin);await page.evaluate(()=>{window.fail=false});
    await page.getByText('Thử lại',{exact:true}).click();await page.getByLabel('Draft').fill('unsaved');
    await page.getByLabel('Draft').focus();await page.evaluate(()=>window.bump());
    assert.equal(await page.evaluate(()=>document.activeElement===document.querySelector('input[aria-label="Draft"]')),true);
    await page.getByText('Update parent',{exact:true}).click();
    assert.equal(await page.getByLabel('Draft').inputValue(),'unsaved');assert.equal(await page.evaluate(()=>window.calls),2);
    assert.equal(await page.evaluate(()=>performance.timeOrigin),origin);
    await page.getByText('Other',{exact:true}).click();await page.getByRole('status').waitFor();
    assert.equal(await page.getByLabel('Draft').count(),0);
    await page.waitForFunction(()=>typeof window.resolveOther==='function');await page.evaluate(()=>window.resolveOther());
    await page.getByText('Other workspace',{exact:true}).waitFor();assert.deepEqual(errors,[]);
  }finally{await browser.close()}
});
