import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {chromiumLaunchOptions} from './helpers/chromium-launch-options.mjs';
import {armEventHomeStartupClock} from '../scripts/helpers/event-home-startup-clock.mjs';
test('event-driven clock requires trusted intent, visible usable Home and independently confirmed data, then cleans up',async()=>{
 const browser=await chromium.launch(chromiumLaunchOptions());
 try{
  const page=await browser.newPage();await page.setContent('<button id="login">Login</button>');
  await page.evaluate(()=>{
   window.fresh=false;window.__hdPlans={};window.__hdSourceContract=()=>({sourcesReady:window.fresh});window.__hdModulePending=main=>main.getAttribute('aria-busy')==='true';
   document.querySelector('#login').onclick=event=>{if(!event.isTrusted)return;
    const main=document.createElement('main');main.setAttribute('data-hd-module','home');main.setAttribute('aria-busy','true');main.textContent='Synthetic shell';document.body.append(main);
    const nav=document.createElement('nav');nav.className='hd-bottom-navigation';nav.innerHTML='<button>Home</button><button>Orders</button>';document.body.append(nav);
   };
  });
  await page.addScriptTag({content:armEventHomeStartupClock.toString()+';armEventHomeStartupClock("#login")'});
  await page.evaluate(()=>document.querySelector('#login').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true})));
  assert.equal(await page.evaluate(()=>window.__upgradeEventHomeClock.startedAt),null);
  await page.locator('#login').click();await page.waitForFunction(()=>Number.isFinite(window.__upgradeEventHomeClock.uiMs));
  assert.equal(await page.evaluate(()=>window.__upgradeEventHomeClock.dataMs),null);
  await page.evaluate(()=>{window.fresh=true;document.querySelector('main').setAttribute('data-hd-home-read-model-ready','true')});
  await page.waitForTimeout(50);assert.equal(await page.evaluate(()=>window.__upgradeEventHomeClock.dataMs),null,'busy computation cannot be reported ready');
  await page.evaluate(()=>document.querySelector('main').setAttribute('aria-busy','false'));await page.waitForFunction(()=>Number.isFinite(window.__upgradeEventHomeClock.dataMs));
  await page.waitForFunction(()=>window.__upgradeEventHomeClock.stopped===true);
  const recorded=await page.evaluate(()=>({...window.__upgradeEventHomeClock}));assert(recorded.dataMs>=recorded.uiMs);assert(recorded.uiMs>0);
  await page.waitForTimeout(150);assert.equal(await page.evaluate(()=>window.__upgradeEventHomeClock.checks),recorded.checks,'observer/fallback retire after both witnesses');
  await page.evaluate(()=>{armEventHomeStartupClock('#login');window.__upgradeEventHomeStop()});await page.locator('#login').click();
  assert.equal(await page.evaluate(()=>window.__upgradeEventHomeClock.startedAt),null,'explicit cleanup retires trusted listener');
 }finally{await browser.close()}
});
