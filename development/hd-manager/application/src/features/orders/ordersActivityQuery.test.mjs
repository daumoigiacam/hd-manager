import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {setImmediate as settle} from 'node:timers/promises';
import {parse} from '@babel/parser';
import {ordersQueryKey} from './ordersRetainedState.js';
import {searchMark,startSearchTrace} from '../../data/crmSearchTrace.js';

// Run the ACTUAL OrdersWorkspace effect callbacks with retained refs and state.
// This exercises Activity detach/reattach and asynchronous races without an app
// build, native device, SQL connection, or a reimplementation of the callbacks.
const source=await readFile(new URL('./SQLiteProductOrders.jsx',import.meta.url),'utf8');
const tree=parse(source,{sourceType:'module',plugins:['jsx']});
const workspace=tree.program.body.find(node=>node.type==='FunctionDeclaration'&&node.id.name==='OrdersWorkspace');
const calls=workspace.body.body.filter(node=>node.type==='ExpressionStatement'&&node.expression.type==='CallExpression').map(node=>node.expression);
const effect=calls.find(node=>node.callee.name==='useEffect'&&source.slice(node.arguments[0].start,node.arguments[0].end).includes('verifyReadAccess'));
const layout=calls.find(node=>node.callee.name==='useLayoutEffect'&&source.slice(node.arguments[0].start,node.arguments[0].end).includes('setBusy(true)'));
assert.ok(effect&&layout,'test must execute the retained query and authority-gating callbacks');
const callback=(node,environment)=>Function(...Object.keys(environment),'return ('+source.slice(node.arguments[0].start,node.arguments[0].end)+');')(...Object.values(environment));
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const scope={tenantId:'tenant-a',principalId:'user-a',permissionRevision:'revision-1',sessionId:'session-1'};
function harness(){
 const state={page:null,busy:true,error:''},reads=[],proofs=[],publications=[];
 const completedQuery={current:null},pageTrace={current:0};
 const runtime={scope,expiresAtMs:Date.now()+60000,isCurrent:()=>true};
 const rows=Array.from({length:25},(_,id)=>({id:'order-'+id}));
 const behavior={page:async()=>({rows,nextCursor:'next-25'}),verify:async()=>undefined};
 const repo={page:async options=>{reads.push(options);return behavior.page(options);},verifyReadAccess:async search=>{proofs.push(search);return behavior.verify(search);}};
 let props={repo,runtime,search:'',filters:{from:'',to:'',state:''},queryKey:ordersQueryKey(scope,'',{from:'',to:'',state:''}),cursor:null,epoch:0,refresh:0};
 return {state,reads,proofs,publications,completedQuery,repo,runtime,rows,behavior,
  attach(changes={}){
   props={...props,...changes};
   const environment={...props,completedQuery,pageTrace,searchMark,startSearchTrace,current:value=>value.isCurrent()&&Date.now()<value.expiresAtMs,errorText:error=>error.message,
    setBusy:value=>{state.busy=value;},setError:value=>{state.error=value;},setPage:value=>{state.page=value;publications.push(value);}};
   callback(layout,environment)();
   return callback(effect,environment)();
  },
 };
}

test('exact completed-query reattach verifies authority only and preserves the same 25 row objects',async()=>{
 const h=harness();let detach=h.attach();await settle();
 assert.equal(h.reads.length,1);assert.equal(h.state.busy,false);const retained=h.state.page;
 for(let show=0;show<3;show++){
  detach();const proof=deferred();h.behavior.verify=()=>proof.promise;
  detach=h.attach();assert.equal(h.state.busy,true,'actions stay disabled until authority resolves');
  assert.equal(h.state.page,retained);assert.equal(h.state.page.rows,h.rows);assert.equal(h.reads.length,1);
  proof.resolve();await settle();assert.equal(h.state.busy,false);assert.equal(h.state.page,retained);
 }
 assert.equal(h.proofs.length,3);assert.equal(h.publications.length,1,'reattach must not republish/reset rows');detach();
});

