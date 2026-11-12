import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {parse} from '@babel/parser';
import traverseModule from '@babel/traverse';
import * as model from './offlineWarehouseModel.js';
const traverse = traverseModule.default || traverseModule;
// Execute the actual component's hooks/effects without a DOM/build. Only JSX
// returns are replaced with an inspection object; all lifecycle code is original.
const text=fs.readFileSync(new URL('./OfflineWarehouseWorkspace.jsx',import.meta.url),'utf8');
const ast=parse(text,{sourceType:'module',plugins:['jsx']});let target;
traverse(ast,{FunctionDeclaration(p){if(p.node.id?.name==='OfflineWarehouseWorkspace')target=p;}});
const finalReturn=target.get('body').get('body').at(-1).node,edits=[];
target.traverse({ReturnStatement(p){if(p.getFunctionParent()!==target||!p.get('argument').isJSXElement())return;
  edits.push({start:p.node.start,end:p.node.end,text:p.node===finalReturn?'return {source,draft,filters,cursors,page,loaded,detail,readState,result,activeDetail,pending,error,queryKey,requestKey,changeSource,openDetail,setDraft,setFilters,setPage,setCursors,setRefresh,stockEditor,setStockEditor};':'return {denied:true};'});p.skip();}});
let fn=text.slice(target.node.start,target.node.end);for(const e of edits.sort((a,b)=>b.start-a.start))fn=fn.slice(0,e.start-target.node.start)+e.text+fn.slice(e.end-target.node.start);
const prelude=ast.program.body.filter(n=>n.type==='VariableDeclaration'&&['PAGE_SIZE','scopeIdentity'].includes(n.declarations[0].id.name)||n.type==='FunctionDeclaration'&&n.id.name==='validPage').map(n=>text.slice(n.start,n.end)).join('\n');
const backHook=fs.readFileSync(new URL('../../hooks/useAppScreenBack.js',import.meta.url),'utf8').replace(/^import[^;]+;/,'').replace('export function','function');

function harness() {
 const scope={projectId:'demo-test',tenantId:'a',principalId:'u',permissionRevision:'r',sessionId:'s'};
 const cp={...scope,generation:'g',seq:1,sourceProfile:'legacy-v1',dayKey:'2026-11-09',capturedAt:1};
 let current=true,sync={state:'SYNCED',generation:'g',seq:1},pageCalls=0,detailCalls=0,pendingPage=null;
 const runtime={scope,expiresAtMs:Date.now()+100000,capabilities:['home.read','home.imports.read','home.dispatches.read','home.stock.read'],isCurrent:()=>current,home:{status:()=>sync},appSession:{currentUser:{accountType:'employee',companyId:'a',firebaseUid:'u'},currentCompany:{id:'a'},employees:[]}};
 const result=(source)=>({items:[{id:'row',document:{companyId:'a'},state:'SERVER_CONFIRMED',businessDate:'2026-11-09'}],hasMore:false,nextCursor:null,metadata:{source,checkpoint:{...cp,generation:sync.generation,seq:sync.seq},serverConfirmedOnly:true,financialCalculationAllowed:false,timeZone:'Asia/Ho_Chi_Minh'}});
 const directory={page:async(source)=>{pageCalls++;return pendingPage?pendingPage:result(source);},detail:async(_source,id,{checkpoint})=>{detailCalls++;return {document:{id,companyId:'a'},items:[],metadata:{checkpoint,projection:'warehouse-stored-detail-v1'}};}};
 const slots=[];let index=0,dirty=true,reattach=false,view,effects=[];
 const useState=initial=>{const i=index++;if(!slots[i])slots[i]={value:typeof initial==='function'?initial():initial};return [slots[i].value,value=>{const next=typeof value==='function'?value(slots[i].value):value;if(!Object.is(next,slots[i].value)){slots[i].value=next;dirty=true;}}];};
 const useRef=initial=>{const i=index++;if(!slots[i])slots[i]={current:initial};return slots[i];};
 const useEffect=(work,deps)=>{const i=index++,old=slots[i],changed=reattach||!old||deps.some((d,n)=>!Object.is(d,old.deps[n]));slots[i]={...old,deps};if(changed)effects.push(()=>{old?.cleanup?.();slots[i].cleanup=work();});};
 const backListeners=new Set(),window={addEventListener(_name,fn){backListeners.add(fn);},removeEventListener(_name,fn){backListeners.delete(fn);}};
 const context=vm.createContext({...model,useState,useEffect,useRef,window});
 const component=vm.runInContext(backHook+'\n'+prelude+'\n'+fn+'\nOfflineWarehouseWorkspace;',context);
 async function settle(){for(let n=0;n<12;n++){if(dirty){dirty=false;index=0;effects=[];view=component({runtime,directory,initialSource:'warehouseImports'});reattach=false;for(const effect of effects)effect();}await new Promise(resolve=>setImmediate(resolve));}return view;}
 return {settle,get view(){return view;},runtime,cp,result,get pageCalls(){return pageCalls;},get detailCalls(){return detailCalls;},get backListeners(){return backListeners.size;},back(){const event={detail:{},defaultPrevented:false,preventDefault(){this.defaultPrevented=true;}};for(const listener of backListeners)listener(event);return event;},hide(){for(const slot of slots)slot.cleanup?.();},show(){reattach=true;dirty=true;},setPending(value){pendingPage=value;},setSync(value){sync=value;dirty=true;},close(){current=false;dirty=true;}};
}

