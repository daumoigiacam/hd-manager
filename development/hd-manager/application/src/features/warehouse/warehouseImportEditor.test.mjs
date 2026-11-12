import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {parse} from '@babel/parser';
import traverseModule from '@babel/traverse';
import * as protocol from './warehouseImportProtocol.js';
import {businessDayKey} from '../../utils/businessDate.js';
const traverse=traverseModule.default||traverseModule;
const editor=fs.readFileSync(new URL('./OfflineWarehouseImportEditor.jsx',import.meta.url),'utf8'),queue=fs.readFileSync(new URL('./OfflineWarehouseImportQueue.jsx',import.meta.url),'utf8');
const ast=parse(editor,{sourceType:'module',plugins:['jsx']}),queueAst=parse(queue,{sourceType:'module',plugins:['jsx']});
const prelude=ast.program.body.map(n=>n.type==='ExportNamedDeclaration'?n.declaration:n).filter(n=>n?.type==='FunctionDeclaration'&&n.id.name==='importWriteAccess'||n?.type==='VariableDeclaration'&&['emptyDraft','importStatusLabel'].includes(n.declarations[0].id.name)).map(n=>editor.slice(n.start,n.end)).join('\n');
function functionalSource(ast,text,name,result){let target;traverse(ast,{FunctionDeclaration(p){if(p.node.id?.name===name)target=p;}});const last=target.node.body.body.at(-1);return text.slice(target.node.start,last.start)+`return ${result};`+text.slice(last.end,target.node.end);}
const editorFn=functionalSource(ast,editor,'OfflineWarehouseImportEditor','{draft,record,groups,error,notice,saved,saving,confirmArchive,reviewed,attempted,canWrite,canArchive,awaiting,change,submit,reviewConflict,close,setConfirmArchive}');
const queueFn=functionalSource(queueAst,queue,'OfflineWarehouseImportQueue','{loaded,value,page,cursors,key,queryKey,setPage,setCursors,setReload}');
function harness({id=null,kind='editor',ready=true,capabilities=null,readSource='local'}={}){
 const scope={tenantId:'t',principalId:'u',permissionRevision:'r',sessionId:'s'};let active=true,hidden=false,reads=0,pages=0,index=0,dirty=true,reattach=false,effects=[],view,fail=false,confirm=true,closedCount=0,writeGate=null;const writes=[],listeners=new Set(),slots=[],closeRequestRef={current:null},detailCalls=[];
 const pair={document:{id:id||'wi_created',companyId:'t',groupName:'Vịt',quantity:2,totalKg:1,quantityUnit:'Con',purchaseUnit:'Kg',unitPrice:10,date:'2026-11-09',sourceType:'purchase_resale',extraMeasures:[],note:'old'},expense:{id:'exp_warehouse_import_'+(id||'wi_created'),companyId:'t',sourceWarehouseImportId:id||'wi_created',sourceType:'warehouse_import_purchase',amount:10}};
 const record={pair,base:structuredClone(pair),state:'SERVER_CONFIRMED',commandId:'old',receipt:null};
 const runtime={scope,isCurrent:()=>active,expiresAtMs:Date.now()+100000,capabilities:capabilities||['home.read','home.imports.read','home.cashflow.read',...Object.values(protocol.IMPORT_RULES).map(r=>r.capability)],appSession:{currentUser:{id:'e',companyId:'t',firebaseUid:'u',accountType:'employee'},currentCompany:{id:'t'}},subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);}};
 const write=type=>async(...args)=>{writes.push({type,args});if(writeGate)await writeGate;if(fail)throw Error('unknown write outcome');record.state='PENDING_SYNC';record.commandId=args.at(-1).mutationId;return {commandId:record.commandId,entityId:pair.document.id,state:'PENDING_SYNC',serverConfirmed:false};};
 const repository={scope,employeeId:'e',ready,protocolVersion:1,groups:async()=>({items:['Vịt','Gà']}),detail:async(id,options)=>{reads++;detailCalls.push({id,preferFeed:options?.preferFeed});return structuredClone(record);},page:async()=>{pages++;return {items:[{id:pair.document.id,pair:structuredClone(pair),state:record.state}],hasMore:false,nextCursor:null};},create:write('create'),update:write('update'),archive:write('archive')};
 const useState=initial=>{const i=index++;if(!slots[i])slots[i]={value:typeof initial==='function'?initial():initial};return [slots[i].value,v=>{const n=typeof v==='function'?v(slots[i].value):v;if(!Object.is(n,slots[i].value)){slots[i].value=n;dirty=true;}}];};
 const useRef=value=>{const i=index++;if(!slots[i])slots[i]={current:value};return slots[i];};
 const useEffect=(work,deps)=>{const i=index++,old=slots[i],changed=reattach||!old||!deps||deps.some((d,n)=>!Object.is(d,old.deps[n]));slots[i]={...old,deps};if(changed)effects.push(()=>{old?.cleanup?.();slots[i].cleanup=work();});};
 const context=vm.createContext({...protocol,businessDayKey,useState,useRef,useEffect,useLayoutEffect:useEffect,useAppScreenBack:()=>{},window:{confirm:()=>confirm},globalThis:{crypto:{randomUUID:()=>crypto.randomUUID()}}});
 const component=vm.runInContext(prelude+'\n'+(kind==='editor'?editorFn:queueFn)+'\n'+(kind==='editor'?'OfflineWarehouseImportEditor':'OfflineWarehouseImportQueue'),context);
 const props={runtime,repository,id,readSource,closeRequestRef,onClose:()=>{closedCount++;},onEdit:()=>{}};
 async function settle(){for(let n=0;n<30;n++){if(dirty&&!hidden){dirty=false;index=0;effects=[];view=component(props);const todo=effects;effects=[];reattach=false;for(const f of todo)f();}await Promise.resolve();await Promise.resolve();if(!dirty&&n>4)return;}throw Error('did not settle');}
 return {runtime,repository,record,pair,writes,settle,closeRequestRef,detailCalls,get closedCount(){return closedCount;},get view(){return view;},get reads(){return reads;},get pages(){return pages;},get listenerCount(){return listeners.size;},emit(topic='warehouseImports'){for(const fn of [...listeners])fn(topic);},hide(){for(const s of slots)s.cleanup?.();hidden=true;},show(){hidden=false;reattach=true;dirty=true;},setFail(v){fail=v;},setConfirm(v){confirm=v;},setWriteGate(v){writeGate=v;},close(){active=false;dirty=true;},rerender(){dirty=true;}};
}
test('editor uses real ready repository/capabilities; no default unit or implicit group creation',async()=>{
 const h=harness();await h.settle();assert(h.view.canWrite);assert.equal(h.view.draft.quantityUnit,'');assert.equal(h.view.draft.purchaseUnit,'');await h.view.submit({preventDefault(){}});assert.equal(h.writes.length,0);
 const denied=harness({ready:false});await denied.settle();assert(!denied.view.canWrite);
 const noCap=harness({capabilities:['home.read','home.imports.read','home.cashflow.read']});await noCap.settle();assert(!noCap.view.canWrite);
});
test('edit/archive pass pinned BOTH-document CAS base and original field values',async()=>{
 const h=harness({id:'wi_a'});await h.settle();h.view.change('note','changed');await h.settle();await h.view.submit({preventDefault(){}});assert.equal(h.writes[0].type,'update');assert.deepEqual(h.writes[0].args[2].base,h.pair);
 const a=harness({id:'wi_a'});await a.settle();await a.view.submit(null,true);assert.equal(a.writes.length,0);a.view.setConfirmArchive(true);await a.settle();await a.view.submit(null,true);assert.equal(a.writes[0].type,'archive');assert.deepEqual(a.writes[0].args[1].base,a.pair);
});
test('editor submits displayed pair even if a malformed detail adapter returns a newer unseen base',async()=>{
 const h=harness({id:'wi_a'});h.record.base={document:{...h.pair.document,note:'unseen newer body',offlineRevision:3},expense:{...h.pair.expense,amount:999}};
 await h.settle();assert.equal(h.view.draft.note,'old');await h.view.submit(null);assert.deepEqual(h.writes[0].args[2].base,h.pair);assert.notEqual(h.writes[0].args[2].base.expense.amount,999);
});
test('main-list editor opts into feed reads; own-receipt editor defaults local',async()=>{
 const queue=harness({id:'wi_a'});await queue.settle();assert.equal(queue.detailCalls[0].preferFeed,false);
 const main=harness({id:'wi_a',readSource:'feed'});main.record.pair={document:{...main.pair.document,note:'fresh remote before reopen'},expense:{...main.pair.expense,amount:77}};main.record.base=structuredClone(main.record.pair);
 await main.settle();assert.equal(main.detailCalls[0].preferFeed,true);assert.equal(main.view.draft.note,'fresh remote before reopen');await main.view.submit(null);assert.deepEqual(main.writes[0].args[2].base,main.record.pair);
});
test('already-open feed editor never replaces draft/base when a later refresh sees a remote pair',async()=>{
 const h=harness({id:'wi_a',readSource:'feed'});await h.settle();h.view.change('note','unsaved local form');await h.settle();
 const before=structuredClone(h.view.record.pair);h.record.pair={document:{...h.pair.document,note:'unseen remote'},expense:{...h.pair.expense,amount:999}};h.record.base=structuredClone(h.record.pair);h.emit();await h.settle();
 assert.equal(h.view.draft.note,'unsaved local form');assert.deepEqual(h.view.record.pair,before);assert.deepEqual(h.view.record.base,before);assert.equal(h.view.record.sourceChanged,true);assert.equal(h.detailCalls.at(-1).preferFeed,true);
});
test('Activity hide/show preserves draft and groups; one subscription, active receipt catch-up',async()=>{
 const h=harness({id:'wi_a'});await h.settle();h.view.change('note','unsaved');await h.settle();const before=h.reads;assert.equal(h.listenerCount,1);h.hide();assert.equal(h.listenerCount,0);h.emit();await h.settle();assert.equal(h.reads,before);h.show();await h.settle();assert.equal(h.listenerCount,1);assert.equal(h.view.draft.note,'unsaved');assert.equal(h.reads,before+1);
});
test('expense-only external change pins old base and draft until reopened; no silent rebase',async()=>{
 const h=harness({id:'wi_a'});await h.settle();h.view.change('note','unsaved');await h.settle();h.record.base={...h.record.base,expense:{...h.pair.expense,amount:77}};h.emit();await h.settle();assert(h.view.record.sourceChanged);assert(h.view.awaiting);assert.equal(h.view.draft.note,'unsaved');assert.equal(h.view.record.base.expense.amount,10);await h.view.submit(null);assert.equal(h.writes.length,0);
});
test('automatic claim/receipt/failure status updates do not reset draft or duplicate listener',async()=>{
 const h=harness({id:'wi_a'});await h.settle();await h.view.submit(null);await h.settle();for(const state of ['SYNCING','SYNCED','SYNC_FAILED','CONFLICT_REQUIRES_REVIEW']){h.record.state=state;h.emit();await h.settle();assert.equal(h.view.saved.state,state);}assert.equal(h.listenerCount,1);
});
test('uncertain save locks draft and retries same immutable ID; never submits changed intent',async()=>{
 const h=harness({id:'wi_a'});await h.settle();h.setFail(true);await h.view.submit(null);await h.settle();assert(h.view.attempted);const id=h.writes[0].args[2].mutationId;h.view.change('note','duplicate risk');await h.settle();assert.equal(h.view.draft.note,'old');await h.view.submit(null);assert.equal(h.writes[1].args[2].mutationId,id);
});
test('queue refreshes active claim/receipt/failure, retains same-query rows and cleanup on Activity hide',async()=>{
 const h=harness({kind:'queue'});await h.settle();assert.equal(h.pages,1);assert.equal(h.listenerCount,1);for(const state of ['PENDING_SYNC','SYNCING','SYNCED']){h.record.state=state;h.emit();await h.settle();assert.equal(h.view.value.items[0].state,state);}h.hide();assert.equal(h.listenerCount,0);h.show();await h.settle();assert.equal(h.listenerCount,1);assert.equal(h.pages,5);
});
test('logout hides editor/queue and source has no new connections, network or native listeners',async()=>{
 for(const kind of ['editor','queue']){const h=harness({kind});await h.settle();h.close();await h.settle();assert.equal(h.view,null);}
 const globals=new Set(['Object','JSON','Number','Boolean','Date','String','Error','globalThis','window','undefined']);
 for(const tree of [ast,queueAst])traverse(tree,{ReferencedIdentifier(p){if(!p.scope.hasBinding(p.node.name))assert(globals.has(p.node.name),'Unresolved '+p.node.name);}});
 assert(!/fetch\(|createConnection|addEventListener/.test(editor+queue));assert.equal((editor.match(/runtime\.subscribe\?\./g)||[]).length,1);assert.equal((queue.match(/runtime\.subscribe\?\./g)||[]).length,1);
});
test('parent close ref delegates current dirty confirmation, cancellation and Activity cleanup',async()=>{
 const h=harness({id:'wi_a'});await h.settle();assert.equal(typeof h.closeRequestRef.current,'function');h.view.change('note','dirty');await h.settle();
 h.setConfirm(false);assert.equal(h.closeRequestRef.current(),true);assert.equal(h.closedCount,0);assert.equal(h.view.draft.note,'dirty');
 h.setConfirm(true);assert.equal(h.closeRequestRef.current(),true);assert.equal(h.closedCount,1);
 h.hide();assert.equal(h.closeRequestRef.current,null);h.show();await h.settle();assert.equal(typeof h.closeRequestRef.current,'function');
});
test('parent delegated close consumes back during in-flight write and closes after saved outcome',async()=>{
 const h=harness({id:'wi_a'});await h.settle();let finish;h.setWriteGate(new Promise(resolve=>{finish=resolve;}));const saving=h.view.submit(null);await h.settle();assert(h.view.saving);
 assert.equal(h.closeRequestRef.current(),true);assert.equal(h.closedCount,0);finish();await saving;await h.settle();assert(h.view.saved);h.setConfirm(false);assert.equal(h.closeRequestRef.current(),true);assert.equal(h.closedCount,1);
});
