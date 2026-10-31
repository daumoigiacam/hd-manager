import {chromiumLaunchOptions} from './helpers/chromium-launch-options.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from 'playwright-core';
import { appObject } from './helpers/app-source-function.mjs';

test('closed notification list queues no expansion; reopening still exposes every item', { timeout: 30000 }, async () => {
  const caller = appObject('visibleNotificationItemsForDialog');
  assert.equal(caller.callee.name, 'useChunkedList');
  assert.equal(caller.arguments[4].name, 'showNotificationCenter');
  const bundle = await build({ stdin: { resolveDir: process.cwd(), loader: 'jsx', contents: `
    import React,{useEffect} from 'react';
    import {createRoot} from 'react-dom/client';
    import {useChunkedList} from './src/services/renderOptimization.js';
    const root=createRoot(document.getElementById('root'));
    const rows=Array.from({length:315},(_,id)=>({id}));
    window.jobs=new Map();let seq=0;
    window.requestIdleCallback=fn=>{window.jobs.set(++seq,fn);return seq};
    window.cancelIdleCallback=id=>window.jobs.delete(id);
    window.commits=0;
    function List({enabled,mark}){
      const list=useChunkedList(rows,60,80,'fixture',enabled);
      useEffect(()=>{window.commits++;window.mark=mark;window.visible=list.map(x=>x.id)});
      return <div>{list.length}</div>;
    }
    window.render=(enabled,mark)=>root.render(<List {...{enabled,mark}}/>);
    window.step=()=>{const callbacks=[...window.jobs.values()];window.jobs.clear();callbacks.forEach(fn=>fn({timeRemaining:()=>10}))};
  ` }, bundle: true, write: false, format: 'iife', define: { 'process.env.NODE_ENV': '"production"' } });
  const browser = await chromium.launch(chromiumLaunchOptions());
  const page = await browser.newPage();
  try {
    await page.setContent('<div id="root"></div>');
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    const render = async (enabled, mark) => {
      await page.evaluate(args => window.render(...args), [enabled,mark]);
      await page.waitForFunction(m => window.mark === m, mark);
    };
    await render(false,1);
    assert.deepEqual(await page.evaluate(()=>window.visible), []);
    assert.equal(await page.evaluate(()=>window.jobs.size), 0);
    await render(true,2);
    await page.waitForFunction(()=>window.visible.length===60);
    assert.equal(await page.evaluate(()=>window.jobs.size),1);
    // Closing cancels the in-flight expansion, including a callback already
    // delivered by the browser but not yet run by its host scheduler.
    await page.evaluate(()=>{window.cancelledJob=[...window.jobs.values()][0]});
    await render(false,3);
    assert.equal(await page.evaluate(()=>window.jobs.size),0);
    const commits = await page.evaluate(()=>window.commits);
    await page.evaluate(()=>window.cancelledJob());
    await page.waitForTimeout(40);
    assert.equal(await page.evaluate(()=>window.commits),commits);
    assert.deepEqual(await page.evaluate(()=>window.visible),[]);
    await render(true,4);
    await page.waitForFunction(()=>window.visible.length===60);
    for (const expected of [140,220,300,315]) {
      await page.evaluate(()=>window.step());
      await page.waitForFunction(n=>window.visible.length===n, expected);
    }
    assert.deepEqual(await page.evaluate(()=>window.visible),Array.from({length:315},(_,i)=>i));
    assert.equal(await page.evaluate(()=>window.jobs.size),0);
  } finally { await browser.close(); }
});
