import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {randomUUID} from 'node:crypto';
import {parse} from '@babel/parser';
import * as protocol from './warehouseDispatchOfflineProtocol.js';
import * as access from './warehouseDispatchAccess.js';
import {businessDayKey} from '../../utils/businessDate.js';
const source=fs.readFileSync(new URL('./OfflineWarehouseDispatchEditor.jsx',import.meta.url),'utf8'),tree=parse(source,{sourceType:'module',plugins:['jsx']});
const declarations=tree.program.body.map(n=>n.type==='ExportNamedDeclaration'?n.declaration:n);
const prelude=declarations.filter(n=>n?.type==='FunctionDeclaration'&&n.id.name==='dispatchWriteAccess'||n?.type==='VariableDeclaration'&&['emptyDraft','dispatchStatusLabel'].includes(n.declarations[0].id.name)).map(n=>source.slice(n.start,n.end)).join('\n');
const component=tree.program.body.find(n=>n.type==='ExportDefaultDeclaration').declaration,last=component.body.body.at(-1);
const code=source.slice(component.start,last.start)+'return {draft,record,preview,error,saved,busy,attempted,awaiting,canWrite,canArchive,prepare,submit,change,close,reviewConflict,setArchiveConfirmed,picker,setPicker};'+source.slice(last.end,component.end);
const document=await protocol.planDispatch(null,'warehouseDispatch.create',protocol.buildDispatchValues({customerId:'c',productId:'p',pieceCount:2,quantityUnit:'Con',weightKg:3,date:businessDayKey(Date.now())}),{id:'wd_t_original',tenantId:'t',employeeId:'e',editedAt:new Date().toISOString(),mutationId:'original',customer:{id:'c',companyId:'t',name:'C'},product:{id:'p',companyId:'t',name:'P',unit:'Con',price:10}});
function harness({id=document.id,ready=true,caps}={}){
 const scope={tenantId:'t',principalId:'u',permissionRevision:'r',sessionId:'s'},slots=[],listeners=new Set(),writes=[];let index=0,dirty=true,hidden=false,reattach=false,effects=[],view,confirm=true,closed=0,fail=false,back=null,readCalls=0;
 const record={document:structuredClone(document),state:'SERVER_CONFIRMED',commandId:null,receipt:null};
 const runtime={scope,expiresAtMs:Date.now()+100000,isCurrent:()=>true,capabilities:caps||['home.read','home.dispatches.read','home.stock.read','home.debt.read','customers.read',protocol.DISPATCH_OUTSIDE_CAP,protocol.DISPATCH_HISTORY_CAP,...Object.values(protocol.DISPATCH_RULES).map(x=>x.capability)],appSession:{currentUser:{id:'e',companyId:'t',firebaseUid:'u',accountType:'employee'},currentCompany:{id:'t'}},subscribe:f=>{listeners.add(f);return()=>listeners.delete(f);}};
 const write=type=>async(...args)=>{writes.push({type,args});if(fail)throw Error('unknown commit');record.commandId=args.at(-1).mutationId;record.state='PENDING_SYNC';return {commandId:record.commandId,entityId:document.id,state:record.state,serverConfirmed:false};};
 const repository={scope,employeeId:'e',ready,protocolVersion:1,detail:async()=>{readCalls++;return structuredClone(record);},preview:async()=>({...record.document,note:'preview'}),create:write('create'),update:write('update'),archive:write('archive')};
 const useState=initial=>{const i=index++;slots[i]??={value:typeof initial==='function'?initial():initial};return [slots[i].value,value=>{const next=typeof value==='function'?value(slots[i].value):value;if(!Object.is(next,slots[i].value)){slots[i].value=next;dirty=true;}}];};
 const useRef=initial=>{const i=index++;slots[i]??={current:initial};return slots[i];};
 const effect=(work,deps)=>{const i=index++,old=slots[i],changed=reattach||!old||!deps||deps.some((d,n)=>!Object.is(d,old.deps[n]));slots[i]={...old,deps};if(changed)effects.push(()=>{old?.cleanup?.();slots[i].cleanup=work();});};
 const context=vm.createContext({...protocol,...access,businessDayKey,useState,useRef,useEffect:effect,useLayoutEffect:effect,useAppScreenBack:callback=>{back=callback;},document:{activeElement:{focus(){}}},window:{confirm:()=>confirm},globalThis:{crypto:{randomUUID}}});
 const render=vm.runInContext(prelude+'\n'+code+'\nOfflineWarehouseDispatchEditor',context),closeRequestRef={current:null};
 const props={runtime,repository,id,closeRequestRef,onClose:()=>{closed++;},onSaved:()=>{}};
 async function settle(){for(let n=0;n<35;n++){if(dirty&&!hidden){dirty=false;index=0;effects=[];view=render(props);reattach=false;for(const fn of effects)fn();}await Promise.resolve();await Promise.resolve();if(!dirty&&n>5)return;}throw Error('render not settled');}
 return {runtime,repository,record,writes,settle,props,closeRequestRef,get view(){return view;},get reads(){return readCalls;},get closed(){return closed;},get listeners(){return listeners.size;},setConfirm:v=>{confirm=v;},setFail:v=>{fail=v;},back:()=>back(),emit:topic=>{for(const f of listeners)f(topic);},hide(){for(const slot of slots)slot.cleanup?.();hidden=true;},show(){hidden=false;reattach=true;dirty=true;},rerender(){dirty=true;}};
}
test('actual editor requires signed-ready boundary and explicit reviewed preview before local enqueue',async()=>{
 const h=harness();await h.settle();assert.equal(h.view.canWrite,true);await h.view.submit(null);assert.equal(h.writes.length,0);await h.view.prepare();await h.settle();await h.view.submit(null);assert.equal(h.writes.length,1);assert.equal(h.writes[0].type,'update');assert.deepEqual(h.writes[0].args[2].base,document);assert.equal(h.writes[0].args[2].expectedPlan.note,'preview');
 const unavailable=harness({ready:false});await unavailable.settle();assert.equal(unavailable.view.canWrite,false);
 const denied=harness({caps:['home.read','home.dispatches.read']});await denied.settle();await denied.view.prepare();assert.equal(denied.view.preview,null);
});
test('Activity hide/show preserves unsaved draft and pinned CAS, ignores unrelated progress and owns one back hook/subscription',async()=>{
 const h=harness();await h.settle();h.view.change('note','unsaved');await h.settle();const before=h.reads;h.emit('home-status');await h.settle();assert.equal(h.reads,before);h.hide();assert.equal(h.listeners,0);h.show();await h.settle();assert.equal(h.listeners,1);assert.equal(h.view.draft.note,'unsaved');assert.deepEqual(h.view.record.document,document);
 h.setConfirm(false);h.back();assert.equal(h.closed,0);h.setConfirm(true);h.back();assert.equal(h.closed,1);
});
test('new remote body never rebases open draft; own queued state can advance without erasing saved intent',async()=>{
 const h=harness();await h.settle();h.view.change('note','mine');await h.settle();h.record.document.note='remote';h.emit('warehouseDispatches');await h.settle();assert.equal(h.view.record.sourceChanged,true);assert.equal(h.view.draft.note,'mine');await h.view.prepare();assert.equal(h.view.preview,null);
 const own=harness();await own.settle();await own.view.prepare();await own.settle();await own.view.submit(null);await own.settle();assert.equal(own.view.record.state,'PENDING_SYNC');own.record.state='SYNCING';own.emit('warehouseDispatches');await own.settle();assert.equal(own.view.saved.state,'SYNCING');
});
test('archive requires explicit confirmation; uncertain save freezes draft and reuses same command identity',async()=>{
 const h=harness();await h.settle();await h.view.submit(null,true);assert.equal(h.writes.length,0);h.view.setArchiveConfirmed(true);await h.settle();await h.view.submit(null,true);assert.equal(h.writes[0].type,'archive');assert.deepEqual(h.writes[0].args[1].base,document);
 const retry=harness();await retry.settle();await retry.view.prepare();await retry.settle();retry.setFail(true);await retry.view.submit(null);await retry.settle();const mutationId=retry.writes[0].args[2].mutationId;retry.view.change('note','different');await retry.settle();assert.equal(retry.view.draft.note,document.note);await retry.view.submit(null);assert.equal(retry.writes[1].args[2].mutationId,mutationId);
});
test('scope or route identity replacement with retained component never exposes old form; picker back closes picker first',async()=>{
 const h=harness();await h.settle();h.view.setPicker('products');await h.settle();h.back();await h.settle();assert.equal(h.view.picker,null);assert.equal(h.closed,0);h.props.id='other';h.rerender();await h.settle();assert.equal(h.view,null);
 const scope=harness();await scope.settle();scope.runtime.scope={...scope.runtime.scope,tenantId:'other'};scope.rerender();await scope.settle();assert.equal(scope.view,null);
});
