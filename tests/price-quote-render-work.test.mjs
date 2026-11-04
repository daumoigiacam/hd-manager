import {chromiumLaunchOptions} from './helpers/chromium-launch-options.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse } from '@babel/parser';
import { build } from 'esbuild';
import { chromium } from 'playwright-core';

test('real quote component renders and searches without reading financial history or building hidden previews', { timeout: 30000 }, async () => {
  const source = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  const component = parse(source, { sourceType: 'module', plugins: ['jsx'] }).program.body
    .find(node => node.type === 'FunctionDeclaration' && node.id.name === 'PriceQuoteBroadcastView');
  const output = await build({ stdin: { resolveDir: process.cwd(), loader: 'jsx', contents: `
    import React,{useMemo,useState,useEffect,useRef} from 'react';
    import {usePagedList} from './src/services/renderOptimization.js';
    import {ListPagination} from './src/design-system/ListPagination.jsx';
    import SearchableProductPicker from './src/features/products/SearchableProductPicker.jsx';
    import {createRoot} from 'react-dom/client';
    import {Search,X,Loader2,CheckCircle,Send} from 'lucide-react';
    const getSalesDownlineEmployeeIds=()=>[];
    const compareVietnameseText=new Intl.Collator('vi').compare;
    const normalizeLookupText=value=>String(value||'').toLowerCase().trim();
    const normalizeCustomerPriceOverrides=customer=>customer.priceOverrides||{};
    const normalizeCustomerProductIds=(customer,products,valid=new Set(products.map(p=>p.id)))=>
      (customer.customerProductIds||[]).filter(id=>valid.has(id));
    const getCustomerProductConfig=(customer,product)=>customer.priceOverrides?.[product.id]||{};
    const parseLooseMoneyValue=value=>Number(String(value||'').replace(/[^0-9]/g,''))||0;
    const formatInputCurrency=value=>value;
    const formatCurrency=value=>String(value);
    const getFriendlyFirebaseErrorMessage=(error,fallback)=>error.message||fallback;
    const buildCustomerQuoteShareText=()=>{throw Error('Unexpected preview/ledger build before explicit sharing')};
    const shareTextContent=()=>{throw Error('Unexpected native share')};
    const requireServerAcknowledgements=async receipts=>{await Promise.all(receipts)};
    ${source.slice(component.start, component.end)}
    const forbidden=new Proxy([], {get(target,key){throw Error('Unexpected financial history read: '+String(key))}});
    window.saved=[];
    const products=[{id:'p1',name:'Fixture product',unit:'Kg'},{id:'p2',name:'Another product',unit:'Con'},...Array.from({length:998},(_,i)=>({id:'extra-'+i,name:'Synthetic product '+i,unit:'Kg'}))];
    const customers=[
      {id:'other',name:'Outside scope',empId:'other',customerProductIds:['p1']},
      {id:'archived',name:'Archived',empId:'sales',isArchived:true,customerProductIds:['p1']},
      {id:'allowed',name:'Allowed customer',empId:'sales',customerProductIds:['p1'],priceOverrides:{p1:{price:100,size:'old'}}},
      {id:'allowed2',name:'Second customer',empId:'sales',customerProductIds:['p2']},
      ...Array.from({length:25},(_,i)=>({id:'page-'+i,name:'Page customer '+String(i).padStart(2,'0'),empId:'sales',customerProductIds:['p1']}))
    ];
    createRoot(document.getElementById('root')).render(<PriceQuoteBroadcastView
      employee={{id:'sales'}} employees={[]} customers={customers} products={products}
      orders={forbidden} payments={forbidden}
      onEditCustomer={async(id,patch)=>{window.saved.push({id,patch});return {success:true}}}
    />);
  ` }, bundle: true, write: false, outfile:'quote-fixture.js',target:'chrome74', format: 'iife', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' } });
  const browser = await chromium.launch(chromiumLaunchOptions());
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setContent('<html class="hd-low-power-ui"><body><div id="root"></div></body></html>');
    for(const file of output.outputFiles.filter(f=>f.path.endsWith('.css')))await page.addStyleTag({content:file.text});
    await page.addScriptTag({ content: output.outputFiles.find(f=>f.path.endsWith('.js')).text });
    await page.getByRole('button', { name: 'Chọn tất cả', exact: true }).waitFor();
    assert.equal(await page.getByText('Outside scope', { exact: true }).count(), 0);
    assert.equal(await page.getByText('Archived', { exact: true }).count(), 0);
    assert.equal(await page.getByText('Allowed customer', { exact: true }).count(), 1);
    assert.equal(await page.getByText('Second customer', { exact: true }).count(), 0);
    assert.equal(await page.locator('textarea').count(), 0, 'hidden preview must not mount');
    assert.equal(await page.locator('select option').count(),2,'only the two pagination pages mount; the 1000-product picker stays closed');
    const picker=page.getByRole('combobox',{name:'Chọn sản phẩm báo giá',exact:true});
    await picker.click();await picker.fill('Synthetic');await page.getByRole('option').first().waitFor();
    assert.ok(await page.getByRole('option').count()<30,'large catalog mounts only virtual visible choices');
    await picker.fill('Another product');await page.getByRole('option',{name:/Another product/}).click();
    await page.getByText('Second customer',{exact:true}).waitFor();assert.equal(await page.getByText('Allowed customer',{exact:true}).count(),0);
    await picker.click();await picker.fill('Fixture product');await page.getByRole('option',{name:/Fixture product/}).click();
    await page.getByText('Allowed customer',{exact:true}).waitFor();
    const pagination=page.getByRole('navigation',{name:'Phân trang khách nhận báo giá'});
    await pagination.getByLabel('Chọn trang').selectOption('1');
    assert.equal(await page.getByText('Allowed customer',{exact:true}).count(),0);
    await page.getByRole('button').filter({hasText:'Page customer 15'}).click();
    const search = page.getByPlaceholder('2. Tìm và tick nhiều khách hàng');
    await search.fill('Page customer 24');
    assert.equal(await page.getByText('Page customer 24',{exact:true}).count(),1,'search includes rows outside the mounted page');
    await search.fill('Allowed');
    await search.fill('');
    assert.deepEqual(await page.evaluate(() => window.saved), [], 'opening/searching does not write prices');
    await page.getByRole('button', { name: 'Chọn tất cả', exact: true }).click();
    await page.getByPlaceholder('VD: 68.000').fill('68000');
    await page.getByRole('button', { name: 'Áp dụng giá mới', exact: true }).click();
    await page.waitForFunction(() => window.saved.length === 26);
    await page.getByRole('status').filter({ hasText: 'Đã áp giá' }).waitFor();
    const writes = await page.evaluate(() => window.saved);
    assert.equal(new Set(writes.map(x=>x.id)).size,26,'select all preserves the complete authorized list across pages');
    assert.ok(writes.every(x=>x.patch.priceOverrides.p1.price===68000));
    assert.equal(writes[0].id, 'allowed');
    assert.equal(writes[0].patch.priceOverrides.p1.price, 68000);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
