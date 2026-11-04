import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {dirname,join} from 'node:path';
import {parse} from '@babel/parser';
import {chromium} from 'playwright-core';
import {chromiumLaunchOptions} from './helpers/chromium-launch-options.mjs';
import {appFunction} from './helpers/app-source-function.mjs';
import * as readiness from '../src/services/customerFinancialReadiness.js';

const scope=JSON.stringify(['login-1','uid-a','tenant-a','customer-a']);
function sourceFixture(){
 let financial=readiness.resetCustomerFinancialReadiness(scope);
 for(const name of readiness.CUSTOMER_FINANCIAL_SOURCES)financial=readiness.confirmCustomerFinancialSource(financial,scope,name,30);
 let root={tenantId:'tenant-a',ownerKey:'owner-a',collections:{orders:true,payments:true,customer_points:true}};
 const env={...readiness,readOwnerKey:'owner-a',readOwnerRef:{current:'owner-a'},dataSessionId:'login-1',
  isReadAccessCurrent:()=>env.readOwnerRef.current==='owner-a',activeTenantScopeRef:{current:'tenant-a'},tenantCompanyId:'tenant-a',
  firebaseUser:{uid:'uid-a'},auth:{currentUser:{uid:'uid-a'}},customerSession:true,sessionCustomerId:'customer-a',cancelled:false,
  serverPendingCollectionNames:new Set(),pendingServerConfirmedCollectionMarks:new Set(),serverConfirmedCollectionMarkTimer:{},
  collectionReadinessCommittedRef:{current:{actorUid:'uid-a',serverConfirmed:root}},
  setServerConfirmedCollectionState:update=>{root=update(root)},setCustomerFinancialState:update=>{financial=update(financial)},
  sourcePhaseDiagnostics:{mark(){}},markCollectionLoaded(){},startupNotificationBarrier:null};
 return{pending:appFunction('markCollectionServerPending',env),confirm:appFunction('markCollectionServerConfirmed',env),
  read:()=>({financial,root}),env};
}

const initial={ledger:{currentDebt:100},availableCustomerPoints:10,monthlyOrders:[{}],monthlySales:100,
 customerPayments:[{amount:0}],debtLimit:1000,remainingDebtLimit:900};
const partial={ledger:{currentDebt:777},availableCustomerPoints:999,monthlyOrders:Array.from({length:9},()=>({})),monthlySales:999,
 customerPayments:[{amount:999}],debtLimit:1000,remainingDebtLimit:223};
const expected=['100 đ','10',1,'100 đ','0 đ','900 đ'].map(String);

