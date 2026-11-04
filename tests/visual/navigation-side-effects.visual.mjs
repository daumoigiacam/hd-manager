import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import { parse } from '@babel/parser';
import { build } from 'esbuild';
import { chromium } from 'playwright-core';
import { chromiumLaunchOptions } from '../helpers/chromium-launch-options.mjs';

const output = process.env.HD_NAV_SIDE_EFFECTS_OUTPUT || 'test-results/navigation-side-effects-ui';
await fs.mkdir(output, { recursive: true });
const source = await fs.readFile('src/App.jsx', 'utf8');
const tree = parse(source, { sourceType: 'module', plugins: ['jsx'] });
const node = tree.program.body.find(item => item.type === 'FunctionDeclaration' && item.id?.name === 'DesktopSidebarGroups');
assert(node, 'Exercise the actual extracted React subtree');
const bundled = await build({ stdin: { resolveDir: process.cwd(), loader: 'jsx', contents: `
import React,{useState,useEffect,useRef,useMemo} from 'react';
import {createRoot} from 'react-dom/client';
import {useWideNavigation} from './src/layout/navigationViewport.js';
window.parentRenders=0;window.writes=[];
const APP_NAV_ITEM_MAP=Object.fromEntries(['home','orders','customers','more'].map(id=>[id,{id,label:id}]));
const runNonBlockingStateUpdate=fn=>fn();
const persistFooterUsageLater=(key,usage)=>{let cancelled=false;setTimeout(()=>{if(!cancelled)window.writes.push({key,usage})},20);return()=>{cancelled=true}};
const HDNavigationRail=({children})=><div data-rail>{children}</div>;
const HDSidebar=({children})=><div data-sidebar>{children}</div>;
const ChevronRight=()=>null,ChevronLeft=()=>null;
function NavButton({label,onClick,active}){return <button aria-pressed={active} onClick={onClick}>{label}</button>}
${source.slice(node.start, node.end)}
const permissions={home:true,orders:true,customers:true};
function App(){window.parentRenders++;const [activeTab,setActiveTab]=useState('home'),[actor,setActor]=useState('a');window.changeActor=setActor;window.changeRoute=setActiveTab;
return <><input aria-label="Draft"/><DesktopSidebarGroups key={actor} footerUsageKey={'fixture:'+actor} activeTab={activeTab} setActiveTab={setActiveTab}
 isOwnerAccount tabPermissions={permissions} employeeMessageUnreadCount={0}/><div data-active={activeTab}/></>}
createRoot(document.getElementById('root')).render(<App/>);
` }, bundle: true, write: false, minify: true, define: { 'process.env.NODE_ENV': '"production"' } });
const server = http.createServer((req, res) => {
  res.setHeader('Content-Type', req.url === '/app.js' ? 'text/javascript' : 'text/html');
  res.end(req.url === '/app.js' ? bundled.outputFiles[0].contents : '<div id="root"></div><script src="/app.js"></script>');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch(chromiumLaunchOptions());
const page = await browser.newPage(), errors = [], checks = [];
page.on('pageerror', error => errors.push(error.message));
try {
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.locator('[data-sidebar]').getByRole('button', { name: 'orders', exact: true }).waitFor();
  await page.waitForFunction(() => window.writes.length > 0);
  assert.equal(await page.evaluate(() => window.parentRenders), 1);
  checks.push('usage hydration and initial count never rerender the parent module');
  await page.getByRole('textbox', { name: 'Draft' }).fill('unsaved');
  await page.locator('[data-sidebar]').getByRole('button', { name: 'orders', exact: true }).click();
  await page.waitForFunction(() => window.writes.some(write => write.usage.orders === 1));
  assert.equal(await page.evaluate(() => window.parentRenders), 2, 'only the actual route update renders parent');
  assert.equal(await page.getByRole('textbox', { name: 'Draft' }).inputValue(), 'unsaved');
  assert.equal(await page.locator('[data-sidebar]').getByRole('button', { name: 'orders', exact: true }).getAttribute('aria-pressed'), 'true');
  checks.push('count persistence adds no parent render; active route and unsaved input remain correct');
  await page.evaluate(() => window.changeActor('b'));
  await page.waitForFunction(() => window.writes.some(write => write.key === 'fixture:b'));
  const b = await page.evaluate(() => window.writes.filter(write => write.key === 'fixture:b').at(-1));
  assert.deepEqual(b.usage, { orders: 1 });
  assert.equal(await page.locator('[data-sidebar] .hd-sidebar-groups button').count(), 3, 'only permission-allowed modules are rendered');
  checks.push('account-scoped counters do not leak across users and permissions stay enforced');
  const beforeResize=await page.evaluate(()=>window.parentRenders);
  await page.setViewportSize({width:767,height:800});
  await page.waitForFunction(()=>!document.querySelector('[data-sidebar]')&&!document.querySelector('[data-rail]'));
  assert.equal(await page.evaluate(()=>window.parentRenders),beforeResize,'media changes update only navigation');
  await page.evaluate(()=>window.changeRoute('customers'));
  await page.waitForFunction(()=>window.writes.some(write=>write.key==='fixture:b'&&write.usage.customers===1));
  await page.setViewportSize({width:768,height:800});
  await page.locator('[data-sidebar]').getByRole('button',{name:'customers',exact:true}).waitFor();
  assert.equal(await page.locator('[data-sidebar]').getByRole('button',{name:'customers',exact:true}).getAttribute('aria-pressed'),'true');
  assert.equal(await page.getByRole('textbox',{name:'Draft'}).inputValue(),'unsaved');
  checks.push('phone skips hidden menu/SVG construction; usage tracking, active route, draft and768px navigation restoration remain correct');
  assert.deepEqual(errors, []);
} finally {
  await fs.writeFile(output + '/result.json', JSON.stringify({ checks, errors, scope: 'Actual production React navigation subtree with synthetic preferences. Not Android latency or Firebase authentication.' }, null, 2));
  await browser.close(); await new Promise(resolve => server.close(resolve));
}
console.log(JSON.stringify({ checks: checks.length, errors }));
