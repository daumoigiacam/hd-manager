import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {transform} from 'esbuild';
import {parse} from '@babel/parser';
import {createRequire} from 'node:module';
import {renderToStaticMarkup} from 'react-dom/server';
import {formatVnd} from '../development/hd-manager/application/src/features/business-report/reportViewModel.js';
import {selectRevenueDetail} from '../development/hd-manager/application/src/features/business-report/revenueDetailModel.js';

const require=createRequire(import.meta.url);
const root=new URL('../development/hd-manager/application/src/',import.meta.url);
const read=file=>readFileSync(new URL(file,root),'utf8');
function find(source,predicate){
  let match;
  function visit(node){
    if(!node||typeof node!=='object'||match)return;
    if(predicate(node)){match=node;return;}
    for(const [key,value] of Object.entries(node)){
      if(['loc','extra','comments'].includes(key))continue;
      if(Array.isArray(value))value.forEach(visit);else if(value?.type)visit(value);
    }
  }
  visit(parse(source,{sourceType:'module',plugins:['jsx']}));
  assert.ok(match,'Actual application declaration exists');return match;
}
function actualEffect(file,marker){
  const source=read(file);
  const node=find(source,n=>n.type==='CallExpression'&&n.callee.name==='useEffect'&&source.slice(n.arguments[0]?.start,n.arguments[0]?.end).includes(marker));
  return source.slice(node.arguments[0].start,node.arguments[0].end);
}
const onlineEffect=actualEffect('features/legacy/OrderManagementView.jsx',"quickActionIntent?.type !== 'open_order_detail'");
const nativeEffect=actualEffect('features/orders/SQLiteProductOrders.jsx','consumedOrderDetail.current===orderDetailIntent');
const invoke=(code,env)=>Function(...Object.keys(env),'return ('+code+')();')(...Object.values(env));
const source=read('features/business-report/RevenueDetail.jsx');
const component=find(source,n=>n.type==='FunctionDeclaration'&&n.id.name==='RevenueDetail');
const compiled=await transform(source.slice(component.start,component.end),{loader:'jsx',jsx:'automatic',format:'cjs'});
function viewFixture(){
  const values=[];let cursor=0;
  const useState=initial=>{const at=cursor++;if(!(at in values))values[at]=initial;return[values[at],value=>{values[at]=typeof value==='function'?value(values[at]):value;}];};
  const View=Function('require','useMemo','useState','formatVnd','selectRevenueDetail','ChevronLeft','ChevronRight',compiled.code+';return RevenueDetail;')
    (require,fn=>fn(),useState,formatVnd,selectRevenueDetail,()=>null,()=>null);
  return props=>{cursor=0;return View(props);};
}
function elements(node,predicate){
  if(!node||typeof node!=='object')return[];
  if(Array.isArray(node))return node.flatMap(child=>elements(child,predicate));
  return[...(predicate(node)?[node]:[]),...elements(node.props?.children,predicate)];
}
const rows=Array.from({length:21},(_,i)=>({id:'employee',orderId:'internal-'+i,orderCode:'internal-'+i,date:'2026-11-28',customerName:'Khách trùng tên',salesEmployeeName:'Nhân viên mẫu',revenue:1000+i}));
const props={business:{salesEmployeeOrders:rows},selection:{id:'employee',kind:'employee',name:'Nhân viên mẫu'},report:{startDate:'2026-11-28',endDate:'2026-11-28',label:'Hôm nay'}};

