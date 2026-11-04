import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { chromiumLaunchOptions } from './helpers/chromium-launch-options.mjs';
import { createDetachedEditorCleanup, needsDetachedEditorCleanup, installDetachedEditorCleanup } from '../src/services/detachedEditorCleanup.js';

test('discarded editor trees release links without changing field values or connected UI', async () => {
 const browser=await chromium.launch(chromiumLaunchOptions());try{const page=await browser.newPage();
 await page.setContent('<main><section><input value="keep draft"><span>row</span></section></main>');
 await page.addScriptTag({content:createDetachedEditorCleanup.toString()});
 const result=await page.evaluate(()=>{
  const pending = [], root = document.querySelector('main'), field = document.querySelector('input'), section = document.querySelector('section');
  const cleanup = createDetachedEditorCleanup({ schedule: fn => { pending.push(fn); return pending.length; }, now: () => 0, maxOperations: 2 });
  cleanup.enqueue(root); const connectedScheduled=pending.length;
  section.remove(); cleanup.enqueue(section);
  const before=section.childNodes.length;
  while (pending.length) pending.shift()();
  const result={connectedScheduled,before,after:section.childNodes.length,value:field.value,rootKept:document.querySelector('main')===root};cleanup.dispose();return result;
 });assert.deepEqual(result,{connectedScheduled:0,before:2,after:0,value:'keep draft',rootKept:true});}finally{await browser.close()}
});

test('reattached trees and non-editor trees are not destroyed; cancellation releases queued roots', async () => {
 const browser=await chromium.launch(chromiumLaunchOptions());try{const page=await browser.newPage();await page.setContent('<main></main>');await page.addScriptTag({content:createDetachedEditorCleanup.toString()});
 const result=await page.evaluate(()=>{const pending = [];
  const cleanup = createDetachedEditorCleanup({ schedule: fn => { pending.push(fn); return 1; }, cancel: () => pending.length = 0, now: () => 0 });
  const node = document.createElement('section'); node.innerHTML = '<input value="saved">';
  cleanup.enqueue(node); document.querySelector('main').append(node); pending.shift()();
  const reattachedValue=node.firstChild.value;
  const ordinary = document.createElement('div'); ordinary.textContent = 'text'; cleanup.enqueue(ordinary); const ordinaryScheduled=pending.length;
  node.remove(); cleanup.enqueue(node); cleanup.dispose();return{reattachedValue,ordinaryScheduled,cancelled:pending.length===0,value:node.firstChild.value};
 });assert.deepEqual(result,{reattachedValue:'saved',ordinaryScheduled:0,cancelled:true,value:'saved'});}finally{await browser.close()}
});

test('compatibility hook is limited to proven Chromium 74 and disconnects its observer', () => {
  assert.equal(needsDetachedEditorCleanup('Android Chrome/74.0.3729.185'), true);
  for (const ua of ['Android Chrome/130.0', 'iPhone Safari/605', 'Windows Chrome/74.0']) assert.equal(needsDetachedEditorCleanup(ua), false);
  let observed = false, disconnected = false;
  class Observer { observe() { observed = true; } disconnect() { disconnected = true; } }
  const stop = installDetachedEditorCleanup({}, { userAgent: 'Android Chrome/74.0', Observer });
  assert.equal(observed, true); stop(); assert.equal(disconnected, true);
});
