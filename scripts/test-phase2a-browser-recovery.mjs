import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { fullAuditFixture, key } from '../tests/helpers/preview-storage-harness.mjs';

const server = await createServer({ configFile:false, optimizeDeps:{noDiscovery:true,include:[]},
  server:{host:'127.0.0.1',port:0,watch:null}, logLevel:'silent' });
await server.listen();
const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
let browser;
const results = [];
try {
  browser = await chromium.launch({headless:true,executablePath:process.env.HD_MANAGER_VISUAL_QA_BROWSER_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  for (const source of ['/test-results/phase2a-baseline/firebase-firestore.js','/src/mocks/firebase-firestore.js']) {
    const context = await browser.newContext();
    const page = await context.newPage();
    const errors = [];
    page.setDefaultTimeout(30000);
    console.log(`Recovery source: ${source}`);
    page.on('pageerror',e => errors.push(e.message));
    await context.route('**/*',route => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) return route.abort();
      if (url.pathname === '/__phase2a_blank') return route.fulfill({contentType:'text/html',body:'<!doctype html><title>Isolated storage recovery</title>'});
      return route.continue();
    });
    await page.goto(`${origin}/__phase2a_blank`);
    console.log('Isolated page loaded');
    await page.evaluate(({fixture,key}) => localStorage.setItem(key,JSON.stringify(fixture)),{fixture:await fullAuditFixture(),key});
    const first = await page.evaluate(async ({source,key}) => {
      let timeout;
      const api = await Promise.race([import(source),new Promise((_,reject) => {
        timeout = setTimeout(() => reject(new Error('Storage recovery import timed out')),30000);
      })]).finally(() => clearTimeout(timeout));
      const ref = (c,id) => api.doc(null,c,id);
      for (const c of ['orderRequests','products','customers','warehouseDispatches','payments']) {
        await api.setDoc(ref(c,'recovery_case'),{companyId:'comp_preview',quantity:5,unit:'kg',amount:500});
        await api.setDoc(ref(c,'recovery_case'),{quantity:7,amount:700},{merge:true});
      }
      await api.runTransaction(null,async tx => {
        tx.set(ref('warehouseImports','recovery_case'),{companyId:'comp_preview',quantity:7});
        tx.set(ref('expenses','recovery_case'),{companyId:'comp_preview',amount:700});
      });
      const durable = localStorage.getItem(key);
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function (k,v) {
        if (k === key) throw new DOMException('simulated full storage','QuotaExceededError');
        return original.call(this,k,v);
      };
      let rejected = false;
      try { await api.setDoc(ref('products','quota_case'),{quantity:9}); }
      catch (e) { rejected = e.name === 'QuotaExceededError'; }
      finally { Storage.prototype.setItem = original; }
      if (!rejected || localStorage.getItem(key) !== durable) throw new Error('Failure durability changed');
      await api.setDoc(ref('products','quota_case'),{quantity:9});
      const beforeInterrupted = localStorage.getItem(key);
      try {
        await api.runTransaction(null,async tx => {
          tx.set(ref('payments','interrupted'),{amount:1});
          throw new Error('interrupted');
        });
      } catch (e) { if (e.message !== 'interrupted') throw e; }
      if (localStorage.getItem(key) !== beforeInterrupted) throw new Error('Partial interrupted snapshot persisted');
      return {quotaRejected:rejected,bytes:new TextEncoder().encode(localStorage.getItem(key)).length};
    },{source,key});
    await page.reload();
    const recovered = await page.evaluate(async ({source,key}) => {
      const api = await import(source);
      const values = {};
      for (const c of ['orderRequests','products','customers','warehouseDispatches','payments','warehouseImports','expenses']) {
        values[c] = (await api.getDoc(api.doc(null,c,'recovery_case'))).data();
      }
      if ((await api.getDoc(api.doc(null,'payments','interrupted'))).exists()) throw new Error('Interrupted disk data recovered');
      const quota = (await api.getDoc(api.doc(null,'products','quota_case'))).data();
      const raw = JSON.parse(localStorage.getItem(key));
      return {values,quota,requestCount:Object.keys(raw.orderRequests).length,dispatchCount:Object.keys(raw.warehouseDispatches).length};
    },{source,key});
    assert.equal(recovered.quota.quantity,9);
    assert.equal(recovered.requestCount,4501);
    assert.equal(recovered.dispatchCount,4301);
    for (const c of ['orderRequests','products','customers','warehouseDispatches','payments','warehouseImports']) assert.equal(recovered.values[c].quantity,7);
    assert.equal(recovered.values.expenses.amount,700);
    assert.deepEqual(errors,[]);
    results.push({source,...first,recovered,errors});
    await context.close();
  }
  assert.deepEqual(results[1].recovered,results[0].recovered);
  await mkdir('test-results/phase2a-storage',{recursive:true});
  await writeFile('test-results/phase2a-storage/browser-recovery.json',JSON.stringify(results,null,2));
  console.log('Browser localStorage quota, interrupted write, edit/create, linked import/expense and reload parity: PASS (full fixtures; no cloud/UI-business acceptance).');
} finally {
  await browser?.close();
  await server.close();
}