test('actual App pending callback and CustomerPortal financial render retain complete values without declaring mixed refresh data ready',async t=>{
 const require=createRequire(import.meta.url);
 const runtime=Object.fromEntries(await Promise.all([
  ['react','react','react.production.js'],['react-dom','react-dom','react-dom.production.js'],
  ['client','react-dom','react-dom-client.production.js'],['scheduler','scheduler','scheduler.production.js'],
 ].map(async([name,pkg,file])=>[name,await readFile(join(dirname(require.resolve(pkg)),'cjs',file),'utf8')])));
 const source=await readFile(new URL('../src/features/legacy/CustomerPortalView.jsx',import.meta.url),'utf8');
 const tree=parse(source,{sourceType:'module',plugins:['jsx']});let component,home;
 const walk=(node,fn)=>{if(!node||typeof node!=='object')return;fn(node);for(const[key,value]of Object.entries(node)){
  if(['loc','extra','comments'].includes(key))continue;if(Array.isArray(value))value.forEach(child=>walk(child,fn));else if(value?.type)walk(value,fn);
 }};
 walk(tree,node=>{if(node.type==='FunctionDeclaration'&&node.id?.name==='CustomerPortalView')component=node});assert(component);
 walk(component,node=>{if(node.type==='VariableDeclarator'&&node.id.name==='renderHome')home=node.init});assert(home);
 const first=component.body.body.find(node=>node.type==='VariableDeclaration'&&node.declarations[0].id.name==='financialReady');
 const end=component.body.body.find(node=>node.type==='VariableDeclaration'&&node.declarations[0].id.name==='customerAvatarInputRef');
 assert(first&&end);const financialBlock=source.slice(first.start,end.start),calls=[];let status;
 walk(home,node=>{
  if(node.type==='CallExpression'&&node.callee.name==='financialValue')calls.push(source.slice(node.start,node.end));
  if(node.type==='JSXAttribute'&&node.name.name==='data-hd-customer-financial-status')status=source.slice(node.value.expression.start,node.value.expression.end);
 });assert.equal(calls.length,6,'execute the six actual Home financial presentation expressions');assert(status);
 const f=sourceFixture(),browser=await chromium.launch(chromiumLaunchOptions());
 try{
  const context=await browser.newContext();await context.route('**/*',route=>route.abort());const page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));await page.setContent('<div id="root"></div>');
  await page.evaluate(({runtime,financialBlock,calls,status,financial,initial})=>{
   const modules={};const load=name=>{if(modules[name])return modules[name].exports;if(!runtime[name])throw Error('Unknown runtime '+name);
    const module={exports:{}};modules[name]=module;new Function('module','exports','require','process',runtime[name])(module,module.exports,load,{env:{NODE_ENV:'production'}});return module.exports};
   const React=load('react'),dom=load('react-dom'),client=load('client');
   // Only the actual component's financial hook block and six JSX value
   // expressions execute here; no bundler or duplicate ledger calculation.
   const Slice=new Function('React','useRef','useEffect','useLayoutEffect','calls','status',`return function PortalFinancialSlice({financialState,values}){
    const {ledger,availableCustomerPoints,monthlyOrders,monthlySales,customerPayments,debtLimit,remainingDebtLimit}=values;
    const formatCurrency=value=>String(value)+' đ',formatNumber=String,parseLooseMoneyValue=Number,formatDateTimeLabel=value=>String(value);
    ${financialBlock}
    window.renderFinancialReady=financialReady;
    window.cachedStamp=typeof financialCachedAt==='undefined'?null:financialCachedAt;
    return React.createElement('section',{'data-status':eval(status),'aria-busy':!financialReady},calls.map((code,index)=>React.createElement('output',{key:index},String(eval(code)))));
   }`)(React,React.useRef,React.useEffect,React.useLayoutEffect,calls,status);
   function Fixture(){const[state,setState]=React.useState({financialState:financial,values:initial});
    const[draft,setDraft]=React.useState('');window.update=value=>dom.flushSync(()=>setState(value));
    return React.createElement(React.Fragment,null,React.createElement('input',{'aria-label':'Draft',value:draft,onChange:event=>setDraft(event.target.value)}),React.createElement(Slice,state));}
   const root=client.createRoot(document.getElementById('root'));dom.flushSync(()=>root.render(React.createElement(Fixture)));
   window.stop=()=>dom.flushSync(()=>root.unmount());
  },{runtime,financialBlock,calls,status,financial:f.read().financial,initial});
  await page.getByLabel('Draft').fill('keep this draft');
  const values=()=>page.locator('output').allTextContents();assert.deepEqual(await values(),expected);
  f.pending('orders');f.pending('payments');
  await page.evaluate(state=>window.update(state),{financialState:f.read().financial,values:partial});
  const observed={rootOrders:f.read().root.collections.orders,financialStatus:f.read().financial.status,
   ready:await page.evaluate(()=>window.renderFinancialReady),values:await values()};
  t.diagnostic(JSON.stringify(observed));
  assert.deepEqual(observed,{rootOrders:false,financialStatus:'loading',ready:false,values:expected},'pending root sources must invalidate customer readiness and preserve last complete six fields');
  assert.equal(f.read().financial.confirmedAt,30,'revalidation keeps the last complete timestamp');
  assert.equal(await page.evaluate(()=>window.cachedStamp),30,'the cached label uses the completed presentation timestamp');
  assert.equal(await page.locator('[data-status]').getAttribute('data-status'),'revalidating');
  f.confirm('orders');assert.equal(f.read().financial.status,'loading');assert.equal(f.read().financial.confirmedAt,30);
  await page.evaluate(state=>window.update(state),{financialState:f.read().financial,values:partial});assert.deepEqual(await values(),expected);
  f.confirm('payments');assert.equal(f.read().financial.status,'ready');
  await page.evaluate(state=>window.update(state),{financialState:f.read().financial,values:partial});
  assert.deepEqual(await values(),['777 đ','999','9','999 đ','999 đ','223 đ']);
  for(const fields of[['login-2','uid-a','tenant-a','customer-a'],['login-1','uid-b','tenant-a','customer-a'],
   ['login-1','uid-a','tenant-b','customer-a'],['login-1','uid-a','tenant-a','customer-b']]){
   await page.evaluate(state=>window.update(state),{financialState:f.read().financial,values:partial});
   await page.evaluate(state=>window.update(state),{financialState:readiness.resetCustomerFinancialReadiness(JSON.stringify(fields)),values:initial});
   assert.deepEqual(await values(),Array(6).fill('—'),'an unverified/new scope cannot reuse prior presentation');
  }
  const zeroScope=JSON.stringify(['login-zero','uid-a','tenant-a','customer-a']);let zero=readiness.resetCustomerFinancialReadiness(zeroScope);
  for(const name of readiness.CUSTOMER_FINANCIAL_SOURCES)zero=readiness.confirmCustomerFinancialSource(zero,zeroScope,name,30);
  const empty={ledger:{currentDebt:0},availableCustomerPoints:0,monthlyOrders:[],monthlySales:0,customerPayments:[],debtLimit:0,remainingDebtLimit:0};
  await page.evaluate(state=>window.update(state),{financialState:zero,values:empty});
  zero=readiness.markCustomerFinancialSourcePending(zero,zeroScope,'orders');
  await page.evaluate(state=>window.update(state),{financialState:zero,values:partial});
  assert.deepEqual(await values(),['0 đ','0','0','0 đ','0 đ','0 đ'],'completed zeros must not become placeholders or new partial values');
  assert.equal(await page.getByLabel('Draft').inputValue(),'keep this draft');await page.evaluate(()=>window.stop());assert.deepEqual(errors,[]);
 }finally{await browser.close()}
});

