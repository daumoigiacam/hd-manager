import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {parse} from '@babel/parser';
import * as model from './offlineWarehouseModel.js';
import {dispatchWriteAccess} from './warehouseDispatchAccess.js';
const source=fs.readFileSync(new URL('./OfflineWarehouseWorkspace.jsx',import.meta.url),'utf8'),tree=parse(source,{sourceType:'module',plugins:['jsx']});
function nodes(n,p,out=[]){if(!n||typeof n!=='object')return out;if(p(n))out.push(n);for(const [k,v]of Object.entries(n))if(!['loc','start','end'].includes(k)){if(Array.isArray(v))for(const x of v)nodes(x,p,out);else if(v&&typeof v==='object')nodes(v,p,out);}return out;}
const fn=tree.program.body.find(n=>n.type==='ExportDefaultDeclaration').declaration,last=fn.body.body.at(-1);
let body=source.slice(fn.start,fn.end);const returns=fn.body.body.filter(n=>n.type==='IfStatement'&&n.consequent.type==='ReturnStatement'&&n.consequent.argument?.type==='JSXElement').map(n=>n.consequent);
for(const r of [last,...returns].sort((a,b)=>b.start-a.start)){const replacement=r===last?'return {dispatchRepositoryReady,canCreateDispatch,dispatchEditor,setDispatchEditor,dispatchClose,source,changeSource,applyFilters,queryKey,loaded,readState,activeDetail,openDetail};':'return {denied:true};';body=body.slice(0,r.start-fn.start)+replacement+body.slice(r.end-fn.start);}
const prelude=tree.program.body.filter(n=>n.type==='VariableDeclaration'&&['PAGE_SIZE','scopeIdentity'].includes(n.declarations[0].id.name)||n.type==='FunctionDeclaration'&&n.id.name==='validPage').map(n=>source.slice(n.start,n.end)).join('\n');
const hook=fs.readFileSync(new URL('../../hooks/useAppScreenBack.js',import.meta.url),'utf8').replace(/^import[^;]+;/,'').replace('export function','function');
function harness({ready=true}={}){
 const scope={projectId:'demo-test',tenantId:'t',principalId:'u',permissionRevision:'r',sessionId:'s'},cp={...scope,generation:'g',seq:1,sourceProfile:'legacy-v1',dayKey:'2026-11-09'},slots=[],listeners=new Set();let index=0,dirty=true,effects=[],view,reattach=false;
 const runtime={scope,expiresAtMs:Date.now()+60000,capabilities:['home.read','home.dispatches.read','home.stock.read','home.debt.read','customers.read','warehouseDispatches.create','warehouseDispatches.createWithoutOrderRequest'],isCurrent:()=>true,home:{status:()=>({state:'SYNCED',generation:'g',seq:1})},appSession:{currentUser:{id:'e',firebaseUid:'u',companyId:'t',accountType:'employee'},currentCompany:{id:'t'}}};
 const repo={scope,projectId:'demo-test',employeeId:'e',ready,protocolVersion:1};
 const directory={page:async source=>({items:[{id:'wd_t_a',state:'SERVER_CONFIRMED',document:{companyId:'t'}}],hasMore:false,metadata:{source,checkpoint:cp,serverConfirmedOnly:true,financialCalculationAllowed:false,timeZone:'Asia/Ho_Chi_Minh'}}),detail:async()=>({document:{id:'wd_t_a',companyId:'t'},items:[],metadata:{checkpoint:cp,projection:'warehouse-stored-detail-v1'}})};
 const useState=initial=>{const i=index++;slots[i]??={value:typeof initial==='function'?initial():initial};return [slots[i].value,next=>{next=typeof next==='function'?next(slots[i].value):next;if(!Object.is(next,slots[i].value)){slots[i].value=next;dirty=true;}}];};
 const useRef=initial=>{const i=index++;slots[i]??={current:initial};return slots[i];};
 const useEffect=(work,deps)=>{const i=index++,old=slots[i],changed=reattach||!old||deps.some((d,n)=>!Object.is(d,old.deps[n]));slots[i]={...old,deps};if(changed)effects.push(()=>{old?.cleanup?.();slots[i].cleanup=work();});};
 const window={addEventListener:(_,f)=>listeners.add(f),removeEventListener:(_,f)=>listeners.delete(f)};
 const context=vm.createContext({...model,dispatchWriteAccess,useState,useRef,useEffect,window}),render=vm.runInContext(hook+'\n'+prelude+'\n'+body+'\nOfflineWarehouseWorkspace',context);
 async function settle(){for(let n=0;n<14;n++){if(dirty){dirty=false;index=0;effects=[];view=render({runtime,directory,initialSource:'warehouseDispatches',warehouseDispatchRepository:repo});reattach=false;for(const f of effects)f();}await Promise.resolve();await Promise.resolve();}}
 return {runtime,repo,settle,get view(){return view;},get listeners(){return listeners.size;},back(){const e={detail:{},defaultPrevented:false,preventDefault(){this.defaultPrevented=true;}};for(const f of listeners)f(e);return e;},hide(){for(const s of slots)s.cleanup?.();},show(){dirty=true;reattach=true;}};
}
test('actual warehouse create control uses signed-ready Dispatch repository; editor blocks navigation/filter and parent back delegates draft handling',async()=>{
 const h=harness();await h.settle();assert.equal(h.view.canCreateDispatch,true);
 const callback=nodes(fn,n=>n.type==='JSXAttribute'&&n.name.name==='onClick'&&n.value?.expression?.type==='ArrowFunctionExpression'&&source.slice(n.start,n.end).includes('canCreateDispatch?'))[0].value.expression;
 Function('canCreateDispatch','setDispatchEditor','return ('+source.slice(callback.start,callback.end)+')')(true,h.view.setDispatchEditor)();await h.settle();assert.equal(h.view.dispatchEditor.id,null);assert.equal(h.view.dispatchEditor.readSource,'local');
 const before=h.view.queryKey;h.view.changeSource('warehouseImports');h.view.applyFilters({preventDefault(){}});await h.settle();assert.equal(h.view.source,'warehouseDispatches');assert.equal(h.view.queryKey,before);
 let closes=0;h.view.dispatchClose.current=()=>{closes++;return true;};assert.equal(h.back().defaultPrevented,true);assert.equal(closes,1);h.hide();assert.equal(h.listeners,0);h.show();await h.settle();assert.equal(h.view.dispatchEditor.id,null);assert.equal(h.listeners,1);
 const no=harness({ready:false});await no.settle();assert.equal(no.view.canCreateDispatch,false);
});
test('actual warehouse detail opens Dispatch with feed authority, queue opens local, and write components remain lazy',()=>{
 assert.match(source,/React\.lazy\(\(\)=>import\('\.\/OfflineWarehouseDispatchEditor.jsx'\)\)/);
 assert.doesNotMatch(source,/^import .*from '\.\/OfflineWarehouseDispatchEditor.jsx'/m);
 assert.match(source,/setDispatchEditor\(\{id:activeDetail.item.id,readSource:'feed'\}\)/);
 assert.match(source,/onOpen=\{id=>\{if\(!dispatchEditor\)setDispatchEditor\(\{id,readSource:'local'\}\)/);
 assert.match(source,/closeRequestRef=\{dispatchClose\}/);
});
test('actual NativeBusinessRoute opens writer only after visible completed dispatch content + signed write access, not on hidden reattachment',async()=>{
 const routeSource=fs.readFileSync(new URL('../../layout/NativeBusinessRoute.jsx',import.meta.url),'utf8'),ast=parse(routeSource,{sourceType:'module',plugins:['jsx']});
 const effect=nodes(ast,n=>n.type==='CallExpression'&&n.callee.name==='useEffect'&&routeSource.slice(n.start,n.end).includes('runtime.warehouseDispatchRepository'))[0].arguments[0];
 const code=routeSource.slice(effect.start,effect.end),runtime={isCurrent:()=>true,capabilities:['warehouseDispatches.create'],warehouseDispatchRepository:async()=>{calls++;return {};}};let calls=0,commits=0;
 const run=overrides=>{const env={runtime,route:{source:'warehouseDispatches'},active:true,warehouseDispatchContentOwner:runtime,warehouseDispatchRepository:null,availableNativeBusinessRoutes:()=>[{id:'warehouseDispatches'}],setWarehouseDispatchRepository:()=>{commits++;},setWarehouseDispatchError:()=>{},...overrides};return Function(...Object.keys(env),'return ('+code+');')(...Object.values(env))();};
 run({active:false});run({warehouseDispatchContentOwner:null});run({availableNativeBusinessRoutes:()=>[]});assert.equal(calls,0);
 const cleanup=run({});cleanup();await Promise.resolve();assert.equal(calls,1);assert.equal(commits,0);
 run({});await Promise.resolve();assert.equal(commits,1);run({warehouseDispatchRepository:{}});assert.equal(calls,2);
});
