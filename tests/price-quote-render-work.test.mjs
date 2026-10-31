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
    import {createRoot} from 'react-dom/client';
    import {Search,X,Loader2,CheckCircle,Send} from 'lucide-react';
    const getSalesDownlineEmployeeIds=()=>[];
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
    const products=[{id:'p1',name:'Fixture product',unit:'Kg'},{id:'p2',name:'Another product',unit:'Con'}];
    const customers=[
      {id:'other',name:'Outside scope',empId:'other',customerProductIds:['p1']},
      {id:'archived',name:'Archived',empId:'sales',isArchived:true,customerProductIds:['p1']},
      {id:'allowed',name:'Allowed customer',empId:'sales',customerProductIds:['p1'],priceOverrides:{p1:{price:100,size:'old'}}},
      {id:'allowed2',name:'Second customer',empId:'sales',customerProductIds:['p2']}
    ];
    createRoot(document.getElementById('root')).render(<PriceQuoteBroadcastView
      employee={{id:'sales'}} employees={[]} customers={customers} products={products}
      orders={forbidden} payments={forbidden}
      onEditCustomer={async(id,patch)=>{window.saved.push({id,patch});return {success:true}}}
    />);
  ` }, bundle: true, write: false, format: 'iife', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' } });
  const browser = await chromium.launch(chromiumLaunchOptions());
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setContent('<div id="root"></div>');
    await page.addScriptTag({ content: output.outputFiles[0].text });
    await page.getByRole('button', { name: 'Chọn tất cả', exact: true }).waitFor();
    assert.equal(await page.getByText('Outside scope', { exact: true }).count(), 0);
    assert.equal(await page.getByText('Archived', { exact: true }).count(), 0);
    assert.equal(await page.getByText('Allowed customer', { exact: true }).count(), 1);
    assert.equal(await page.getByText('Second customer', { exact: true }).count(), 0);
    assert.equal(await page.locator('textarea').count(), 0, 'hidden preview must not mount');
    const search = page.getByPlaceholder('2. Tìm và tick nhiều khách hàng');
    await search.fill('Allowed');
    await search.fill('');
    assert.deepEqual(await page.evaluate(() => window.saved), [], 'opening/searching does not write prices');
    await page.getByRole('button', { name: 'Chọn tất cả', exact: true }).click();
    await page.getByPlaceholder('VD: 68.000').fill('68000');
    await page.getByRole('button', { name: 'Áp dụng giá mới', exact: true }).click();
    await page.waitForFunction(() => window.saved.length === 1);
    await page.getByRole('status').filter({ hasText: 'Đã áp giá' }).waitFor();
    const writes = await page.evaluate(() => window.saved);
    assert.equal(writes[0].id, 'allowed');
    assert.equal(writes[0].patch.priceOverrides.p1.price, 68000);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
