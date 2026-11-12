import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {parse} from '@babel/parser';
import traverseModule from '@babel/traverse';
import * as protocol from './stockCountProtocol.js';
import {assertWarehouseRuntime,warehouseErrorMessage} from './offlineWarehouseModel.js';
import {businessDayKey} from '../../utils/businessDate.js';
const traverse=traverseModule.default||traverseModule;
const text=fs.readFileSync(new URL('./OfflineStockCountEditor.jsx',import.meta.url),'utf8'),ast=parse(text,{sourceType:'module',plugins:['jsx']});let target;
traverse(ast,{FunctionDeclaration(p){if(p.node.id?.name==='OfflineStockCountEditor')target=p;}});
const prelude=ast.program.body.map(n=>n.type==='ExportNamedDeclaration'?n.declaration:n).filter(n=>n?.type==='FunctionDeclaration'&&n.id.name==='stockCountWriteAccess'||n?.type==='VariableDeclaration'&&['emptyDraft','statusLabel'].includes(n.declarations[0].id.name)).map(n=>text.slice(n.start,n.end)).join('\n');
const last=target.get('body').get('body').at(-1).node;let fn=text.slice(target.node.start,target.node.end);
fn=fn.slice(0,last.start-target.node.start)+'return {draft,record,loadError,saving,notice,saved,reviewed,confirmArchive,canWrite,canArchive,awaiting,editError,change,submit,reviewConflict,setConfirmArchive};'+fn.slice(last.end-target.node.start);
let pendingTarget;traverse(ast,{FunctionDeclaration(p){if(p.node.id?.name==='OfflineStockCountPending')pendingTarget=p;}});
const pendingLast=pendingTarget.get('body').get('body').at(-1).node;
const pendingFn=text.slice(pendingTarget.node.start,pendingLast.start)+'return {value,loaded,page,cursors,key,queryKey,setReload,setPage,setCursors};'+text.slice(pendingLast.end,pendingTarget.node.end);

