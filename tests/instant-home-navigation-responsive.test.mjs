import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {build} from 'esbuild';
import {chromium} from 'playwright-core';

// Exercise the real navigation component against the shell's real responsive
// styles. No accounts, API transport, business records or Production requests.
test('Instant Home footer respects the existing mobile/desktop navigation lanes',async()=>{
 const root=process.cwd(),app=path.join(root,'development/hd-manager/application');
 const css=(await Promise.all(['src/index.css','src/design-system/foundation.css','src/layout/instant-home.css'].map(f=>fs.readFile(path.join(app,f),'utf8')))).join('\n');
 const bundle=await build({absWorkingDir:root,stdin:{resolveDir:root,loader:'jsx',contents:`import React from 'react';import{createRoot}from'react-dom/client';import{InstantHomeNavigation}from ${JSON.stringify(path.join(app,'src/layout/InstantHome.jsx'))};createRoot(document.getElementById('root')).render(<div className="mobile-app-shell hd-enterprise-app-shell hd-app-shell hd-shell--staff"><main>Workspace</main><nav className="hd-enterprise-navigation hd-app-navigation"><InstantHomeNavigation className="mobile-footer-nav" onNavigate={()=>{}} onModules={()=>{}} onQuickCreate={()=>{}} onReport={()=>{}} onProfile={()=>{}}/><div className="hd-sidebar-navigation desktop-sidebar-nav"><button>Desktop module</button></div></nav></div>);`},bundle:true,jsx:'automatic',write:false,format:'iife',platform:'browser',loader:{'.css':'empty'},define:{'import.meta.env':'{}'},logLevel:'silent'});
 const browser=await chromium.launch({executablePath:process.env.HD_TEST_CHROME||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 try{
  for(const viewport of [{width:1280,height:850},{width:393,height:851}]){
   const page=await browser.newPage({viewport});await page.route('**/*',route=>route.abort());
   await page.setContent('<!doctype html><html><head></head><body><div id="root"></div></body></html>');await page.addStyleTag({content:css});await page.addScriptTag({content:bundle.outputFiles[0].text});
   const footer=page.locator('.hd-instant-nav');await footer.waitFor({state:'attached'});
   if(viewport.width>=1024){assert.equal(await footer.isVisible(),false,'Mobile footer must not appear above the desktop sidebar');assert.equal(await page.getByRole('button',{name:'Desktop module',exact:true}).isVisible(),true);}
   else{assert.equal(await footer.isVisible(),true);assert.equal(await footer.getByRole('button').count(),5);assert.equal(await page.getByRole('button',{name:'Desktop module',exact:true}).isVisible(),false);const bounds=await footer.boundingBox();assert(bounds.x>=-1&&bounds.x+bounds.width<=viewport.width+1,'Footer fits the phone viewport');}
   await page.close();
  }
 }finally{await browser.close();}
});
