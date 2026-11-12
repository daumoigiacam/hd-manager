import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {parse} from '@babel/parser';
import traverseModule from '@babel/traverse';
import * as delivery from './offlineDeliveryModel.js';
import * as messages from '../messages/offlineMessageModel.js';
const traverse=traverseModule.default||traverseModule;
const backHook=fs.readFileSync(new URL('../../hooks/useAppScreenBack.js',import.meta.url),'utf8').replace(/^import[^;]+;/,'').replace('export function','function');
function extract(file,name,inspect) {
 const text=fs.readFileSync(new URL(file,import.meta.url),'utf8'),ast=parse(text,{sourceType:'module',plugins:['jsx']});let target;
 traverse(ast,{FunctionDeclaration(p){if(p.node.id?.name===name)target=p;}});
 const last=target.get('body').get('body').at(-1).node,edits=[];
 target.traverse({ReturnStatement(p){if(p.getFunctionParent()!==target||!p.get('argument').isJSXElement())return;edits.push({start:p.node.start,end:p.node.end,text:p.node===last?'return {'+inspect+'};':'return {unavailable:true};'});p.skip();}});
 let fn=text.slice(target.node.start,target.node.end);for(const e of edits.sort((a,b)=>b.start-a.start))fn=fn.slice(0,e.start-target.node.start)+e.text+fn.slice(e.end-target.node.start);return fn+'\n'+name+';';
}
const deliveryCode=extract('./OfflineDeliveryWorkspace.jsx','OfflineDeliveryWorkspace','draft,filters,cursors,page,loaded,result,activeDetail,readState,detail,queryKey,requestKey,openDetail,setDraft,setFilters,setCursors,setPage,setRefresh');
const messageCode=extract('../messages/OfflineMessageWorkspace.jsx','OfflineMessageWorkspace','source,setSource,state');

function harness(kind='delivery') {
 const scope={tenantId:'a',principalId:'u',permissionRevision:'r',sessionId:'s'};
 let current=true,sync={state:'SYNCED',generation:'g',seq:1},pageCalls=0,pending=null;
 const runtime={scope,expiresAtMs:Date.now()+100000,capabilities:['home.read','home.dispatches.read','home.orders.read','orders.read'],isCurrent:()=>current,home:{status:()=>sync},appSession:{currentCompany:{id:'a'},currentUser:{accountType:'employee',companyId:'a',firebaseUid:'u'},employees:[]}};
 const row=(id,document={})=>({id,document:{companyId:'a',...document},state:'SERVER_CONFIRMED',businessDate:'2026-11-09'});
 const response=(source,rows)=>({items:rows,hasMore:false,nextCursor:null,metadata:{source,checkpoint:{...scope,generation:sync.generation,seq:sync.seq,capturedAt:1,dayKey:'2026-11-09',sourceProfile:'legacy-v1'},timeZone:'Asia/Ho_Chi_Minh',serverConfirmedOnly:true,financialCalculationAllowed:false}});
 const directory={sources:{deliveryReports:{requiredCapabilities:['home.read','home.dispatches.read']},warehouseDispatches:{requiredCapabilities:['home.read','home.dispatches.read']},orders:{requiredCapabilities:['home.read','home.orders.read','orders.read']}},page:async(source)=>{pageCalls++;return pending||response(source,[row('report',{dispatchId:'dispatch'})]);},lookup:async(source,ids)=>response(source,ids.map(id=>row(id,source==='warehouseDispatches'?{orderId:'order'}:{})))};
 let props={runtime,directory,initialSource:'messages'},index=0,dirty=true,reattach=false,view,effects=[];const slots=[],listeners=new Set();
 const useState=initial=>{const i=index++;if(!slots[i])slots[i]={value:typeof initial==='function'?initial():initial};return [slots[i].value,value=>{const next=typeof value==='function'?value(slots[i].value):value;if(!Object.is(next,slots[i].value)){slots[i].value=next;dirty=true;}}];};
 const useRef=initial=>{const i=index++;if(!slots[i])slots[i]={current:initial};return slots[i];};
 const useEffect=(work,deps)=>{const i=index++,old=slots[i],changed=reattach||!old||deps.some((d,n)=>!Object.is(d,old.deps[n]));slots[i]={...old,deps};if(changed)effects.push(()=>{old?.cleanup?.();slots[i].cleanup=work();});};
 const context=vm.createContext({...delivery,...messages,useState,useRef,useEffect,window:{addEventListener(_event,fn){listeners.add(fn);},removeEventListener(_event,fn){listeners.delete(fn);}}});
 const component=vm.runInContext(backHook+'\n'+(kind==='delivery'?deliveryCode:messageCode),context);
 async function settle(){for(let n=0;n<15;n++){if(dirty){dirty=false;index=0;effects=[];view=component(props);reattach=false;for(const effect of effects)effect();}await new Promise(resolve=>setImmediate(resolve));}return view;}
 return {settle,get view(){return view;},get pageCalls(){return pageCalls;},get listenerCount(){return listeners.size;},response,row,hide(){for(const slot of slots)slot.cleanup?.();},show(){reattach=true;dirty=true;},setPending(value){pending=value;},setProps(value){props={...props,...value};dirty=true;},setSync(value){sync=value;dirty=true;},close(){current=false;dirty=true;},back(){const e={detail:{},defaultPrevented:false,preventDefault(){this.defaultPrevented=true;}};for(const fn of listeners)fn(e);return e;}};
}

