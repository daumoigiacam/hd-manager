import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {build} from 'esbuild';
import {parse} from '@babel/parser';
import postcss from 'postcss';
import tailwind from 'tailwindcss';
import {chromium,webkit} from 'playwright-core';

// Layout-only scenarios use the real navigation, shell, viewport installer and
// compiled production CSS. They do not simulate accounts, RBAC or business data.
test('Instant navigation fits visible viewport and actual 3/4/5-item layouts',async()=>{
 const root=process.cwd(),app=path.join(root,'development/hd-manager/application'),baseline=process.env.HD_FOOTER_BASELINE==='1';
 const read=async relative=>baseline?execFileSync('git',['show','f60a7eb3:development/hd-manager/application/'+relative],{encoding:'utf8',maxBuffer:5*1024*1024}):fs.readFile(path.join(app,relative),'utf8');
 const source=await read('src/main.jsx'),tree=parse(source,{sourceType:'module',plugins:['jsx']}),installer=tree.program.body.find(n=>n.type==='FunctionDeclaration'&&n.id.name==='installResponsiveViewportVars');
 const fixture=`import React from 'react';import{createRoot}from'react-dom/client';import{AppShell,HDNavigation}from ${JSON.stringify(path.join(app,'src/layout/AppShell.jsx'))};import{InstantHomeNavigation}from ${JSON.stringify(path.join(app,'src/layout/InstantHome.jsx'))};import{resolveStableViewport,resolveKeyboardViewport}from ${JSON.stringify(path.join(app,'src/utils/keyboardViewport.js'))};const Capacitor={isNativePlatform:()=>false,getPlatform:()=>'web'},registerPlugin=()=>({});${source.slice(installer.start,installer.end)};installResponsiveViewportVars();const reactRoot=createRoot(document.getElementById('root'));window.mountLayout=({kind,count,menu=false})=>{const [customer,staff]=[kind==='customer',kind==='staff'];const noop=()=>{};const nav=<InstantHomeNavigation className={staff?'mobile-footer-nav':''} onNavigate={noop} onModules={noop} onProfile={noop} onReport={count===5?noop:undefined} onQuickCreate={count>=4&&!menu?noop:undefined} quickActions={menu?[{id:'test-local-action',label:'Kiểm tra menu'}]:[]} onQuickAction={noop}/>;reactRoot.render(<AppShell data-hd-instant-shell={kind} className={customer?'customer-portal-shell hd-shell--customer min-h-screen':'mobile-app-shell hd-app-shell hd-shell--staff flex h-screen w-full flex-col overflow-hidden'}><main className={customer?'customer-portal-main hd-shell-content p-4':''}><h1>Kiểm tra bố cục</h1><input aria-label="Tìm kiếm"/><div style={{height:2200}}>Nội dung cuộn</div></main>{customer?<div className="customer-portal-nav fixed left-1/2 z-30 -translate-x-1/2 bg-white">{nav}</div>:<HDNavigation className="hd-app-navigation absolute bottom-0 left-0 right-0 bg-white">{nav}<div className="desktop-sidebar-nav">Sidebar</div></HDNavigation>}</AppShell>);};`;
 const plugins=baseline?[{name:'baseline-real-component',setup(b){b.onLoad({filter:/[\\/]layout[\\/]InstantHome\.jsx$/},async()=>({contents:await read('src/layout/InstantHome.jsx'),loader:'jsx',resolveDir:path.join(app,'src/layout')}));}}]:[];
 const bundled=await build({stdin:{contents:fixture,resolveDir:app,loader:'jsx'},bundle:true,jsx:'automatic',write:false,format:'iife',platform:'browser',loader:{'.css':'empty'},define:{'import.meta.env':'{}'},plugins,logLevel:'silent'});
 const styles=await Promise.all(['src/index.css','src/design-system/foundation.css','src/layout/instant-home.css',...baseline?[]:['src/layout/instant-navigation.css']].map(read));
 const config=createRequire(import.meta.url)(path.join(app,'tailwind.config.cjs'));const css=(await postcss([tailwind({...config,content:[{raw:fixture,extension:'jsx'}]})]).process(styles.join('\n'),{from:undefined})).css;
 const evidence=process.env.HD_FOOTER_EVIDENCE;const results=[];if(evidence)await fs.mkdir(evidence,{recursive:true});
 const engines=process.env.HD_FOOTER_WEBKIT==='1'?['chromium','webkit']:['chromium'];
 for(const engine of engines){
  const browser=await(engine==='webkit'?webkit:chromium).launch(engine==='chromium'?{executablePath:process.env.HD_TEST_CHROME||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true}:{headless:true});
  try{
   for(const kind of ['staff','customer'])for(const count of [3,4,5])for(const width of [320,393,430]){
    const context=await browser.newContext({viewport:{width,height:844},isMobile:true,hasTouch:true,userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1'}),page=await context.newPage();
    await page.route('**/*',r=>r.abort());await page.setContent('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body><div id="root"></div></body></html>');await page.addStyleTag({content:css});await page.addScriptTag({content:bundled.outputFiles[0].text});
    await page.evaluate(({kind,count})=>{document.documentElement.style.setProperty('--hd-safe-bottom','34px');window.mountLayout({kind,count});},{kind,count});await page.locator('.hd-instant-nav').waitFor();
    const measure=()=>page.evaluate(()=>{const n=document.querySelector('.hd-instant-nav'),r=n.getBoundingClientRect(),buttons=[...n.children].filter(x=>x.tagName==='BUTTON'),bounds=buttons.map(b=>{const r=b.getBoundingClientRect(),icon=b.querySelector('span').getBoundingClientRect(),label=b.querySelector('small').getBoundingClientRect();return{x:r.x,width:r.width,top:r.top,bottom:r.bottom,iconTop:icon.top,iconBottom:icon.bottom,labelTop:label.top,labelBottom:label.bottom,hit:document.elementFromPoint(icon.x+icon.width/2,icon.top+2)?.closest('button')===b};});return {footer:{x:r.x,y:r.y,width:r.width,bottom:r.bottom,paddingLeft:parseFloat(getComputedStyle(n).paddingLeft),paddingRight:parseFloat(getComputedStyle(n).paddingRight)},buttons:bounds,innerHeight:innerHeight,visibleHeight:visualViewport?.height||innerHeight,stableHeight:getComputedStyle(document.documentElement).getPropertyValue('--hd-viewport-height'),documentHeight:document.documentElement.scrollHeight,mainScrollable:document.querySelector('main').scrollHeight>document.querySelector('main').clientHeight};});
    const validate=(m,expectedCount=count)=>{const errors=[];if(m.footer.bottom>m.visibleHeight+1||m.footer.y<0)errors.push('footer outside visible viewport');if(Math.abs(m.footer.bottom-m.visibleHeight)>2)errors.push('footer not anchored to viewport bottom');if(m.buttons.length!==expectedCount)errors.push('wrong visible count');const cell=(m.footer.width-m.footer.paddingLeft-m.footer.paddingRight)/expectedCount;for(let i=0;i<m.buttons.length;i++){const b=m.buttons[i];if(Math.abs((b.x+b.width/2)-(m.footer.x+m.footer.paddingLeft+cell*(i+.5)))>2)errors.push('unequal item spacing');if(b.iconTop<m.footer.y||b.iconBottom>m.footer.bottom||!b.hit)errors.push('clipped or covered icon');if(Math.abs(b.labelBottom-m.buttons[0].labelBottom)>1)errors.push('misaligned labels');if(b.width<44||b.bottom-b.top<44)errors.push('touch target too small');}if(m.documentHeight>m.visibleHeight+2)errors.push('outer page scroll leaks');if(!m.mainScrollable)errors.push('main cannot scroll');return [...new Set(errors)];};
    for(const height of [844,660,744]){
     await page.setViewportSize({width,height});await page.waitForFunction(h=>Math.abs(visualViewport.height-h)<2,height);await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
     await page.locator('main').evaluate(n=>n.scrollTop=n.scrollHeight);const measurement=await measure(),errors=validate(measurement);results.push({engine,kind,count,width,height,measurement,errors});
     if(evidence&&height===660&&width===393)await page.screenshot({path:path.join(evidence,`${baseline?'before':'after'}-${engine}-${kind}-${count}.png`)});
    }
    if(!baseline){
     const row=results.filter(x=>x.engine===engine&&x.kind===kind&&x.count===count&&x.width===width);assert(row.every(x=>x.errors.length===0),JSON.stringify(row));
     // No phantom slots after a permission-dependent action disappears.
     await page.evaluate(({kind,count})=>window.mountLayout({kind,count}),{kind,count:3});await page.waitForFunction(()=>document.querySelector('.hd-instant-nav').style.getPropertyValue('--hd-footer-item-count')==='3');assert.deepEqual(validate(await measure(),3),[]);
     // Preserve the existing intentional keyboard hide, and restore on blur.
     await page.getByRole('textbox',{name:'Tìm kiếm'}).focus();await page.evaluate(()=>new Promise(r=>requestAnimationFrame(r)));assert.equal(await page.locator('.hd-instant-nav').isVisible(),true,'Focus alone must not hide the footer');await page.setViewportSize({width,height:440});await page.waitForFunction(()=>document.documentElement.classList.contains('hd-keyboard-open'));assert.equal(await page.locator('.hd-instant-nav').isVisible(),false);await page.setViewportSize({width,height:744});await page.waitForFunction(()=>!document.documentElement.classList.contains('hd-keyboard-open'));assert.deepEqual(validate(await measure(),3),[],'Footer returns when IME dismisses even if input stays focused');
     await page.getByRole('textbox',{name:'Tìm kiếm'}).blur();await page.waitForFunction(()=>!document.documentElement.classList.contains('hd-keyboard-open'));assert.deepEqual(validate(await measure(),3),[]);
     // The quick menu is an overlay, not an extra column; no business callback.
     await page.evaluate(kind=>window.mountLayout({kind,count:4,menu:true}),kind);await page.getByRole('button',{name:'Tạo nhanh',exact:true}).click();await page.getByRole('dialog',{name:'Tạo nhanh',exact:true}).waitFor({state:'visible'});assert.equal(await page.locator('.hd-instant-nav > button').count(),4);await page.getByRole('button',{name:'Đóng tạo nhanh'}).click();assert.equal(await page.getByRole('dialog',{name:'Tạo nhanh',exact:true}).count(),0);
    }
    await context.close();
   }
  }finally{await browser.close();}
 }
 if(evidence)await fs.writeFile(path.join(evidence,baseline?'before-layout.json':'after-layout.json'),JSON.stringify({scope:'Presentation scenarios only, not account/RBAC acceptance or physical iPhone validation',baseline,results},null,2));
 if(baseline)assert(results.some(x=>x.errors.includes('unequal item spacing'))&&results.some(x=>x.errors.includes('clipped or covered icon'))&&results.some(x=>x.errors.includes('footer outside visible viewport')),'Reproduce all three reported failures before claiming a fix');
});
