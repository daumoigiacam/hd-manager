import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import {parse} from '@babel/parser';
import traverseModule from '@babel/traverse';
import {createOfflineBusinessDirectory} from '../../data/offlineBusinessDirectory.js';
import {createOfflineWarehouseRepository} from './offlineWarehouseRepository.js';
import {warehouseDateRange,warehouseLineFields,warehouseStoredValue,assertWarehouseDocument,warehouseErrorMessage,WAREHOUSE_WRITE_GAP,WAREHOUSE_SOURCES} from './offlineWarehouseModel.js';
const traverse = traverseModule.default || traverseModule;

function fixture() {
  const sql = new DatabaseSync(':memory:');
  sql.exec(`CREATE TABLE offline_home_head_v1 (tenant_id,principal_id,revision,generation,captured_at,day_key,snapshot_json);
    CREATE TABLE offline_home_feed_checkpoint_v1 (tenant_id,principal_id,revision,generation,applied_seq,reported_seq);
    CREATE TABLE offline_home_feed_records_v1 (tenant_id,principal_id,generation,source,id,seq,body);`);
  const scope={tenantId:'tenant-a',principalId:'employee-a',permissionRevision:'revision-a',sessionId:'session-a'};
  const sources=['warehouseImports','warehouseDispatches','warehouseStockCounts'];
  const grant={...scope,expiresAtMs:100000,capabilities:['home.read',...sources.map(source=>WAREHOUSE_SOURCES[source].capability)]};
  let current=true,at=1,mutate=null;
  const session={scope,isCurrent:()=>current};
  const keys=[scope.tenantId,scope.principalId];
  sql.prepare('INSERT INTO offline_home_head_v1 VALUES (?,?,?,?,?,?,?)').run(...keys,scope.permissionRevision,'g-1',123,'2026-11-09',JSON.stringify({feedGeneration:'g-1',feedSeq:100,availableSources:sources,sourceCounts:Object.fromEntries(sources.map(s=>[s,100]))}));
  sql.prepare('INSERT INTO offline_home_feed_checkpoint_v1 VALUES (?,?,?,?,?,?)').run(...keys,scope.permissionRevision,'g-1',100,100);
  const queries=[];
  const database={transaction:async work=>work({query:async(text,params=[])=>{queries.push({text,params});mutate?.(text);return sql.prepare(text).all(...params);}})};
  const authorize=async()=>grant;
  const directory=createOfflineBusinessDirectory({database,session,authorize,clock:()=>at});
  const repository=createOfflineWarehouseRepository({database,session,authorize,directory,clock:()=>at});
  function add(source,document,{tenant='tenant-a',principal='employee-a',generation='g-1',seq=1}={}) {
    sql.prepare('INSERT INTO offline_home_feed_records_v1 VALUES (?,?,?,?,?,?,?)').run(tenant,principal,generation,source,document.id,seq,JSON.stringify(document));
  }
  const runtime={scope,expiresAtMs:Date.now()+100000,capabilities:grant.capabilities,isCurrent:()=>current,appSession:{currentCompany:{id:scope.tenantId},currentUser:{accountType:'employee',companyId:scope.tenantId,firebaseUid:scope.principalId}}};
  return {sql,add,sources,repository,grant,scope,runtime,queries,setCurrent:value=>{current=value;},setTime:value=>{at=value;},onQuery:fn=>{mutate=fn;}};
}