test('Delivery Activity keeps filters/draft/detail and does not repeat same completed read',async()=>{
 const h=harness();await h.settle();h.view.setDraft({text:'unsaved',from:'',through:'',employeeId:'',status:''});h.view.setFilters({text:'applied',from:null,to:null,employeeId:null,status:null});await h.settle();await h.view.openDetail(h.view.result.items[0]);await h.settle();const result=h.view.result,detail=h.view.detail,calls=h.pageCalls;
 for(let n=0;n<3;n++){h.hide();assert.equal(h.listenerCount,0);h.show();await h.settle();assert.equal(h.view.result,result);assert.equal(h.view.detail,detail);assert.equal(h.view.draft.text,'unsaved');assert.equal(h.view.filters.text,'applied');assert.equal(h.listenerCount,1);}
 assert.equal(h.pageCalls,calls);
});
test('Delivery Activity keeps cursor page rather than resetting to page one',async()=>{
 const h=harness();await h.settle();h.view.setCursors([null,'opaque']);h.view.setPage(1);await h.settle();const calls=h.pageCalls;h.hide();h.show();await h.settle();assert.equal(h.view.page,1);assert.equal(h.view.cursors[1],'opaque');assert.equal(h.pageCalls,calls);
});
test('Delivery back event closes child detail, then allows root Home fallback; hide cleans listener',async()=>{
 const h=harness();await h.settle();assert.equal(h.back().defaultPrevented,false);await h.view.openDetail(h.view.result.items[0]);await h.settle();const e=h.back();assert.equal(e.defaultPrevented,true);assert.equal(e.detail.handled,true);await h.settle();assert.equal(h.view.activeDetail,null);assert.equal(h.back().defaultPrevented,false);h.hide();assert.equal(h.listenerCount,0);
});
test('Delivery pending read is reused through hide/show; no hidden publication or duplicate request',async()=>{
 const h=harness();let resolve;h.setPending(new Promise(r=>{resolve=r;}));await h.settle();h.hide();h.show();await h.settle();assert.equal(h.pageCalls,1);resolve(h.response('deliveryReports',[h.row('report')]));await h.settle();assert.equal(h.view.result.items[0].id,'report');assert.equal(h.pageCalls,1);
});
test('Delivery refresh retains same-checkpoint rows/detail; changed checkpoint invalidates detail',async()=>{
 const h=harness();await h.settle();await h.view.openDetail(h.view.result.items[0]);await h.settle();const rows=h.view.result,detail=h.view.detail;
 let resolve;h.setPending(new Promise(r=>{resolve=r;}));h.view.setRefresh(x=>x+1);await h.settle();assert.equal(h.view.result,rows);assert.equal(h.view.detail,detail);resolve(h.response('deliveryReports',[h.row('report',{dispatchId:'dispatch'})]));await h.settle();assert.equal(h.view.detail,detail);
 h.setPending(null);h.setSync({state:'SYNCED',generation:'g2',seq:2});await h.settle();assert.equal(h.view.result.metadata.checkpoint.generation,'g2');assert.equal(h.view.activeDetail,null);
});
test('Delivery refresh permission loss clears data; logout denies stale content',async()=>{
 const h=harness();await h.settle();let reject;h.setPending(new Promise((_r,j)=>{reject=j;}));h.view.setRefresh(x=>x+1);await h.settle();reject(Object.assign(Error('raw private payload'),{code:'permission-denied'}));await h.settle();assert.equal(h.view.result,null);assert.equal(h.view.activeDetail,null);h.close();await h.settle();assert.equal(h.view.unavailable,true);h.hide();assert.equal(h.listenerCount,0);
});
test('Messages tab selection survives Activity without creating a listener or transport read',async()=>{
 const h=harness('messages');await h.settle();h.view.setSource('notifications');await h.settle();for(let i=0;i<3;i++){h.hide();h.show();await h.settle();assert.equal(h.view.source,'notifications');assert.equal(h.view.state.state,'NOT_PROVISIONED');}
 assert.equal(h.pageCalls,0);assert.equal(h.listenerCount,0);h.setProps({initialSource:'notifications'});await h.settle();h.setProps({initialSource:'messages'});await h.settle();assert.equal(h.view.source,'messages');h.close();await h.settle();assert.equal(h.view.state.state,'SESSION_UNAVAILABLE');
});