test('Activity hide/show preserves draft/filter/detail and does not rerun completed query',async()=>{
 const h=harness();await h.settle();h.view.setDraft({text:'unsaved draft',from:'',through:'',employeeId:'',status:''});await h.settle();await h.view.openDetail(h.view.result.items[0]);await h.settle();
 const result=h.view.result,detail=h.view.detail;
 for(let n=0;n<3;n++){h.hide();h.show();await h.settle();assert.equal(h.view.result,result);assert.equal(h.view.detail,detail);assert.equal(h.view.draft.text,'unsaved draft');}
 assert.equal(h.pageCalls,1);assert.equal(h.detailCalls,1);
});
test('Activity reattachment preserves a changed source and page/cursor',async()=>{
 const h=harness();await h.settle();h.view.changeSource('warehouseDispatches');await h.settle();h.view.setCursors([null,'next']);h.view.setPage(1);await h.settle();const count=h.pageCalls;
 h.hide();h.show();await h.settle();assert.equal(h.view.source,'warehouseDispatches');assert.equal(h.view.page,1);assert.equal(h.view.cursors[1],'next');assert.equal(h.pageCalls,count);
});
test('same-query refresh retains rows/detail while running and same-checkpoint completion',async()=>{
 const h=harness();await h.settle();await h.view.openDetail(h.view.result.items[0]);await h.settle();const saved=h.view.result,detail=h.view.detail;
 let resolve;h.setPending(new Promise(r=>{resolve=r;}));h.view.setRefresh(x=>x+1);await h.settle();assert.equal(h.view.result,saved);assert.equal(h.view.detail,detail);
 resolve(h.result('warehouseImports'));await h.settle();assert.equal(h.view.detail,detail);assert.equal(h.pageCalls,2);
});
test('permission/stale-checkpoint refresh clears prior rows and detail',async()=>{
 for(const code of ['permission-denied','stale-checkpoint']){
  const h=harness();await h.settle();await h.view.openDetail(h.view.result.items[0]);await h.settle();
  let reject;h.setPending(new Promise((_r,j)=>{reject=j;}));h.view.setRefresh(x=>x+1);await h.settle();reject(Object.assign(Error('unsafe raw error'),{code}));await h.settle();
  assert.equal(h.view.result,null);assert.equal(h.view.activeDetail,null);assert(!h.view.error.includes('unsafe'));
 }
});
test('new completed checkpoint invalidates old content; closed owner never exposes it',async()=>{
 const h=harness();await h.settle();await h.view.openDetail(h.view.result.items[0]);await h.settle();h.setSync({state:'SYNCED',generation:'g2',seq:2});await h.settle();
 assert.equal(h.view.result.metadata.checkpoint.generation,'g2');assert.equal(h.view.activeDetail,null);h.close();await h.settle();assert.equal(h.view.denied,true);
});
test('existing screen-back closes detail before Home and detaches when Activity hides',async()=>{
 const h=harness();await h.settle();assert.equal(h.backListeners,1);assert.equal(h.back().defaultPrevented,false);
 await h.view.openDetail(h.view.result.items[0]);await h.settle();const event=h.back();assert.equal(event.defaultPrevented,true);assert.equal(event.detail.handled,true);await h.settle();assert.equal(h.view.activeDetail,null);
 h.hide();assert.equal(h.backListeners,0);h.show();await h.settle();assert.equal(h.backListeners,1);assert.equal(h.back().defaultPrevented,false);
});
test('back closes stock-count editor first, then detail, without new native listeners',async()=>{
 const h=harness();await h.settle();await h.view.openDetail(h.view.result.items[0]);await h.settle();const detail=h.view.detail;h.view.setStockEditor({id:null});await h.settle();h.hide();h.show();await h.settle();assert(h.view.stockEditor);assert.equal(h.backListeners,1);
 assert.equal(h.back().defaultPrevented,true);await h.settle();assert.equal(h.view.stockEditor,null);assert.equal(h.view.detail,detail);assert.equal(h.back().defaultPrevented,true);await h.settle();assert.equal(h.view.activeDetail,null);assert.equal(h.back().defaultPrevented,false);
});
