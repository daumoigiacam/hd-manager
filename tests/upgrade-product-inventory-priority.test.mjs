import test from'node:test';import assert from'node:assert/strict';import{build}from'esbuild';import{chromium}from'playwright-core';import{chromiumLaunchOptions}from'./helpers/chromium-launch-options.mjs';
test('actual product view remains usable while optional inventory is pending; inventory tab remains explicitly pending',async()=>{
 const bundle=await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import{createProductManagementView}from'./src/features/legacy/ProductManagementView.jsx';
 const empty={productRows:[]};
 const runtime={EMPTY_CATALOG_INVENTORY:empty,EMPTY_PRODUCT_SEARCH_STORE:{subscribe:()=>()=>{},getSnapshot:()=>''},
 buildInventoryMetrics:function*(){while(true)yield;},productCatalogMetricsCache:()=>({complete:false}),
 formatCurrency:String,formatInputCurrency:String,formatNumber:String,getProductAttributes:()=>[],getProductShortName:p=>p.name,getProductInventoryUnit:()=> 'Kg',getTodayString:()=> '2026-11-03',
 normalizeProductGroups:x=>x,normalizeLookupText:x=>String(x).toLowerCase(),normalizeLeadingLabel:String,toTitleCase:String,
 ConfirmDialog:()=>null};
 const View=createProductManagementView(runtime);const root=createRoot(document.getElementById('root'));window.cleanup=()=>root.unmount();
 root.render(<View products={[{id:'fictional',name:'Synthetic Product',unit:'Kg',sellingPrice:100}]} currentCompany={{id:'fictional'}}/>);`,resolveDir:process.cwd(),loader:'jsx'},bundle:true,write:false,jsx:'automatic',format:'iife',platform:'browser',define:{'process.env.NODE_ENV':'"production"'}});
 const browser=await chromium.launch(chromiumLaunchOptions());try{const page=await browser.newPage();page.setDefaultTimeout(5000);const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.setContent('<div id="root"></div>');await page.addScriptTag({content:bundle.outputFiles[0].text});
 await page.getByRole('tab',{name:'Sản phẩm',exact:true}).waitFor();assert.equal(await page.locator('.premium-products-module').getAttribute('aria-busy'),'false');assert.equal(await page.getByText('Đang đối chiếu số lượng và giá trị tồn kho…').count(),0);
 assert.equal(await page.locator('.hd-product-list__name').innerText(),'Synthetic Product');assert.equal(await page.locator('.hd-product-list').getAttribute('data-hd-search-committed-query'),'');
 await page.getByRole('tab',{name:'Tồn kho',exact:true}).click();assert.equal(await page.locator('.premium-products-module').getAttribute('aria-busy'),'true');await page.getByText('Đang đối chiếu số lượng và giá trị tồn kho…').waitFor();assert.equal(await page.locator('.hd-product-list__inventory').count(),0);assert.equal(await page.locator('.hd-product-list').getAttribute('data-hd-search-committed-query'),null);
 await page.evaluate(()=>window.cleanup());assert.deepEqual(errors,[]);
 }finally{await browser.close()}
});