test('inclusive Vietnamese date bounds never use device timezone or today',()=>{
  assert.deepEqual(warehouseDateRange('2026-11-09','2026-11-09'),{from:'2026-11-09',to:'2026-11-10'});
  assert.deepEqual(warehouseDateRange('',''),{from:null,to:null});
  assert.deepEqual(warehouseDateRange('2024-02-29','2024-02-29'),{from:'2024-02-29',to:'2024-03-01'});
  assert.throws(()=>warehouseDateRange('2026-02-30',''));assert.throws(()=>warehouseDateRange('2026-11-10','2026-11-09'));
});
test('stored product units/prices remain independent and missing values are not zero',()=>{
  const original={orderedUnit:'Thùng',quantityUnit:'Con',pricingUnit:'Kg',unitPrice:'1.005',amount:'123.4567'};
  const fields=Object.fromEntries(warehouseLineFields(original));
  assert.equal(fields['Đơn vị đặt'],'Thùng');assert.equal(fields['Đơn vị tính giá'],'Kg');assert.equal(fields['Đơn giá đã lưu'],'1.005');assert.equal(fields['Thành tiền đã lưu'],'123.4567');
  assert.equal(Object.fromEntries(warehouseLineFields({quantityUnit:'Con',unitPrice:0}))['Đơn vị đặt'],undefined);
  assert.equal(warehouseStoredValue(null),'Chưa ghi nhận');assert.equal(warehouseStoredValue(0),'0');assert.equal(warehouseStoredValue('0.000000001'),'0.000000001');
});
test('all three warehouse routes read actual completed source records, with SQL filters',async()=>{
  const f=fixture();
  for(const source of f.sources){
    f.add(source,{id:source+'-match',companyId:'tenant-a',date:'2026-11-08T18:30:00Z',empId:'maker',status:'POSTED',productName:'Vit 01',quantity:3,orderedUnit:'Con',pricingUnit:'Kg',unitPrice:'1200.005'});
    f.add(source,{id:source+'-other',companyId:'tenant-a',date:'2026-11-09',empId:'other',status:'DRAFT',productName:'Other'});
    f.add(source,{id:source+'-foreign',companyId:'tenant-b',date:'2026-11-09',empId:'maker',status:'POSTED',productName:'Vit 01'},{tenant:'tenant-b'});
    const page=await f.repository.page(source,{...warehouseDateRange('2026-11-09','2026-11-09'),text:'Vit 01',employeeId:'maker',status:'POSTED',limit:25});
    assert.equal(page.items.length,1);assert.equal(page.items[0].id,source+'-match');assert.equal(page.items[0].businessDate,'2026-11-09');
    const detail=await f.repository.detail(source,page.items[0].id,{checkpoint:page.metadata.checkpoint});
    assert.equal(detail.document.quantity,3);assert.equal(detail.document.orderedUnit,'Con');assert.equal(detail.document.pricingUnit,'Kg');assert.equal(detail.document.unitPrice,'1200.005');
  }
  assert(f.queries.some(q=>q.text.includes("json_extract(r.body,'$.empId')")&&q.params.includes('maker')));
});
test('cursor pages remain bounded and never recompute totals',async()=>{
  const f=fixture();for(let n=0;n<61;n++)f.add('warehouseImports',{id:'p-'+String(n).padStart(3,'0'),companyId:'tenant-a',date:'2026-11-09',amount:'99.0001'});
  const first=await f.repository.page('warehouseImports',{limit:25});const second=await f.repository.page('warehouseImports',{limit:25,cursor:first.nextCursor});const third=await f.repository.page('warehouseImports',{limit:25,cursor:second.nextCursor});
  assert.equal(first.items.length,25);assert.equal(second.items.length,25);assert.equal(third.items.length,11);assert.equal(third.hasMore,false);
  assert.equal(new Set([...first.items,...second.items,...third.items].map(x=>x.id)).size,61);
  assert.equal(first.metadata.financialCalculationAllowed,false);assert.equal(first.total,undefined);
});
test('detail paginates original product lines preserving missing units and precise numeric strings',async()=>{
  const f=fixture(),items=Array.from({length:57},(_,n)=>({productId:'product-'+n,productName:'Line '+n,quantity:n,orderedUnit:n%2?'Thùng':undefined,pricingUnit:'Kg',unitPrice:'9.000000001',amount:'999.99999',password:'must-not-leave-sql'}));
  f.add('warehouseDispatches',{id:'multi',companyId:'tenant-a',date:'2026-11-09',items,note:'note',password:'secret',refreshToken:'secret'});
  const page=await f.repository.page('warehouseDispatches',{limit:25}),checkpoint=page.metadata.checkpoint;
  const a=await f.repository.detail('warehouseDispatches','multi',{checkpoint}),b=await f.repository.detail('warehouseDispatches','multi',{checkpoint,cursor:a.nextCursor}),c=await f.repository.detail('warehouseDispatches','multi',{checkpoint,cursor:b.nextCursor});
  assert.equal(a.items.length,25);assert.equal(b.items.length,25);assert.equal(c.items.length,7);assert.equal(c.hasMore,false);
  assert.equal(a.items[0].document.orderedUnit,null);assert.equal(a.items[1].document.orderedUnit,'Thùng');assert.equal(a.items[0].document.unitPrice,'9.000000001');
  assert.equal(a.document.password,undefined);assert.equal(a.document.refreshToken,undefined);assert.equal(a.items[0].document.password,undefined);
  assert.equal(c.items.at(-1).ordinal,56);
});
test('stock-count measures are stored observations, not calculated variance or page totals',async()=>{
  const f=fixture();f.add('warehouseStockCounts',{id:'count',companyId:'tenant-a',date:'2026-11-09',quantity:0,reason:'Hư hỏng',countedMeasures:[{unit:'Con',quantity:0}],measures:[{unit:'Kg',quantity:'2.0005'}]});
  const page=await f.repository.page('warehouseStockCounts'),value=await f.repository.detail('warehouseStockCounts','count',{checkpoint:page.metadata.checkpoint});
  assert.equal(value.document.quantity,0);assert.equal(value.measures.countedMeasures.items[0].quantity,0);assert.equal(value.measures.countedMeasures.items[0].difference,null);assert.equal(value.measures.measures.items[0].quantity,'2.0005');
});
test('wrong tenant/principal/generation and forged IDs do not enter detail',async()=>{
  const f=fixture();f.add('warehouseImports',{id:'valid',companyId:'tenant-a'});f.add('warehouseImports',{id:'foreign',companyId:'tenant-b'},{tenant:'tenant-b'});
  f.add('warehouseImports',{id:'other-user',companyId:'tenant-a'},{principal:'employee-b'});f.add('warehouseImports',{id:'old-generation',companyId:'tenant-a'},{generation:'g-old'});
  const page=await f.repository.page('warehouseImports');assert.deepEqual(page.items.map(x=>x.id),['valid']);
  const detail=await f.repository.detail('warehouseImports','foreign',{checkpoint:page.metadata.checkpoint});assert.equal(detail.document,null);
  assert.throws(()=>assertWarehouseDocument(f.runtime,{id:'leak',companyId:'tenant-b'}),{code:'permission-denied'});
});
test('read capability is source-specific; home.read and unrelated write caps cannot expand it',async()=>{
  const f=fixture();f.grant.capabilities=['home.read','orders.create'];
  await assert.rejects(f.repository.page('warehouseImports'),{code:'permission-denied'});
  await assert.rejects(f.repository.detail('warehouseImports','anything',{checkpoint:{}}),{code:'permission-denied'});
});
test('in-progress feed, expired grant, closed session, changed checkpoint all fail closed',async()=>{
  const f=fixture();f.add('warehouseImports',{id:'a',companyId:'tenant-a',date:'2026-11-09'});const page=await f.repository.page('warehouseImports'),cp=page.metadata.checkpoint;
  f.sql.exec('UPDATE offline_home_feed_checkpoint_v1 SET applied_seq=101');
  await assert.rejects(f.repository.detail('warehouseImports','a',{checkpoint:cp}),{code:'stale-checkpoint'});
  f.sql.exec('UPDATE offline_home_feed_checkpoint_v1 SET applied_seq=100');f.setTime(100000);
  await assert.rejects(f.repository.detail('warehouseImports','a',{checkpoint:cp}),{code:'permission-denied'});
  f.setTime(1);f.setCurrent(false);await assert.rejects(f.repository.page('warehouseImports'),{code:'permission-denied'});
});
test('session switch during SQL detail prevents publication',async()=>{
  const f=fixture();f.add('warehouseImports',{id:'a',companyId:'tenant-a',date:'2026-11-09'});const page=await f.repository.page('warehouseImports');
  f.onQuery(text=>{if(text.includes('AS line_path'))f.setCurrent(false);});
  await assert.rejects(f.repository.detail('warehouseImports','a',{checkpoint:page.metadata.checkpoint}),{code:'permission-denied'});
});
test('cursor cannot switch source, record, session or checkpoint',async()=>{
  const f=fixture();f.add('warehouseImports',{id:'a',companyId:'tenant-a',items:Array.from({length:30},()=>({quantity:1}))});const page=await f.repository.page('warehouseImports'),cp=page.metadata.checkpoint;
  const first=await f.repository.detail('warehouseImports','a',{checkpoint:cp});
  const forged=JSON.parse(first.nextCursor);forged.id='b';await assert.rejects(f.repository.detail('warehouseImports','a',{checkpoint:cp,cursor:JSON.stringify(forged)}),{code:'stale-checkpoint'});
  await assert.rejects(f.repository.detail('warehouseImports','a',{checkpoint:cp,limit:26}),{code:'invalid-argument'});
});
test('unknown native source mapping stays explicit, never fake warehouse success',async()=>{
  const f=fixture();await assert.rejects(f.repository.detail('nativeStockLedger','a',{checkpoint:{}}),{code:'invalid-argument'});
  assert.equal(WAREHOUSE_WRITE_GAP.code,'WAREHOUSE_ATOMIC_OFFLINE_PROTOCOL_UNAVAILABLE');assert.equal(f.repository.create,undefined);assert.equal(f.repository.update,undefined);
});
test('cross-scope errors and unsafe raw server messages are not surfaced',()=>{
  const message=warehouseErrorMessage(Error('customer-phone=private tenant-b raw-secret'));
  assert(!message.includes('private'));assert(!message.includes('tenant-b'));assert(!message.includes('raw-secret'));
});
test('product component parses and has no Firebase/App/SQLite-open/network/listener path',()=>{
  const text=fs.readFileSync(new URL('./OfflineWarehouseWorkspace.jsx',import.meta.url),'utf8'),ast=parse(text,{sourceType:'module',plugins:['jsx']}),globals=new Set(['Object','Array','JSON','Promise','Error','Number','Boolean','undefined']);
  traverse(ast,{ReferencedIdentifier(p){if(!p.scope.getBinding(p.node.name))assert(globals.has(p.node.name),'Unresolved '+p.node.name);},ImportDeclaration(p){assert(!/firebase|App\.jsx|nativeOffline|bootstrap/.test(p.node.source.value));}});
  assert(!/addEventListener|\.subscribe\(|fetch\(|createConnection|\.enqueue\(|\.create\(/.test(text));
});