test('employee rows contain customer and amount without internal ID, date or repeated salesperson',()=>{
  const tree=viewFixture()({...props,onOpenOrder:()=>true});
  const list=elements(tree,n=>n.type==='ol')[0];
  const html=renderToStaticMarkup(list);
  assert.match(html,/Khách trùng tên/);assert.match(html,/1\.000/);
  for(const text of ['internal-','2026-11-28','Kinh doanh:','Nhân viên mẫu'])assert.ok(!html.includes(text),text);
  assert.equal(elements(list,n=>n.type==='button').length,20);
});
test('row clicks preserve exact order identity on every page even with duplicate customer names',()=>{
  const render=viewFixture(),opened=[];const p={...props,onOpenOrder:id=>opened.push(id)};
  let tree=render(p);let buttons=elements(tree,n=>n.props?.className==='business-report-order-link');
  buttons[0].props.onClick();buttons[19].props.onClick();
  elements(tree,n=>n.props?.['aria-label']==='Trang sau')[0].props.onClick();
  tree=render(p);buttons=elements(tree,n=>n.props?.className==='business-report-order-link');
  assert.equal(buttons.length,1);buttons[0].props.onClick();
  assert.deepEqual(opened,['internal-0','internal-19','internal-20']);
});
test('unavailable navigation and missing identity remain readable; denied access is visible',()=>{
  const render=viewFixture();let tree=render({...props});
  assert.equal(elements(tree,n=>n.props?.className==='business-report-order-link').length,0);
  tree=render({...props,onOpenOrder:()=>false});elements(tree,n=>n.props?.className==='business-report-order-link')[0].props.onClick();
  tree=render({...props,onOpenOrder:()=>false});assert.equal(elements(tree,n=>n.props?.role==='alert').length,1);
  tree=viewFixture()({...props,business:{salesEmployeeOrders:[{...rows[0],orderId:''}]},onOpenOrder:()=>true});
  assert.equal(elements(tree,n=>n.props?.className==='business-report-order-link').length,0);
});
test('customer drilldown retains its invoice context while opening the same exact order',()=>{
  const opened=[];const tree=viewFixture()({...props,business:{customerPerformanceRows:[rows[0]]},selection:{...props.selection,kind:'customer'},onOpenOrder:id=>opened.push(id)});
  const html=renderToStaticMarkup(tree);assert.match(html,/2026-11-28/);assert.match(html,/Kinh doanh:/);
  elements(tree,n=>n.props?.className==='business-report-order-link')[0].props.onClick();assert.deepEqual(opened,['internal-0']);
});
function onlineFixture(){
  const opened=[],state={acks:0,error:''};
  const env={quickActionIntent:{type:'open_order_detail',orderId:'target',companyId:'company'},currentCompany:{id:'company'},employee:{companyId:'company'},orderViewsReady:false,
    activeOrders:[],getLiveOrderViewModel:()=>null,openOrderDetail:id=>opened.push(id),setOrderOpenError:value=>{state.error=value;},onQuickActionHandled:()=>state.acks++};
  return{env,opened,state,run:()=>invoke(onlineEffect,env)};
}
test('online navigation waits for projection, then opens outside the visible page and active filters',()=>{
  const f=onlineFixture();f.run();assert.equal(f.state.acks,0);assert.deepEqual(f.opened,[]);
  f.env.orderViewsReady=true;f.env.getLiveOrderViewModel=id=>id==='target'?{id,customerName:'Exact invoice'}:null;
  f.run();assert.deepEqual(f.opened,['target']);assert.equal(f.state.acks,1);assert.equal(f.state.error,'');
});
test('missing or foreign-company invoice never falls back to another invoice',()=>{
  const f=onlineFixture();f.env.orderViewsReady=true;f.env.activeOrders=[{id:'other'}];f.run();
  assert.deepEqual(f.opened,[]);assert.equal(f.state.acks,1);assert.ok(f.state.error);
  const foreign=onlineFixture();foreign.env.quickActionIntent.companyId='foreign';foreign.env.getLiveOrderViewModel=()=>({id:'target'});foreign.run();
  assert.deepEqual(foreign.opened,[]);assert.equal(foreign.state.acks,1);
});
test('real App callback checks current access, clears search and routes exact intent with tenant scope',()=>{
  const app=read('App.jsx'),node=find(app,n=>n.type==='VariableDeclarator'&&n.id.name==='handleOpenCustomerOrderDetail');
  const code=app.slice(node.init.arguments[0].start,node.init.arguments[0].end),state={access:false,calls:[]};
  const env={currentCompany:{id:'tenant'},employee:{},canAccess:tab=>state.access&&tab==='orders',
    ...Object.fromEntries(['setOrderSearchKeyword','setOrderSearchOpen','setOrderFilterOpen','setActiveTab','setQuickActionIntent'].map(name=>[name,value=>state.calls.push([name,value])]))};
  const call=id=>Function(...Object.keys(env),'return ('+code+')(arguments[arguments.length-1]);')(...Object.values(env),id);
  assert.equal(call('target'),false);assert.deepEqual(state.calls,[]);
  state.access=true;assert.equal(call('  target  '),true);assert.deepEqual(state.calls.slice(0,4),[['setOrderSearchKeyword',''],['setOrderSearchOpen',false],['setOrderFilterOpen',false],['setActiveTab','orders']]);
  const intent=state.calls[4][1];assert.equal(intent.orderId,'target');assert.equal(intent.companyId,'tenant');assert.equal(intent.type,'open_order_detail');
});
test('local navigation opens direct detail only for current scope, waiting for repo and unsaved drafts',()=>{
  const state={selected:'',notice:''},runtime={scope:{companyId:'tenant'},isCurrent:()=>true,expiresAtMs:Date.now()+60000};
  const env={runtime,current:r=>r.isCurrent(),orderDetailIntent:{orderId:'target',scope:JSON.stringify(runtime.scope)},consumedOrderDetail:{current:null},repo:null,creating:false,selected:'',setNotice:v=>{state.notice=v;},setSelected:v=>{state.selected=v;}};
  const run=()=>invoke(nativeEffect,env);run();assert.equal(state.selected,'');
  env.repo={};env.creating=true;run();assert.equal(state.selected,'');assert.ok(state.notice);
  env.creating=false;run();assert.equal(state.selected,'target');assert.equal(state.notice,'');
  state.selected='';run();assert.equal(state.selected,'');
  env.orderDetailIntent={orderId:'foreign',scope:'other'};run();assert.equal(state.selected,'');
});
