import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFile} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {createSQLiteOrderProduct} from './sqliteOrderDirectory.js';
import {createOfflineOrderRepository} from '../../data/offlineOrderRepository.js';
const hash=v=>createHash('sha256').update(v).digest('hex');
async function fixture({fast=true}={}){
 const sql=new DatabaseSync(':memory:');sql.exec(await readFile(new URL('../../../performance/offline-first/schema-v1.sql',import.meta.url),'utf8'));
 const scope={tenantId:'t',principalId:'u',permissionRevision:'r',sessionId:'s'},session={scope,isCurrent:()=>live};let live=true,at=100;
 const grant={...scope,expiresAtMs:1000,capabilities:['home.read','orders.read'],appSession:{}};
 const hooks={},stats={auth:[],direct:[],transactions:0,queries:[],prepares:0};
 const query=async(statement,params=[])=>{const rows=sql.prepare(statement).all(...params);stats.queries.push({statement,params,rows});return rows;};
 const database={async transaction(work){stats.transactions++;await hooks.beforeTransaction?.();sql.exec('BEGIN');try{const value=await work({query,run:async(s,p=[])=>sql.prepare(s).run(...p)});sql.exec('COMMIT');return value;}catch(e){sql.exec('ROLLBACK');throw e;}}};
 if(fast)database.readQuery=async(statement,params)=>{stats.direct.push({statement,params});await hooks.beforeDirect?.();const rows=await query(statement,params);await hooks.afterDirect?.(rows);return rows;};
 const authorize=async input=>{stats.auth.push(input);await hooks.authorize?.(stats.auth.length);assert.deepEqual(input.scope,scope);return {...grant,capabilities:[...grant.capabilities]};};
 const concrete=await createOfflineOrderRepository({database,session,authorize,deviceId:'device',digest:async v=>hash(v),uuid:randomUUID});await concrete.mutationRepository();
 const product=createSQLiteOrderProduct({database,session,authorize,clock:()=>at,orders:{repository:async()=>{stats.prepares++;await hooks.prepare?.();return concrete;},create:d=>concrete.create(d)}});
 const reset=()=>{stats.auth.length=0;stats.direct.length=0;stats.transactions=0;stats.queries.length=0;};reset();
 function add(id,extra={},other={}){
  const tenant=other.tenant||'t',principal=other.principal||'u',commandId=other.commandId||'create_'+id,state=other.state||'PENDING_SYNC';
  const body={id,companyId:tenant,customerId:'customer',customerName:'Visible',date:'2026-11-09',amount:10,items:[],...extra};
  sql.prepare('INSERT INTO local_commands VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)').run(tenant,principal,commandId,'s','r','device','order.create',id,0,100,JSON.stringify(body),commandId,state);
  sql.prepare('INSERT INTO offline_orders_v1 VALUES (?,?,?,?,?,?,?)').run(tenant,principal,id,JSON.stringify(body),commandId,other.server?JSON.stringify({...body,...other.server}):null,null);return body;
 }
 function mutate(id,patch,state='PENDING_SYNC'){
  const base=JSON.parse(sql.prepare('SELECT body FROM offline_orders_v1 WHERE tenant_id=? AND principal_id=? AND id=?').get('t','u',id).body),command='mutate_'+id;
  sql.prepare('INSERT INTO local_commands VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)').run('t','u',command,'s','r','device','order.update',id,0,100,'{}',command,state);
  sql.prepare('INSERT INTO offline_order_mutations_v1 VALUES (?,?,?,?,?,?,?,?)').run('t','u',id,JSON.stringify({...base,...patch}),JSON.stringify(base),command,null,null);
 }
 return {sql,product,scope,session,grant,hooks,stats,reset,add,mutate,time:v=>{at=v;},invalidate:()=>{live=false;},close:()=>sql.close()};
}
test('localPage fast path prepares existing repository then executes exactly ONE scoped SELECT and two authorizations, no BEGIN/COMMIT',async()=>{
 const f=await fixture();try{f.add('one');f.add('two');const page=await f.product.localPage({limit:1});assert.equal(page.rows.length,1);assert.ok(page.nextCursor);assert.equal(f.stats.direct.length,1);assert.equal(f.stats.queries.length,1);assert.equal(f.stats.transactions,0);assert.equal(f.stats.prepares,1);assert.deepEqual(f.stats.auth.map(a=>a.kind),['home.read','home.read']);assert.match(f.stats.direct[0].statement,/event AS .*MAX\(event_id\)/);assert.match(f.stats.direct[0].statement,/LEFT JOIN page/);
 f.reset();await f.product.localPage({limit:1,after:page.nextCursor});assert.equal(f.stats.prepares,1,'existing preparation is reused');assert.equal(f.stats.direct.length,1);assert.equal(f.stats.transactions,0);
 }finally{f.close();}
});
test('same bounded filters, literal search, ordering, states, archive, server_json and mutation precedence preserve safe fields',async()=>{
 const f=await fixture();try{
  f.add('a',{date:'2026-11-08',note:'hidden-note',paymentToken:'hidden-token',items:[{productName:'Cá 100%',internalCost:'hidden-cost'}]});
  f.add('b',{date:'2026-11-09'},{state:'SYNCED',server:{code:'server-code',amount:77}});f.add('c',{isArchived:true});f.add('d',{archived:true});f.mutate('a',{code:'patched',amount:30});
  assert.deepEqual((await f.product.localPage()).rows.map(r=>r.id),['b','a']);assert.equal((await f.product.localPage()).rows[1].amount,30);
  assert.equal((await f.product.localPage({state:'SYNCED'})).rows[0].code,'server-code');
  assert.deepEqual((await f.product.localPage({archived:true})).rows.map(r=>r.id),['d','c']);
  assert.deepEqual((await f.product.localPage({from:'2026-11-08',to:'2026-11-08',search:'100%'})).rows.map(r=>r.id),['a']);
  for(const search of ['hidden-note','hidden-token','hidden-cost','no_match'])assert.deepEqual((await f.product.localPage({search})).rows,[]);
  const row=(await f.product.localPage({search:'patched'})).rows[0];assert.deepEqual(Object.keys(row).sort(),['id','customerId','customerName','date','code','amount','archived','localSyncState'].sort());
  assert.throws(()=>f.product.localPage({limit:101}));assert.throws(()=>f.product.localPage({from:'2026-11-10',to:'2026-11-09'}));
 }finally{f.close();}
});
test('watermark survives empty pages; stale cursor fails even when page SQL returns no matching rows',async()=>{
 const f=await fixture();try{assert.deepEqual(await f.product.localPage(),{rows:[],nextCursor:null,generation:'local-commands',seq:0});f.add('a');f.add('b');const first=await f.product.localPage({limit:1});
  const tail=await f.product.localPage({limit:1,after:{...first.nextCursor,date:'',id:''}});assert.deepEqual(tail.rows,[]);
  f.add('c');f.reset();await assert.rejects(f.product.localPage({limit:1,after:{...first.nextCursor,date:'',id:''}}),{code:'orders-cursor-stale'});assert.equal(f.stats.direct.length,1);assert.equal(f.stats.auth.length,2);
 }finally{f.close();}
});
test('event and page come from SAME snapshot; later event cannot be spliced into cursor',async()=>{
 const f=await fixture();try{f.add('a');f.add('b');const event=f.sql.prepare("SELECT MAX(event_id) n FROM command_events WHERE tenant_id='t' AND principal_id='u'").get().n;
 f.hooks.afterDirect=()=>{delete f.hooks.afterDirect;f.add('c');};const page=await f.product.localPage({limit:1});assert.equal(page.rows[0].id,'b');assert.equal(page.nextCursor.event,event);assert.equal(f.stats.direct.length,1);
 await assert.rejects(f.product.localPage({limit:1,after:page.nextCursor}),{code:'orders-cursor-stale'});
 }finally{f.close();}
});
test('tenant/principal scoping covers page AND event; forged scope/filter/revision cursors fail closed',async()=>{
 const f=await fixture();try{f.add('a');f.add('b');const first=await f.product.localPage({limit:1});f.add('other-tenant',{}, {tenant:'foreign'});f.add('other-principal',{}, {principal:'foreign'});
 const next=await f.product.localPage({limit:1,after:first.nextCursor});assert.deepEqual(next.rows.map(r=>r.id),['a']);
 for(const patch of [{tenantId:'foreign'},{principalId:'foreign'},{revision:'foreign'},{filter:'foreign'},{generation:'foreign'},{seq:99}])await assert.rejects(f.product.localPage({limit:1,after:{...first.nextCursor,...patch}}),{code:'orders-cursor-stale'});
 f.session.scope={...f.scope,permissionRevision:'new'};await assert.rejects(f.product.localPage(),{code:'permission-denied'});
 }finally{f.close();}
});
test('before/after signature capabilities, profile, expiry and current-session checks never release unauthorized rows',async()=>{
 for(const stage of ['before','after'])for(const failure of ['cap','profile','expiry','unsafe-expiry','session','scope']){
  const f=await fixture();try{f.add('a');const invalidate=()=>{if(failure==='cap')f.grant.capabilities=['home.read'];if(failure==='profile')f.grant.appSession={sourceProfile:'native-isolation-v1'};if(failure==='expiry')f.time(1000);if(failure==='unsafe-expiry')f.grant.expiresAtMs=Infinity;if(failure==='session')f.invalidate();if(failure==='scope')f.session.scope={...f.scope,tenantId:'other'};};
   if(stage==='before')invalidate();else f.hooks.afterDirect=invalidate;
   await assert.rejects(f.product.localPage(),error=>['permission-denied','orders-source-unsupported'].includes(error.code),stage+'/'+failure);
   assert.equal(f.stats.direct.length,stage==='before'?0:1);
  }finally{f.close();}
 }
});
test('authority expiry during prepare prevents fast SQL, and queued fallback expiry prevents its SELECT',async()=>{
 const fast=await fixture();try{fast.hooks.prepare=()=>fast.time(1000);await assert.rejects(fast.product.localPage(),{code:'permission-denied'});assert.equal(fast.stats.direct.length,0);}finally{fast.close();}
 const fallback=await fixture({fast:false});try{fallback.hooks.beforeTransaction=()=>fallback.time(1000);await assert.rejects(fallback.product.localPage(),{code:'permission-denied'});assert.equal(fallback.stats.queries.length,0);}finally{fallback.close();}
});
test('missing readQuery uses existing transaction owner with one SELECT, same watermark and two authorizations',async()=>{
 const f=await fixture({fast:false});try{f.add('a');f.add('b');const page=await f.product.localPage({limit:1});assert.equal(page.rows[0].id,'b');assert.equal(f.stats.transactions,1);assert.equal(f.stats.queries.length,1);assert.equal(f.stats.auth.length,2);assert.equal((await f.product.localPage({limit:1,after:page.nextCursor})).rows[0].id,'a');}finally{f.close();}
});
