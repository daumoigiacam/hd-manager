import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {createRequire} from 'node:module';import {parse} from '@babel/parser';import {transformSync} from 'esbuild';
import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';
import {QUOTE_PRIMARY_COLLECTIONS,QUOTE_SHARE_COLLECTIONS,getQuoteWorkspaceReadCollections,admitQuoteShare} from '../src/services/quoteWorkspaceReadPlan.js';
const source=fs.readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
const declaration=parse(source,{sourceType:'module',plugins:['jsx']}).program.body.find(n=>n.type==='FunctionDeclaration'&&n.id?.name==='PriceQuoteBroadcastView');
const code=transformSync(source.slice(declaration.start,declaration.end),{loader:'jsx',format:'cjs',jsx:'automatic'}).code;
function fixture(props={}){
 const slots=[];let index=0;const state=initial=>{const at=index++;if(!(at in slots))slots[at]=typeof initial==='function'?initial():initial;return [slots[at],value=>{slots[at]=typeof value==='function'?value(slots[at]):value;}];};
 const env={React,useMemo:fn=>fn(),useState:state,useEffect:()=>{},useRef:initial=>state({current:initial})[0],
  getSalesDownlineEmployeeIds:()=>[],normalizeCustomerProductIds:c=>c.customerProductIds||[],compareVietnameseText:(a,b)=>a.localeCompare(b),normalizeLookupText:s=>String(s||'').toLowerCase(),
  usePagedList:rows=>({items:rows.slice(0,20)}),ListPagination:()=>null,SearchableProductPicker:()=>null,
  getCustomerProductConfig:(c,p)=>c.priceOverrides?.[p.id],normalizeCustomerPriceOverrides:c=>c.priceOverrides||{},
  parseLooseMoneyValue:v=>Number(String(v||'').replace(/[^0-9]/g,'')),formatInputCurrency:String,formatCurrency:String,
  getFriendlyFirebaseErrorMessage:e=>e.message,buildCustomerQuoteShareText:args=>{built.push(args);return 'quote';},
  shareTextContent:async args=>{shared.push(args);return{status:'cancelled'};},admitQuoteShare,
  Search:()=>null,X:()=>null,Loader2:()=>null,CheckCircle:()=>null,Send:()=>null};
 const built=[],shared=[],writes=[],history=[];
 const View=Function('require',...Object.keys(env),code+';return PriceQuoteBroadcastView;')(createRequire(import.meta.url),...Object.values(env));
 const data={dataReady:true,dataFresh:true,shareReady:false,currentCompany:{id:'tenantA'},employee:{id:'employeeA'},isOwnerAccount:true,
  products:[{id:'p1',name:'Gà',unit:'kg'}],customers:[{id:'c1',name:'Customer A',customerProductIds:['p1']}],
  orders:[{id:'o1',amount:120000}],payments:[{id:'pmt1',amount:40000}],onHistoryRequested:()=>history.push('requested'),onEditCustomer:(...args)=>writes.push(args),...props};
 const render=()=>{index=0;return View(data);};
 const nodes=(node,p,out=[])=>{if(!node||typeof node!=='object')return out;if(p(node))out.push(node);React.Children.forEach(node.props?.children,n=>nodes(n,p,out));return out;};
 const button=(tree,label)=>nodes(tree,n=>n.type==='button'&&React.Children.toArray(n.props.children).includes(label))[0];
 return {render,nodes,button,data,built,shared,writes,history};
}
test('initial quote editor does not request historical transactions; debt-bearing text requires both invoices and payments',()=>{
 assert.deepEqual(QUOTE_PRIMARY_COLLECTIONS,['customers','products']);assert.strictEqual(getQuoteWorkspaceReadCollections(false),QUOTE_PRIMARY_COLLECTIONS);
 assert.deepEqual(QUOTE_SHARE_COLLECTIONS,['customers','products','orders','payments']);assert.strictEqual(getQuoteWorkspaceReadCollections(true),QUOTE_SHARE_COLLECTIONS);
 assert.match(source,/quoteHistoryRequested=quoteHistoryOwner===readOwnerKey/);
 assert.match(source,/if\(readOwnerRef.current===readOwnerKey\)setQuoteHistoryOwner\(readOwnerKey\)/);
 assert.match(source,/shareReady=\{areHomeSourcesCommitted\([^\n]+collections:QUOTE_SHARE_COLLECTIONS/);
 assert.match(source,/<PriceQuoteBroadcastView[^\n]+orders=\{orders\} payments=\{payments\}/);
 assert.match(source,/key=\{`quotes:\$\{dashboardPrivacyScope\}`\}/);
});
test('actual editor does not read financial history while displaying/selecting/searching customers',()=>{
 const forbidden=new Proxy([],{get(){throw Error('Unexpected financial history read');}}),f=fixture({orders:forbidden,payments:forbidden});
 let view=f.render();assert(renderToStaticMarkup(view).includes('Customer A'));
 f.button(view,'Chọn tất cả').props.onClick();view=f.render();
 const search=f.nodes(view,n=>n.type==='input'&&n.props.placeholder==='2. Tìm và tick nhiều khách hàng')[0];
 search.props.onChange({target:{value:'Customer A'}});view=f.render();
 assert(renderToStaticMarkup(view).includes('Đã chọn 1 khách'));assert.equal(f.built.length,0);assert.equal(f.writes.length,0);
});
test('actual share handler defers incomplete history without losing price/selection, and uses original arrays after explicit second click',async()=>{
 const f=fixture();let view=f.render();f.button(view,'Chọn tất cả').props.onClick();view=f.render();
 f.nodes(view,n=>n.type==='input'&&n.props.placeholder==='VD: 68.000')[0].props.onChange({target:{value:'67000'}});view=f.render();
 await f.button(view,'Gửi thông báo Zalo').props.onClick();assert.equal(f.history.length,1);assert.equal(f.built.length,0);assert.equal(f.shared.length,0);
 view=f.render();assert.equal(f.nodes(view,n=>n.type==='input'&&n.props.placeholder==='VD: 68.000')[0].props.value,'67000');
 assert(renderToStaticMarkup(view).includes('Đã chọn 1 khách'));
 f.data.shareReady=true;view=f.render();await f.button(view,'Gửi thông báo Zalo').props.onClick();
 assert.equal(f.built.length,1);assert.strictEqual(f.built[0].orders,f.data.orders);assert.strictEqual(f.built[0].payments,f.data.payments);assert.equal(f.built[0].priceOverrides.p1.price,67000);assert.equal(f.shared.length,1);
});
test('unavailable data never asserts an empty completed list; refreshing data cannot execute a price mutation',async()=>{
 const missing=fixture({dataReady:false,dataFresh:false,customers:[]}),html=renderToStaticMarkup(missing.render());
 assert(html.includes('Đang mở khách hàng'));assert(html.includes('<fieldset disabled=""'));assert(!html.includes('Chưa có khách nào được gắn'));
 const f=fixture({dataFresh:false});let view=f.render();f.button(view,'Chọn tất cả').props.onClick();view=f.render();
 await f.button(view,'Áp dụng giá mới').props.onClick();assert.equal(f.writes.length,0);
});