test('customer pending helper is idempotent, scoped and keeps the last complete time through partial confirmations',()=>{
 let state=readiness.resetCustomerFinancialReadiness(scope);
 assert.strictEqual(readiness.markCustomerFinancialSourcePending(state,scope,'orders'),state);
 for(const name of readiness.CUSTOMER_FINANCIAL_SOURCES)state=readiness.confirmCustomerFinancialSource(state,scope,name,30);
 for(const [otherScope,name]of[['foreign','orders'],[scope,'products']])assert.strictEqual(readiness.markCustomerFinancialSourcePending(state,otherScope,name),state);
 state=readiness.markCustomerFinancialSourcePending(state,scope,'orders');const pending=state;
 assert.strictEqual(readiness.markCustomerFinancialSourcePending(state,scope,'orders'),pending);
 state=readiness.markCustomerFinancialSourcePending(state,scope,'payments');assert.equal(state.confirmedAt,30);
 state=readiness.confirmCustomerFinancialSource(state,scope,'orders',40);assert.equal(state.status,'loading');assert.equal(state.confirmedAt,30);
 state=readiness.confirmCustomerFinancialSource(state,scope,'payments',50);assert.equal(state.status,'ready');assert.equal(state.confirmedAt,50);
});

test('actual customer financial action callbacks reject pending, replaced-session and stale same-scope closures',async()=>{
 const original={scope,status:'ready',confirmedAt:30};
 for(const current of[{...original,status:'loading'},{...original,scope:'new-session'},{...original,confirmedAt:40}]){
  const financialAccessRef={current};const hasFreshFinancialAccess=appFunction('hasFreshFinancialAccess',{financialReady:true,financialState:original,financialAccessRef});
  assert.equal(hasFreshFinancialAccess(),false);let writes=0;const messages=[];
  const env={hasFreshFinancialAccess,setDebtPaymentActionMessage:value=>messages.push(value),setRedeemPointsMessage:value=>messages.push(value),
   setPointWithdrawMessage:value=>messages.push(value),setSubmitMessage:value=>messages.push(value),
   onAddOrderRequest:()=>writes++,onEditOrderRequest:()=>writes++,onRedeemCustomerPoints:()=>writes++,requestCustomerDebtPaymentIntent:()=>writes++,
   openExternalPaymentUrl:()=>writes++,copyTextToClipboard:()=>writes++};
  for(const name of['handleOpenDebtPayment','handleConfirmPaymentTransfer','handleCopyDebtPaymentReference','openPointWithdrawSheet',
   'handleRedeemPointsForDebt','handleSubmitPointWithdraw','submitOrderRequest'])await appFunction(name,env)();
  assert.equal(writes,0);assert.equal(messages.length,4);
 }
 const financialAccessRef={current:original};
 assert.equal(appFunction('hasFreshFinancialAccess',{financialReady:true,financialState:original,financialAccessRef})(),true);
});

test('an authorized in-flight payment intent cannot open a sheet after financial readiness changes',async()=>{
 for(const invalidate of[false,true]){
  const original={scope,status:'ready',confirmedAt:30},financialAccessRef={current:original};let finish,opened=0,intents=0;const requests=[],preparing=[];
  const hasFreshFinancialAccess=appFunction('hasFreshFinancialAccess',{financialReady:true,financialState:original,financialAccessRef});
  const handler=appFunction('handleOpenDebtPayment',{hasFreshFinancialAccess,isPreparingDebtPayment:false,customerPaymentAmount:100,debtPaymentAmount:100,
   selectedPaymentOrders:[{id:'fresh-order'}],unpaidCustomerOrdersForPayment:[],firebaseUser:{uid:'uid-a'},appId:'fixture',
   requestCustomerDebtPaymentIntent:input=>{requests.push(input);return new Promise(resolve=>{finish=resolve})},
   setIsPreparingDebtPayment:value=>preparing.push(value),setDebtPaymentActionMessage(){},
   setDebtPaymentIntent:()=>intents++,setIsPaymentSheetOpen:()=>opened++});
  const running=handler();assert.equal(requests.length,1);assert.deepEqual(requests[0].orderIds,['fresh-order']);
  if(invalidate)financialAccessRef.current={...original,status:'loading'};
  finish({id:'server-intent',amount:100});await running;
  assert.equal(opened,invalidate?0:1);assert.equal(intents,invalidate?0:1);assert.deepEqual(preparing,[true,false]);
 }
});