test('repo, runtime/scope, query, cursor, epoch and explicit refresh changes each require actual page SQL',async()=>{
 const cases=[
  {name:'query',change:h=>({search:'fish',queryKey:ordersQueryKey(scope,'fish',{from:'',to:'',state:''})})},
  {name:'cursor',change:()=>({cursor:'next-25'})},
  {name:'epoch',change:()=>({epoch:1})},
  {name:'refresh',change:()=>({refresh:1})},
  {name:'scope',change:h=>({runtime:{...h.runtime,scope:{...scope,principalId:'user-b'}},queryKey:ordersQueryKey({...scope,principalId:'user-b'},'',{from:'',to:'',state:''})})},
  {name:'runtime owner',change:h=>({runtime:{...h.runtime}})},
 ];
 for(const entry of cases){const h=harness();const detach=h.attach();await settle();detach();const next=h.attach(entry.change(h));assert.equal(h.state.busy,true,entry.name);await settle();assert.equal(h.reads.length,2,entry.name);assert.equal(h.proofs.length,0,entry.name);next();}
 const h=harness();const detach=h.attach();await settle();detach();let newReads=0;
 const other={page:async()=>{newReads++;return {rows:[]};},verifyReadAccess:async()=>{throw Error('must not reuse another repository');}};
 h.attach({repo:other});await settle();assert.equal(newReads,1);assert.equal(h.proofs.length,0);
});

test('lease rejection invalidates completion and clears protected rows; next identical show performs SQL',async()=>{
 const h=harness();let detach=h.attach();await settle();detach();
 h.behavior.verify=async()=>{throw Object.assign(Error('permission revoked'),{code:'permission-denied'});};
 detach=h.attach();await settle();assert.equal(h.completedQuery.current,null);assert.equal(h.state.page,null);assert.equal(h.state.error,'permission revoked');assert.equal(h.state.busy,false);
 detach();h.behavior.verify=async()=>undefined;h.attach();await settle();
 assert.equal(h.reads.length,2);assert.equal(h.proofs.length,1);assert.ok(h.completedQuery.current);assert.equal(h.state.error,'');
});

test('failed page query cannot mark completion or reuse old rows after a query round trip',async()=>{
 const h=harness();let detach=h.attach();await settle();const retained=h.state.page;detach();
 const changed={search:'changed',queryKey:ordersQueryKey(scope,'changed',{from:'',to:'',state:''})};
 h.behavior.page=async()=>{throw Object.assign(Error('stale checkpoint'),{code:'stale-checkpoint'});};
 detach=h.attach(changed);await settle();assert.equal(h.completedQuery.current,null);assert.equal(h.state.page,retained);assert.equal(h.proofs.length,0);
 detach();h.behavior.page=async()=>({rows:h.rows});h.attach(changed);await settle();assert.equal(h.reads.length,3);assert.equal(h.proofs.length,0);assert.ok(h.completedQuery.current);
});

test('a page which finishes while hidden is not a completed published query',async()=>{
 const h=harness(),first=deferred(),second=deferred();let calls=0;
 h.behavior.page=()=>++calls===1?first.promise:second.promise;
 const detach=h.attach();detach();first.resolve({rows:h.rows});await settle();
 assert.equal(h.completedQuery.current,null);assert.equal(h.publications.length,0);
 h.attach();assert.equal(h.reads.length,2);assert.equal(h.proofs.length,0);assert.equal(h.state.busy,true);
 second.resolve({rows:h.rows});await settle();assert.equal(h.publications.length,1);assert.ok(h.completedQuery.current);
});

test('late hidden verification failure cannot erase a newer successful verification',async()=>{
 const h=harness();let detach=h.attach();await settle();detach();
 const old=deferred(),newer=deferred();let count=0;h.behavior.verify=()=>++count===1?old.promise:newer.promise;
 detach=h.attach();detach();h.attach();newer.resolve();await settle();const completed=h.completedQuery.current;
 old.reject(Error('late hidden proof failure'));await settle();
 assert.equal(h.completedQuery.current,completed);assert.equal(h.state.error,'');assert.equal(h.state.busy,false);assert.equal(h.reads.length,1);
});

test('hidden verification failure invalidates old completion if no newer proof succeeded',async()=>{
 const h=harness();let detach=h.attach();await settle();detach();
 const proof=deferred();h.behavior.verify=()=>proof.promise;detach=h.attach();detach();proof.reject(Error('hidden proof failure'));await settle();
 assert.equal(h.completedQuery.current,null);h.attach();await settle();assert.equal(h.reads.length,2);assert.equal(h.proofs.length,1);
});

test('missing adapter verification hook falls back to an authorized page read, never unchecked reuse',async()=>{
 const h=harness();const detach=h.attach();await settle();detach();delete h.repo.verifyReadAccess;
 h.attach();await settle();assert.equal(h.reads.length,2);assert.equal(h.proofs.length,0);assert.equal(h.state.busy,false);
});

test('loss of current scope while verification waits invalidates completion',async()=>{
 const h=harness();const detach=h.attach();await settle();detach();
 const proof=deferred();h.behavior.verify=()=>proof.promise;h.attach();h.runtime.isCurrent=()=>false;proof.resolve();await settle();
 assert.equal(h.completedQuery.current,null);assert.equal(h.publications.length,1);
});