function harness({id=null,state='SERVER_CONFIRMED',ready=true,caps=null,kind='editor'}={}){
 const scope={tenantId:'t',principalId:'u',permissionRevision:'r',sessionId:'s',projectId:'demo-test'};let active=true,pending=null,reads=0,pageReads=0,writes=[];const listeners=new Set();
 const base={id:id||'wsc_original',companyId:'t',groupName:'Vịt',quantity:0,totalKg:0,quantityUnit:'Con',countedMeasures:[{unit:'Con',quantity:0}],date:'2026-11-09',reason:'',note:'old'};
 const record={document:base,base,state,commandId:'old',receipt:state==='CONFLICT_REQUIRES_REVIEW'?{outcome:'conflict',currentDocument:{...base,note:'server'},currentFingerprint:'f'}:null};
 const runtime={scope,expiresAtMs:Date.now()+100000,isCurrent:()=>active,capabilities:caps||['home.read','home.stock.read','stockCounts.create','stockCounts.update','stockCounts.archive','stockCounts.reason'],appSession:{currentUser:{id:'e',accountType:'employee',companyId:'t',firebaseUid:'u'},currentCompany:{id:'t',productGroups:['Vịt']}}};
 runtime.subscribe=fn=>{listeners.add(fn);return()=>listeners.delete(fn);};
 const write=kind=>async(...args)=>{writes.push({kind,args});record.state='PENDING_SYNC';record.commandId='new';record.document={...record.document,id:id||'wsc_new'};return pending||{commandId:'new',entityId:id||'wsc_new',state:'PENDING_SYNC',serverConfirmed:false};};
 const repository={scope,employeeId:'e',ready,protocolVersion:ready?1:0,detail:async()=>{reads++;return structuredClone(record);},page:async()=>{pageReads++;return {items:[{id:base.id,document:structuredClone(record.document),state:record.state}],hasMore:false,nextCursor:null};},create:write('create'),update:write('update'),archive:write('archive')};
 let index=0,dirty=true,reattach=false,effects=[],view,props={id,runtime,repository,onSaved:()=>{}};const slots=[];
 const useState=initial=>{const i=index++;if(!slots[i])slots[i]={value:typeof initial==='function'?initial():initial};return [slots[i].value,value=>{const next=typeof value==='function'?value(slots[i].value):value;if(!Object.is(next,slots[i].value)){slots[i].value=next;dirty=true;}}];};
 const useRef=initial=>{const i=index++;if(!slots[i])slots[i]={current:initial};return slots[i];};
 const useEffect=(work,deps)=>{const i=index++,old=slots[i],changed=reattach||!old||deps.some((d,n)=>!Object.is(d,old.deps[n]));slots[i]={...old,deps};if(changed)effects.push(()=>{old?.cleanup?.();slots[i].cleanup=work();});};
 const context=vm.createContext({...protocol,assertWarehouseRuntime,warehouseErrorMessage,businessDayKey,useState,useRef,useEffect,crypto:globalThis.crypto});
 const component=vm.runInContext(prelude+'\n'+(kind==='editor'?fn+'\nOfflineStockCountEditor;':pendingFn+'\nOfflineStockCountPending;'),context);
 async function settle(){for(let n=0;n<12;n++){if(dirty){dirty=false;index=0;effects=[];view=component(props);reattach=false;for(const effect of effects)effect();}await new Promise(resolve=>setImmediate(resolve));}return view;}
 return {settle,get view(){return view;},get reads(){return reads;},get pageReads(){return pageReads;},get listenerCount(){return listeners.size;},emit:topic=>{for(const listener of listeners)listener(topic);},writes,base,runtime,record,setPending:value=>{pending=value;},hide(){for(const slot of slots)slot.cleanup?.();},show(){reattach=true;dirty=true;},close(){active=false;dirty=true;}};
}
test('editor retains draft/base through Activity with one status catch-up per reattach',async()=>{
 const h=harness({id:'wsc_a'});await h.settle();assert.equal(h.reads,1);h.view.change('note','unsaved');h.view.change('quantity','0');await h.settle();for(let n=0;n<3;n++){h.hide();assert.equal(h.listenerCount,0);h.show();await h.settle();assert.equal(h.view.draft.note,'unsaved');assert.equal(h.view.draft.quantity,'0');assert.equal(h.listenerCount,1);}assert.equal(h.reads,4);
});
test('ready repo and explicit signed capability required; cannot fabricate stock write rights',async()=>{
 for(const options of [{ready:false},{caps:['home.read','home.stock.read']}]){const h=harness(options);await h.settle();h.view.change('groupName','Vịt');h.view.change('quantity','0');await h.settle();await h.view.submit({preventDefault(){}});assert.equal(h.writes.length,0);assert.equal(h.view.canWrite,false);}
});
test('zero create queues exactly once on double-submit and reports pending, not server success',async()=>{
 const h=harness();await h.settle();h.view.change('groupName','Vịt');h.view.change('quantity','0');await h.settle();let resolve;h.setPending(new Promise(r=>{resolve=r;}));const first=h.view.submit({preventDefault(){}});await h.view.submit({preventDefault(){}});assert.equal(h.writes.length,1);resolve({commandId:'new',state:'PENDING_SYNC',serverConfirmed:false});await first;await h.settle();assert(h.view.notice.includes('Chờ đồng bộ'));assert.equal(h.view.saved.serverConfirmed,false);assert(!h.view.notice.includes('Máy chủ đã xác nhận'));
});
test('archive needs confirmation and separate capability; preserves full base for CAS',async()=>{
 const h=harness({id:'wsc_a'});await h.settle();await h.view.submit({preventDefault(){}},true);assert.equal(h.writes.length,0);h.view.setConfirmArchive(true);await h.settle();await h.view.submit({preventDefault(){}},true);assert.equal(h.writes[0].kind,'archive');assert.deepEqual(h.writes[0].args[1].base,h.base);
});
test('review conflict explicitly loads server base and creates a new resolution intent',async()=>{
 const h=harness({id:'wsc_a',state:'CONFLICT_REQUIRES_REVIEW'});await h.settle();assert.equal(h.view.awaiting,true);h.view.reviewConflict();await h.settle();assert.equal(h.view.draft.note,'server');assert.equal(h.view.awaiting,false);h.view.change('note','reviewed');await h.settle();await h.view.submit({preventDefault(){}});assert.equal(h.writes[0].args[2].resolvesConflictId,'old');assert.equal(h.writes[0].args[2].base.note,'server');assert.equal(h.record.document.note,'old');
});
test('logout removes form content; source component parses without unknown globals',async()=>{
 const h=harness({id:'wsc_a'});await h.settle();h.close();await h.settle();assert.equal(h.view,null);
 const globals=new Set(['Object','Array','JSON','Promise','Error','Number','Boolean','Date','String','Set','globalThis','undefined']);
 traverse(ast,{ReferencedIdentifier(p){if(!p.scope.getBinding(p.node.name))assert(globals.has(p.node.name),'Unresolved '+p.node.name);}});
 assert(!/addEventListener|fetch\(|createConnection/.test(text));
 assert.equal((text.match(/runtime\.subscribe\?\./g)||[]).length,2);
});
test('pending list refreshes on claim/receipt/fail without manual action, with Activity cleanup',async()=>{
 const h=harness({kind:'pending',state:'PENDING_SYNC'});await h.settle();assert.equal(h.pageReads,1);assert.equal(h.listenerCount,1);assert.equal(h.view.value.items[0].state,'PENDING_SYNC');
 h.emit('home');await h.settle();assert.equal(h.pageReads,1);
 for(const state of ['SYNCING','SYNCED','SYNC_FAILED','CONFLICT_REQUIRES_REVIEW']){h.record.state=state;h.emit('stockCounts');await h.settle();assert.equal(h.view.value.items[0].state,state);}
 assert.equal(h.pageReads,5);h.hide();assert.equal(h.listenerCount,0);h.record.state='SYNCED';h.emit('stockCounts');await h.settle();assert.equal(h.pageReads,5);h.show();await h.settle();assert.equal(h.listenerCount,1);assert.equal(h.pageReads,6);assert.equal(h.view.value.items[0].state,'SYNCED');
 h.emit('stockCounts');await h.settle();assert.equal(h.pageReads,7);h.hide();assert.equal(h.listenerCount,0);
});
test('editor receipt refresh updates saved status without resetting draft or double subscription',async()=>{
 const h=harness();await h.settle();h.view.change('groupName','Vịt');h.view.change('quantity','0');h.view.change('note','local draft');await h.settle();await h.view.submit({preventDefault(){}});await h.settle();assert.equal(h.view.saved.state,'PENDING_SYNC');assert.equal(h.listenerCount,1);
 h.record.state='SYNCED';h.emit('stockCounts');await h.settle();assert.equal(h.view.saved.state,'SYNCED');assert.equal(h.view.saved.serverConfirmed,true);assert.equal(h.view.notice,'Máy chủ đã xác nhận');assert.equal(h.view.draft.note,'local draft');
 h.hide();assert.equal(h.listenerCount,0);h.show();await h.settle();assert.equal(h.listenerCount,1);assert.equal(h.view.saved.state,'SYNCED');
});
test('external changed base is not silently adopted under an unsaved editor draft',async()=>{
 const h=harness({id:'wsc_a'});await h.settle();h.view.change('note','unsaved');await h.settle();h.record.base={...h.base,note:'server changed'};h.record.document=h.record.base;h.emit('stockCounts');await h.settle();assert.equal(h.view.draft.note,'unsaved');assert.equal(h.view.record.base.note,'old');assert.equal(h.view.record.sourceChanged,true);assert.equal(h.view.awaiting,true);await h.view.submit({preventDefault(){}});assert.equal(h.writes.length,0);
});
