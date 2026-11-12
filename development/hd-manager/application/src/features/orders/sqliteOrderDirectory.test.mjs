import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFile} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {createSQLiteOrderProduct} from './sqliteOrderDirectory.js';
import {createOrderProductAdapter} from './orderProductAdapter.js';
import {createOfflineBusinessDirectory,OFFLINE_BUSINESS_SOURCES} from '../../data/offlineBusinessDirectory.js';
import {createOfflineOrderRepository} from '../../data/offlineOrderRepository.js';
import {extractEmployeeHomeDomain} from '../../../scripts/helpers/employee-home-domain-extraction.mjs';
import {applyOrderMetadataPatch,canonicalOrder} from './orderMutationProtocol.js';
import {ordersRelevantTopic,ordersQueryKey,retainedPagination,ordersPageMatches} from './ordersRetainedState.js';

// Extract the exact production calculator and its actual dependencies; no
// rewritten maths or baseline fixture substitutes for the product formulas.
const sourceFile=fileURLToPath(new URL('../customers/productCRMShared.jsx',import.meta.url));
const extracted=extractEmployeeHomeDomain(await readFile(sourceFile,'utf8'),path.dirname(sourceFile),['buildCustomerReconciledLedger']);
const ledgerModule=await import('data:text/javascript;base64,'+Buffer.from(extracted.replace(/from ("[^"]+")/g,(_,literal)=>'from '+JSON.stringify(pathToFileURL(JSON.parse(literal)).href))).toString('base64'));
const caps=[...new Set(['orders.read','orders.create','home.read','home.debt.read','home.cashflow.read','home.imports.read','customers.read','customers.history.read','customers.history.orders.read','customers.history.payments.read',...['orders','customers','products','employees'].map(source=>OFFLINE_BUSINESS_SOURCES[source].capability)])];
const scope={tenantId:'tenant-a',principalId:'user-a',permissionRevision:'r1',sessionId:'session-a',deviceId:'dev-a'};
const deferredRead=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};};
const order=(identity,extra={})=>({id:identity,companyId:'tenant-a',customerId:'customer-a',date:'2026-11-01',amount:100,totalAmount:100,items:[],...extra});
async function fixture({sources={},capabilities=caps,mutationProtocol,hooks={}}={}){
 const sql=new DatabaseSync(':memory:');
 sql.exec(await readFile(new URL('../../../performance/offline-first/schema-v1.sql',import.meta.url),'utf8'));
 sql.exec(`CREATE TABLE offline_home_head_v1 (tenant_id TEXT,principal_id TEXT,revision TEXT,generation TEXT,snapshot_json TEXT,captured_at INTEGER DEFAULT 1,day_key TEXT DEFAULT '2026-11-09');
 CREATE TABLE offline_home_feed_checkpoint_v1 (tenant_id TEXT,principal_id TEXT,revision TEXT,generation TEXT,applied_seq INTEGER,reported_seq INTEGER DEFAULT 1);
 CREATE TABLE offline_home_feed_records_v1 (tenant_id TEXT,principal_id TEXT,generation TEXT,source TEXT,id TEXT,body TEXT,seq INTEGER DEFAULT 1);`);
 const records={orders:[],customers:[{id:'customer-a',companyId:'tenant-a',name:'Khách A'}],payments:[],expenses:[],warehouseImports:[],products:[{id:'product-a',companyId:'tenant-a',name:'Hàng A',unit:'Con'}],employees:[{id:'employee-a',companyId:'tenant-a',name:'Nhân viên A'}],...sources};
 const payload={feedGeneration:'g1',feedSeq:1,availableSources:Object.keys(records),sourceCounts:Object.fromEntries(Object.entries(records).map(([k,v])=>[k,v.length]))};
 sql.prepare('INSERT INTO offline_home_head_v1 (tenant_id,principal_id,revision,generation,snapshot_json) VALUES (?,?,?,?,?)').run('tenant-a','user-a','r1','g1',JSON.stringify(payload));
 sql.prepare('INSERT INTO offline_home_feed_checkpoint_v1 (tenant_id,principal_id,revision,generation,applied_seq) VALUES (?,?,?,?,?)').run('tenant-a','user-a','r1','g1',1);
 for(const [source,rows]of Object.entries(records))for(const body of rows)sql.prepare('INSERT INTO offline_home_feed_records_v1 (tenant_id,principal_id,generation,source,id,body) VALUES (?,?,?,?,?,?)').run('tenant-a','user-a','g1',source,body.id,JSON.stringify(body));
 let live=true,active=false,failMutation=false;const calls=[];
 const database={transaction:async work=>{await hooks.beforeTransaction?.();assert.equal(active,false,'No nested transaction');active=true;sql.exec('BEGIN');try{const result=await work({query:async(statement,params=[])=>{const rows=sql.prepare(statement).all(...params);calls.push({statement,params,resultBytes:Buffer.byteLength(JSON.stringify(rows)),resultColumns:Object.keys(rows[0]||{})});await hooks.afterQuery?.(statement,params,rows);return rows;},run:async(statement,params=[])=>{if(failMutation&&statement.startsWith('INSERT INTO offline_order_mutations_v1'))throw Error('injected projection failure');return sql.prepare(statement).run(...params);}});sql.exec('COMMIT');hooks.onTransaction?.('commit');return result;}catch(e){sql.exec('ROLLBACK');hooks.onTransaction?.('rollback');throw e;}finally{active=false;}}};
 const session={scope,isCurrent:()=>live};
 const authorize=async({scope:requested,kind})=>{assert.deepEqual(requested,scope);const cap={'order.read':'orders.read','order.create':'orders.create','order.update':'orders.update','order.archive':'orders.archive','home.read':'home.read'}[kind];if(!capabilities.includes(cap))throw Error('Capability denied');return {...scope,expiresAtMs:Date.now()+60000,capabilities};};
 const original=await createOfflineOrderRepository({database,session,authorize,deviceId:scope.deviceId,uuid:randomUUID,mutationProtocol,digest:async value=>createHash('sha256').update(value).digest('hex')});
 const writer={repository:async()=>original,create:document=>original.create(document)};
 const business=createOfflineBusinessDirectory({database,session,authorize});
 const product=createSQLiteOrderProduct({database,session,authorize,orders:writer,business,actorEmployeeId:'employee-a',loadLedger:async()=>({...ledgerModule,buildCustomerReconciledLedger(...args){hooks.onCalculate?.();return ledgerModule.buildCustomerReconciledLedger(...args);}})});
 const repo=createOrderProductAdapter({business,product,capabilities});
 return {repo,product,sql,calls,records,payload,original,close:()=>sql.close(),invalidate:()=>{live=false;},failMutationInsert:()=>{failMutation=true;}};
}

test('SQL pagination, literal search, dates/archive/status filters and tenant/principal isolation',async()=>{
 const f=await fixture({sources:{orders:Array.from({length:62},(_,i)=>order('ord_'+String(i).padStart(3,'0'),{date:i<30?'2026-10-01':'2026-11-01',note:'private',paymentToken:'secret',items:[{productName:'Cá kiểm tra',internalCost:'hidden-financial-field'}]})).concat(order('ord_archive',{isArchived:true}),order('ord_percent',{customerName:'Khách 100%'}))}});
 try{
  f.sql.prepare('INSERT INTO offline_home_feed_records_v1 (tenant_id,principal_id,generation,source,id,body) VALUES (?,?,?,?,?,?)').run('tenant-b','user-b','g1','orders','foreign',JSON.stringify(order('foreign',{companyId:'tenant-b'})));
  f.sql.prepare('INSERT INTO offline_home_feed_records_v1 (tenant_id,principal_id,generation,source,id,body) VALUES (?,?,?,?,?,?)').run('tenant-a','other-user','g1','orders','other',JSON.stringify(order('other')));
  let after=null,rows=[];do{const page=await f.repo.page({limit:25,after});assert.ok(page.rows.length<=25);rows.push(...page.rows);after=page.nextCursor;}while(after);
  assert.equal(rows.length,64);assert.equal(new Set(rows.map(x=>x.id)).size,64);assert.ok(rows.every(row=>!('paymentToken'in row)&&!('note'in row)));
  assert.equal((await f.repo.page({search:'100%',limit:100})).rows.length,1);
  assert.equal((await f.repo.page({search:'hidden-financial-field',limit:100})).rows.length,0,'hidden item fields cannot be inferred through search');
  assert.equal((await f.repo.page({search:'Cá kiểm tra',limit:100})).rows.length,62);
  assert.equal((await f.repo.page({from:'2026-11-01',to:'2026-11-01',limit:100})).rows.length,34);
  assert.equal(rows.find(row=>row.id==='ord_archive').archived,true);
  const cursor=(await f.repo.page()).nextCursor;
  const forged=JSON.parse(cursor);forged.checkpoint.principalId='other';
  await assert.rejects(f.repo.page({after:JSON.stringify(forged)}));
  assert.equal(await f.repo.detail('foreign'),null);
  const detail=await f.repo.detail('ord_001');assert.equal(detail.amount,100);assert.equal(detail.paymentToken,undefined);
 }finally{f.close();}
});

test('incomplete and native source profiles fail closed; no empty replacement DB',async()=>{
 const f=await fixture({sources:{orders:[order('ord_a')]}});try{
  f.sql.exec("DELETE FROM offline_home_feed_records_v1 WHERE source='orders'");
  await assert.rejects(f.repo.detail('ord_a'),{code:'orders-source-incomplete'});
  f.payload.sourceProfile='native-isolation-v1';f.sql.prepare('UPDATE offline_home_head_v1 SET snapshot_json=?').run(JSON.stringify(f.payload));
  await assert.rejects(f.repo.detail('ord_a'),{code:'orders-source-unsupported'});
 }finally{f.close();}
});

test('ledger uses complete history beyond list pages and exact original reconciliation',async()=>{
 const histories=Array.from({length:130},(_,i)=>order('ord_'+String(i).padStart(3,'0'),{date:'2026-10-01',paidAmount:0}));
 const f=await fixture({sources:{orders:histories,payments:[{id:'pay-a',companyId:'tenant-a',customerId:'customer-a',date:'2026-11-01',amount:12500,approvalStatus:'approved'}]}});
 try{
  const ledger=await f.repo.ledger('customer-a');
  const expected=ledgerModule.buildCustomerReconciledLedger(f.records.customers[0],histories,f.records.payments,[],[]);
  assert.equal(ledger.status,'complete');assert.equal(ledger.currentDebt,expected.currentDebt);assert.equal(ledger.currentDebt,500);
  assert.deepEqual(ledger.orders,expected.orders.map(({id,appliedAmount,outstandingAmount,status})=>({id,appliedAmount,outstandingAmount,status})));
  assert.equal(ledger.orders.length,130);
  const detail=await f.repo.detail('ord_000');f.payload.feedSeq=2;f.sql.prepare('UPDATE offline_home_head_v1 SET snapshot_json=?').run(JSON.stringify(f.payload));f.sql.exec('UPDATE offline_home_feed_checkpoint_v1 SET applied_seq=2,reported_seq=2');
  await assert.rejects(f.repo.ledger('customer-a',detail.checkpoint),{code:'orders-cursor-stale'});
  f.sql.exec("DELETE FROM offline_home_feed_records_v1 WHERE source='payments'");
  await assert.rejects(f.repo.ledger('customer-a'),{code:'orders-source-incomplete'});
 }finally{f.close();}
});

test('signed financial subcapabilities and expired owner deny access',async()=>{
 const f=await fixture({capabilities:caps.filter(cap=>cap!=='customers.history.payments.read')});try{
  await assert.rejects(f.repo.ledger('customer-a'),/customers.history.payments.read/);
  f.invalidate();await assert.rejects(f.repo.page(),{code:'permission-denied'});
 }finally{f.close();}
});

const draft={identity:'ord_test',createdAt:'2026-11-09T01:00:00Z',customerId:'customer-a',salesEmpId:'employee-a',date:'2026-11-09',lines:[{productId:'product-a',quantity:2,orderedUnit:'Con',billingQuantity:2,billingUnit:'Con',unitPrice:15000}],note:'Đơn kiểm tra'};
test('authorized manual create uses real command repository + atomic Outbox, same ID retry and pending financial guard',async()=>{
 const f=await fixture();try{
  const result=await f.repo.createManual(draft);assert.equal(result.state,'PENDING_SYNC');assert.equal(result.serverConfirmed,false);
  assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM local_commands').get().n,1);
  assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM outbox').get().n,1);
  const again=await f.repo.createManual(draft);assert.equal(again.commandId,result.commandId);
  f.sql.prepare("UPDATE offline_home_feed_records_v1 SET body=? WHERE source='products'").run(JSON.stringify({...f.records.products[0],name:'Tên danh mục mới'}));
  assert.equal((await f.repo.createManual(draft)).commandId,result.commandId,'retry retains original frozen product name');
  const page=await f.repo.page({state:'PENDING_SYNC'});assert.equal(page.rows.length,1);assert.equal(page.rows[0].amount,30000);
  const detail=await f.repo.detail('ord_test');assert.equal(detail.items[0].unit,'Con');assert.equal(detail.items[0].amount,30000);
  assert.equal((await f.repo.ledger('customer-a')).status,'unconfirmed');
  const cursor=(await f.product.localPage({limit:1})).nextCursor;assert.equal(cursor,null);
  await assert.rejects(f.repo.createManual({...draft,note:'changed intent'}),/another intent/);
  assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM outbox').get().n,1);
 }finally{f.close();}
});

test('Outbox receipt advances authoritative state, merges without duplicates and invalidates old cursors',async()=>{
 const f=await fixture({sources:{orders:[order('ord_a'),order('ord_b')]}});try{
  const cursor=(await f.repo.page({limit:1})).nextCursor;assert.ok(cursor);
  await f.repo.createManual(draft);
  assert.equal((await f.repo.page({limit:1,after:cursor})).rows.length,1,'local intent does not rewrite the shared source cursor');
  const command=await f.original.claimDue(scope,{now:Date.now(),leaseMs:10000,maxAttempts:3});
  const receipt={tenantId:scope.tenantId,principalId:scope.principalId,commandId:command.commandId,idempotencyKey:command.idempotencyKey,payloadDigest:command.payloadDigest,entityId:command.entityId,kind:'order.create',outcome:'accepted',document:command.payload};
  await f.original.applyReceipt(scope,command,receipt);
  f.sql.prepare('INSERT INTO offline_home_feed_records_v1 (tenant_id,principal_id,generation,source,id,body) VALUES (?,?,?,?,?,?)').run('tenant-a','user-a','g1','orders',command.entityId,JSON.stringify(command.payload));
  f.payload.sourceCounts.orders++;f.payload.feedSeq=2;f.sql.prepare('UPDATE offline_home_head_v1 SET snapshot_json=?').run(JSON.stringify(f.payload));f.sql.exec('UPDATE offline_home_feed_checkpoint_v1 SET applied_seq=2,reported_seq=2');
  await assert.rejects(f.repo.page({limit:1,after:cursor}),{code:'stale-checkpoint'});
  const page=await f.repo.page({limit:100});assert.equal(page.rows.length,3);assert.equal(page.rows.filter(row=>row.id==='ord_test').length,1);
  assert.equal((await f.repo.detail('ord_test')).localSyncState,'SERVER_CONFIRMED','completed server source takes precedence over older confirmed create copy');
  assert.equal((await f.original.detail('ord_test')).localSyncState,'SYNCED','original create repository behavior remains unchanged');
  assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM outbox').get().n,1,'retains durable queue evidence');
 }finally{f.close();}
});

test('supplier reconciliation includes name/phone matched imports and opening balances',async()=>{
 const customer={id:'customer-a',companyId:'tenant-a',name:'Khách A',phone:'0901234567',openingDebtAmount:500,openingPayableAmount:200};
 const f=await fixture({sources:{customers:[customer],orders:[order('ord_a')],warehouseImports:[{id:'import-a',companyId:'tenant-a',supplierName:'Khách A',supplierPhone:'0901234567',date:'2026-10-01',amount:700}],expenses:[{id:'expense-a',companyId:'tenant-a',customerId:'customer-a',date:'2026-11-01',sourceType:'customer_debt_repayment',amount:50,approvalStatus:'approved'}]}});
 try{const actual=await f.repo.ledger('customer-a'),expected=ledgerModule.buildCustomerReconciledLedger(customer,f.records.orders,[],f.records.warehouseImports,f.records.expenses);
  assert.equal(actual.currentDebt,expected.currentDebt);assert.equal(actual.creditBalance,expected.creditBalance);assert.ok(expected.purchaseDebt>0);
 }finally{f.close();}
});

test('missing create capability and foreign product never enqueue; lookup returns only allowed presentation fields',async()=>{
 const denied=await fixture({capabilities:caps.filter(cap=>cap!=='orders.create')});try{
  await assert.rejects(denied.repo.createManual(draft),/orders.create/);
  assert.equal(denied.sql.prepare('SELECT COUNT(*) AS n FROM outbox').get().n,0);
 }finally{denied.close();}
 const f=await fixture();try{
  f.sql.prepare("UPDATE offline_home_feed_records_v1 SET body=? WHERE source='products'").run(JSON.stringify({id:'product-a',companyId:'tenant-b',name:'Forbidden'}));
  await assert.rejects(f.repo.createManual(draft),/phạm vi/);
  assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM outbox').get().n,0);
  const customers=await f.repo.lookup('customers');assert.deepEqual(Object.keys(customers.rows[0]).sort(),['archived','id','name','unit']);
 }finally{f.close();}
});

test('shared source permission is not inferred from orders.read or orders.create',async()=>{
 const f=await fixture({capabilities:caps.filter(cap=>cap!=='home.orders.read')});try{
  await assert.rejects(f.repo.page(),/home.orders.read/);
  await assert.rejects(f.repo.detail('ord_a'),/home.orders.read/);
  assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM outbox').get().n,0);
 }finally{f.close();}
});

const cas={version:1,serverCAS:true,receiptDispatch:true},editCaps=[...caps,'orders.update','orders.archive'];
const legacy=order('ord_legacy',{note:'old',items:[{productName:'Legacy',quantity:3,amount:100}]});
const changeRequest=(detail,kind='order.update',patch={note:'local edit'},extra={})=>({identity:detail.id,mutationId:randomUUID(),editedAt:'2026-11-09T03:00:00Z',baseToken:detail.mutation.editToken,kind,patch,...extra});
const hash=value=>createHash('sha256').update(canonicalOrder(value)).digest('hex');
function accepted(command,base){const document=applyOrderMetadataPatch(base,command.kind,command.payload.patch,command.payload.editedAt);return {tenantId:scope.tenantId,principalId:scope.principalId,commandId:command.commandId,idempotencyKey:command.idempotencyKey,payloadDigest:command.payloadDigest,entityId:command.entityId,kind:command.kind,outcome:'accepted',document,fingerprint:hash(document)};}

test('CAS client atomically saves immutable note intent+Outbox; stale open editor cannot silently rebase',async()=>{
 const f=await fixture({sources:{orders:[legacy]},capabilities:editCaps,mutationProtocol:cas});try{
  const detail=await f.product.detail(legacy.id),request=changeRequest(detail);
  assert.equal(detail.mutation.canUpdate,true);assert.equal(detail.billingSummaries,null,'missing historical units/prices are not inferred');
  const result=await f.product.change(request);assert.equal(result.state,'PENDING_SYNC');
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM outbox').get().n,1);
  assert.deepEqual(JSON.parse(f.sql.prepare('SELECT local_json FROM offline_order_mutations_v1').get().local_json).items,legacy.items);
  assert.equal((await f.product.change(request)).commandId,result.commandId,'retry does not reinterpret current optimistic body');
  await assert.rejects(f.product.change({...request,patch:{note:'changed same ID'}}),/another intent/);
  await assert.rejects(f.product.change({...request,mutationId:randomUUID()}),{code:'orders-cursor-stale'});
  const command=await f.original.claimDue(scope,{now:Date.now(),leaseMs:10000,maxAttempts:3});
  const bad={...accepted(command,legacy),document:{...accepted(command,legacy).document,amount:1}};
  await assert.rejects(f.original.applyReceipt(scope,command,bad),/protected order fields/);
  assert.equal(f.sql.prepare('SELECT state FROM local_commands').get().state,'SYNCING','invalid receipt transaction rolls back');
  await f.original.applyReceipt(scope,command,accepted(command,legacy));
  assert.equal((await f.product.detail(legacy.id)).localSyncState,'SYNCED');
  assert.equal((await f.product.ledger('customer-a')).status,'unconfirmed','wait for accepted mutation to enter completed feed');
 }finally{f.close();}
});

test('pending create dependency is durable and create receipt cannot erase a newer local note',async()=>{
 const f=await fixture({capabilities:editCaps,mutationProtocol:cas});try{
  const created=await f.repo.createManual(draft),detail=await f.product.detail(draft.identity);
  const edit=await f.product.change(changeRequest(detail));
  assert.equal(f.sql.prepare('SELECT depends_on FROM command_dependencies WHERE command_id=?').get(edit.commandId).depends_on,created.commandId);
  const create=await f.original.claimDue(scope,{now:Date.now(),leaseMs:10000,maxAttempts:3});assert.equal(create.kind,'order.create');
  assert.equal(await f.original.claimDue(scope,{now:Date.now(),leaseMs:10000,maxAttempts:3}),null,'edit waits for authoritative create receipt');
  await f.original.applyReceipt(scope,create,{tenantId:scope.tenantId,principalId:scope.principalId,commandId:create.commandId,idempotencyKey:create.idempotencyKey,payloadDigest:create.payloadDigest,entityId:create.entityId,kind:'order.create',outcome:'accepted',document:create.payload,fingerprint:hash(create.payload)});
  assert.equal((await f.product.detail(draft.identity)).note,'local edit');
  const command=await f.original.claimDue(scope,{now:Date.now(),leaseMs:10000,maxAttempts:3});assert.equal(command.commandId,edit.commandId);
  await f.original.applyReceipt(scope,command,accepted(command,create.payload));
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM outbox').get().n,2);assert.equal((await f.product.detail(draft.identity)).note,'local edit');
 }finally{f.close();}
});

test('client rollback preserves source; conflict resolution keeps old immutable command and newer server financial fields',async()=>{
 const failed=await fixture({sources:{orders:[legacy]},capabilities:editCaps,mutationProtocol:cas});try{
  const detail=await failed.product.detail(legacy.id);failed.failMutationInsert();await assert.rejects(failed.product.change(changeRequest(detail)),/projection failure/);
  assert.equal(failed.sql.prepare('SELECT COUNT(*) n FROM local_commands').get().n,0);assert.equal(failed.sql.prepare('SELECT COUNT(*) n FROM outbox').get().n,0);
  assert.equal((await failed.product.detail(legacy.id)).note,'old');
 }finally{failed.close();}
 const f=await fixture({sources:{orders:[legacy]},capabilities:editCaps,mutationProtocol:cas});try{
  await f.product.change(changeRequest(await f.product.detail(legacy.id)));
  const command=await f.original.claimDue(scope,{now:Date.now(),leaseMs:10000,maxAttempts:3});
  const server={...legacy,note:'new server note',amount:999,totalAmount:999,offlineRevision:4};
  const conflict={tenantId:scope.tenantId,principalId:scope.principalId,commandId:command.commandId,idempotencyKey:command.idempotencyKey,payloadDigest:command.payloadDigest,entityId:command.entityId,kind:command.kind,outcome:'conflict',reason:'order-changed',currentDocument:server,currentFingerprint:hash(server)};
  await f.original.applyReceipt(scope,command,conflict);
  const detail=await f.product.detail(legacy.id);assert.equal(detail.mutation.conflict.serverNote,'new server note');
  const decision=changeRequest(detail,'order.update',{note:'reviewed merge'},{baseToken:detail.mutation.conflict.reviewToken,resolvesConflictId:command.commandId});
  const next=await f.product.change(decision);assert.notEqual(next.commandId,command.commandId);
  assert.equal(f.sql.prepare('SELECT state FROM local_commands WHERE command_id=?').get(command.commandId).state,'CONFLICT_REQUIRES_REVIEW');
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM offline_order_mutation_receipts_v1').get().n,1);
  const projection=JSON.parse(f.sql.prepare('SELECT local_json FROM offline_order_mutations_v1').get().local_json);assert.equal(projection.amount,999);assert.deepEqual(projection.items,legacy.items);
  const resolved=await f.original.claimDue(scope,{now:Date.now(),leaseMs:10000,maxAttempts:3});await f.original.applyReceipt(scope,resolved,accepted(resolved,server));
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM offline_order_mutation_receipts_v1').get().n,2);
 }finally{f.close();}
});

test('protocol wiring and exact signed mutation caps fail closed independently of read/create',async()=>{
 const unwired=await fixture({sources:{orders:[legacy]},capabilities:editCaps});try{const detail=await unwired.product.detail(legacy.id);assert.equal(detail.mutation.protocolReady,false);await assert.rejects(unwired.product.change(changeRequest(detail)),/chưa được nối/);}finally{unwired.close();}
 const denied=await fixture({sources:{orders:[legacy]},mutationProtocol:cas});try{const detail=await denied.product.detail(legacy.id);assert.equal(detail.mutation.canUpdate,false);await assert.rejects(denied.product.change(changeRequest(detail)),/orders.update/);assert.equal(denied.sql.prepare('SELECT COUNT(*) n FROM outbox').get().n,0);}finally{denied.close();}
});

test('Activity/query identity preserves current page on progress/receipt reattach but separates changed query or account',()=>{
 const key=ordersQueryKey(scope,'',{state:''}),saved={key,cursors:[null,'cursor-25'],index:1};
 const page={queryKey:key,positionKey:JSON.stringify('cursor-25'),rows:Array.from({length:25},(_,id)=>({id}))};
 for(const topic of ['home-status','home-progress','customers',undefined])assert.equal(ordersRelevantTopic(topic),false);
 for(const topic of ['orders','home','home-checkpoint'])assert.equal(ordersRelevantTopic(topic),true);
 for(let attach=0;attach<4;attach++){assert.equal(retainedPagination(saved,key),saved);assert.equal(ordersPageMatches(page,key,'cursor-25'),true);assert.equal(page.rows.length,25);}
 const changed=ordersQueryKey(scope,'new query',{state:''});assert.deepEqual(retainedPagination(saved,changed),{key:changed,cursors:[null],index:0});assert.equal(ordersPageMatches(page,changed,null),false);
 const other=ordersQueryKey({...scope,principalId:'other'},'',{state:''});assert.equal(ordersPageMatches(page,other,'cursor-25'),false);
});

test('synced local edit never masks newer completed server data, including legacy writes which retain CAS revision',async()=>{
 const f=await fixture({sources:{orders:[legacy]},capabilities:editCaps,mutationProtocol:cas});try{
  await f.product.change(changeRequest(await f.product.detail(legacy.id)));
  const command=await f.original.claimDue(scope,{now:Date.now(),leaseMs:10000,maxAttempts:3});const receipt=accepted(command,legacy);await f.original.applyReceipt(scope,command,receipt);
  const newer={...receipt.document,amount:777,totalAmount:777,note:'later server edit'};
  f.sql.prepare("UPDATE offline_home_feed_records_v1 SET body=?,seq=2 WHERE source='orders'").run(JSON.stringify(newer));f.payload.feedSeq=2;
  f.sql.prepare('UPDATE offline_home_head_v1 SET snapshot_json=?').run(JSON.stringify(f.payload));f.sql.exec('UPDATE offline_home_feed_checkpoint_v1 SET applied_seq=2,reported_seq=2');
  const detail=await f.product.detail(legacy.id);assert.equal(detail.note,'later server edit');assert.equal(detail.amount,777);assert.equal(detail.localSyncState,'SERVER_CONFIRMED');
  assert.equal((await f.product.ledger('customer-a')).currentDebt,777);
  await f.product.change(changeRequest(detail,'order.update',{note:'new reviewed edit'}));
  const next=await f.original.claimDue(scope,{now:Date.now(),leaseMs:10000,maxAttempts:3});assert.equal(next.payload.baseCommandId,null);assert.equal(next.payload.baseFingerprint,hash(newer));
  assert.equal(JSON.parse(f.sql.prepare('SELECT local_json FROM offline_order_mutations_v1').get().local_json).amount,777);
 }finally{f.close();}
});

test('missing business source metadata has an exact contract diagnostic, never an empty missing-capability label',async()=>{
 const adapter=createOrderProductAdapter({business:{page:()=>{throw Error('must not query without source contract');}},capabilities:['home.read','orders.read']});
 await assert.rejects(adapter.page(),/runtime\.business\.sources\.orders/);
 await assert.rejects(adapter.lookup('products'),/runtime\.business\.sources\.products/);
 const malformed=createOrderProductAdapter({business:{page:()=>{},sources:{orders:{}}},capabilities:['home.read','orders.read']});
 await assert.rejects(malformed.page(),/sources\.orders\.requiredCapabilities/);
});

test('Orders head transfers only metadata from a 2MB snapshot in one SELECT with exact requested source counts',async()=>{
 const f=await fixture({sources:{orders:[order('ord_head')]}});try{
  f.payload.snapshot={largeFinancialReport:'PRIVATE_FULL_SNAPSHOT_'.repeat(110000)};
  f.sql.prepare('UPDATE offline_home_head_v1 SET snapshot_json=?').run(JSON.stringify(f.payload));
  assert.ok(Buffer.byteLength(JSON.stringify(f.payload))>2*1024*1024);
  f.calls.length=0;const detail=await f.product.detail('ord_head');assert.equal(detail.checkpoint.seq,1);
  const heads=f.calls.filter(call=>call.statement.includes('AS head_metadata'));
  assert.equal(heads.length,1);assert.ok(heads[0].resultBytes<4096,'full Home snapshot must not cross the query-result boundary');
  assert.deepEqual(heads[0].resultColumns.sort(),['actual_0','applied_seq','event','generation','head_metadata','reported_seq']);
  assert.equal(f.calls.filter(call=>call.statement.startsWith('SELECT applied_seq,reported_seq')).length,0);
  f.calls.length=0;const ledger=await f.product.ledger('customer-a');assert.equal(ledger.status,'complete');
  const ledgerHeads=f.calls.filter(call=>call.statement.includes('AS head_metadata'));
  assert.equal(ledgerHeads.length,1);assert.ok(ledgerHeads[0].resultBytes<4096);
  assert.equal(ledgerHeads[0].resultColumns.filter(column=>column.startsWith('actual_')).length,5,'every requested history source retains its exact COUNT check');
 }finally{f.close();}
});

test('zero source count is valid only when explicitly present and exact; missing/invalid zero metadata fails closed',async()=>{
 const f=await fixture();try{
  assert.equal(f.payload.sourceCounts.payments,0);assert.equal((await f.product.ledger('customer-a')).status,'complete');
  for(const value of [undefined,null,false,true,'0',-1,1]){
   if(value===undefined)delete f.payload.sourceCounts.payments;else f.payload.sourceCounts.payments=value;
   f.sql.prepare('UPDATE offline_home_head_v1 SET snapshot_json=?').run(JSON.stringify(f.payload));
   await assert.rejects(f.product.ledger('customer-a'),{code:'orders-source-incomplete'},String(value));
  }
  f.payload.sourceCounts.payments=0;f.payload.availableSources=f.payload.availableSources.filter(source=>source!=='payments');
  f.sql.prepare('UPDATE offline_home_head_v1 SET snapshot_json=?').run(JSON.stringify(f.payload));
  await assert.rejects(f.product.ledger('customer-a'),{code:'orders-source-incomplete'});
 }finally{f.close();}
});

test('narrow head preserves checkpoint matching, missing-head behavior and generation validation without caching',async()=>{
 const f=await fixture({sources:{orders:[order('ord_head')]}});try{
  const detail=await f.product.detail('ord_head');
  for(const sql of ['UPDATE offline_home_feed_checkpoint_v1 SET applied_seq=2','UPDATE offline_home_feed_checkpoint_v1 SET applied_seq=1,reported_seq=2','DELETE FROM offline_home_feed_checkpoint_v1']){
   f.sql.exec(sql);await assert.rejects(f.product.detail('ord_head'),{code:'orders-cursor-stale'});
  }
  f.sql.exec("INSERT INTO offline_home_feed_checkpoint_v1 VALUES ('tenant-a','user-a','r1','g1',2,2)");
  f.payload.feedSeq=2;f.sql.prepare('UPDATE offline_home_head_v1 SET snapshot_json=?').run(JSON.stringify(f.payload));
  await assert.rejects(f.product.ledger('customer-a',detail.checkpoint),{code:'orders-cursor-stale'});
  f.payload.feedGeneration='other-generation';f.sql.prepare('UPDATE offline_home_head_v1 SET snapshot_json=?').run(JSON.stringify(f.payload));
  await assert.rejects(f.product.detail('ord_head'),{code:'orders-source-incomplete'});
  f.sql.exec('DELETE FROM offline_home_head_v1');await assert.rejects(f.product.detail('ord_head'),{code:'orders-source-incomplete'});
 }finally{f.close();}
});

test('joined head scopes counts/checkpoint/MAX event to account and revision, including foreign zero-source rows',async()=>{
 const f=await fixture({sources:{orders:[order('ord_head')]}});try{
  const insert=f.sql.prepare('INSERT INTO local_commands VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)');
  insert.run('tenant-a','user-a','own-event','session-a','r1','dev-a','test.read','e',0,1,'{}','own-event','SYNCED');
  const ownEvent=f.sql.prepare("SELECT MAX(event_id) n FROM command_events WHERE tenant_id='tenant-a' AND principal_id='user-a'").get().n;
  insert.run('tenant-a','other-user','foreign-event','session-b','r1','dev-b','test.read','e',0,2,'{}','foreign-event','SYNCED');
  f.sql.prepare('INSERT INTO offline_home_head_v1 (tenant_id,principal_id,revision,generation,snapshot_json) VALUES (?,?,?,?,?)').run('tenant-a','other-user','r1','g1',JSON.stringify({...f.payload,feedSeq:999}));
  f.sql.prepare('INSERT INTO offline_home_feed_checkpoint_v1 VALUES (?,?,?,?,?,?)').run('tenant-a','other-user','r1','g1',999,999);
  f.sql.prepare('INSERT INTO offline_home_head_v1 (tenant_id,principal_id,revision,generation,snapshot_json) VALUES (?,?,?,?,?)').run('tenant-a','user-a','other-revision','g2',JSON.stringify({...f.payload,feedGeneration:'g2',feedSeq:500}));
  const foreign={id:'foreign-pay',companyId:'tenant-a',customerId:'customer-a',amount:9999};
  f.sql.prepare('INSERT INTO offline_home_feed_records_v1 (tenant_id,principal_id,generation,source,id,body) VALUES (?,?,?,?,?,?)').run('tenant-a','other-user','g1','payments',foreign.id,JSON.stringify(foreign));
  f.sql.prepare('INSERT INTO offline_home_feed_records_v1 (tenant_id,principal_id,generation,source,id,body) VALUES (?,?,?,?,?,?)').run('tenant-b','user-a','g1','payments','tenant-b-pay',JSON.stringify({...foreign,id:'tenant-b-pay',companyId:'tenant-b'}));
  const detail=await f.product.detail('ord_head');assert.equal(detail.checkpoint.event,ownEvent);assert.equal(detail.checkpoint.seq,1);
  assert.equal((await f.product.ledger('customer-a')).currentDebt,100,'foreign rows do not change exact zero payment count or ledger inputs');
 }finally{f.close();}
});

test('queued or pre-aborted history rolls back without SQL/calculation and preserves Outbox',async()=>{
 const hooks={},f=await fixture({hooks});try{
  await f.repo.createManual(draft);const before=f.sql.prepare('SELECT * FROM outbox').all();
  const aborted=new AbortController();aborted.abort();f.calls.length=0;
  await assert.rejects(f.repo.ledger('customer-a',null,{signal:aborted.signal}),{name:'AbortError'});assert.equal(f.calls.length,0);
  const queued=deferredRead(),release=deferredRead(),outcomes=[];let calculated=0;
  hooks.beforeTransaction=async()=>{queued.resolve();await release.promise;};hooks.onTransaction=value=>outcomes.push(value);hooks.onCalculate=()=>{calculated++;};
  const controller=new AbortController(),pending=f.repo.ledger('customer-a',null,{signal:controller.signal});
  await queued.promise;controller.abort();release.resolve();await assert.rejects(pending,{code:'orders-read-aborted'});
  assert.deepEqual(outcomes,['rollback']);assert.equal(calculated,0);assert.equal(f.calls.length,0);
  delete hooks.beforeTransaction;
  assert.equal((await f.repo.detail('ord_test')).id,'ord_test');assert.deepEqual(f.sql.prepare('SELECT * FROM outbox').all(),before);
 }finally{f.close();}
});

test('abort after full history page stops next page/calculator and frees transaction',async()=>{
 const hooks={},f=await fixture({hooks,sources:{orders:[order('ord_a')],payments:Array.from({length:130},(_,i)=>({id:'pay_'+String(i).padStart(3,'0'),companyId:'tenant-a',customerId:'customer-a',amount:1,approvalStatus:'approved'}))}});
 try{
  await f.repo.detail('ord_a');const controller=new AbortController(),outcomes=[];let pages=0,calculated=0;
  hooks.onCalculate=()=>{calculated++;};hooks.onTransaction=value=>outcomes.push(value);
  hooks.afterQuery=(statement,params,rows)=>{if(statement.includes('ORDER BY id LIMIT 100')&&params.includes('payments')){pages++;assert.equal(rows.length,100);controller.abort();}};
  await assert.rejects(f.repo.ledger('customer-a',null,{signal:controller.signal}),{name:'AbortError'});
  assert.equal(pages,1);assert.equal(calculated,0);assert.deepEqual(outcomes,['rollback']);delete hooks.afterQuery;
  assert.equal((await f.repo.ledger('customer-a')).status,'complete');
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM offline_home_feed_records_v1 WHERE source='payments'").get().n,130);
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM outbox').get().n,0);
 }finally{f.close();}
});

test('signal never bypasses checkpoint, scoped ownership or signed history security',async()=>{
 const hooks={},f=await fixture({hooks,sources:{orders:[order('ord_a')],payments:[{id:'pay-a',customerId:'customer-a',companyId:'tenant-a',amount:1}]}});
 try{
  const detail=await f.repo.detail('ord_a');let calculated=0;hooks.onCalculate=()=>{calculated++;};
  await assert.rejects(f.repo.ledger('customer-a',{...detail.checkpoint,seq:detail.checkpoint.seq+1},{signal:new AbortController().signal}),{code:'orders-cursor-stale'});
  hooks.afterQuery=(statement,params)=>{if(statement.includes('ORDER BY id LIMIT 100')&&params.includes('payments'))f.invalidate();};
  await assert.rejects(f.repo.ledger('customer-a',detail.checkpoint,{signal:new AbortController().signal}),{code:'permission-denied'});assert.equal(calculated,0);
 }finally{f.close();}
 const denied=await fixture({capabilities:caps.filter(cap=>cap!=='customers.history.payments.read')});try{
  await assert.rejects(denied.repo.ledger('customer-a',null,{signal:new AbortController().signal}),/customers.history.payments.read/);
  assert.equal(denied.calls.some(call=>call.statement.includes('ORDER BY id LIMIT 100')),false);
 }finally{denied.close();}
});
