import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import {parse} from '@babel/parser';
import traverseModule from '@babel/traverse';
import initSqlJs from 'sql.js';
import {createOfflineCashflowRepository,canonicalCashflow} from '../../data/offlineCashflowRepository.js';
import {createVerifiedDataSession} from '../../data/verifiedDataSession.js';
import {createOfflineCommandRepository} from '../../data/offlineCommandRepository.js';

const require=createRequire(import.meta.url);
const {createOfflineCashflowCommandService,CONTRACT}=require('../../../../../../functions/offlineCashflowCommands.cjs');
const {fingerprint}=require('../../../../../../functions/offlineCustomerCommands.cjs');
const digest=text=>createHash('sha256').update(text).digest('hex');
const shared=readFileSync(new URL('../customers/productCRMShared.jsx',import.meta.url),'utf8');
const app=readFileSync(new URL('../../App.jsx',import.meta.url),'utf8');
const roots=['parseLooseMoneyValue','capitalizeFirst','CASHFLOW_APPROVAL_STATUS','normalizeLeadingLabel','normalizeExpenseCategoryLabel','isOrderCodeAutoMatchEnabled','isEmployeeDriverPosition'];
const traverse=traverseModule.default||traverseModule,bindings=new Map(),declarations=new Map();
for(const [index,source]of [shared,app].entries()){
  let program;traverse(parse(source,{sourceType:'module',plugins:['jsx']}),{Program(p){program=p;p.stop();}});
  for(const [name,binding]of Object.entries(program.scope.bindings))if(binding.path.isVariableDeclarator()||binding.path.isFunctionDeclaration())bindings.set(name,{binding,source,index});
}
function collect(name){
  if(declarations.has(name))return;
  const entry=bindings.get(name);assert(entry,'Missing original pure binding '+name);declarations.set(name,entry);
  entry.binding.path.traverse({ReferencedIdentifier(p){const b=p.scope.getBinding(p.node.name);if(b&&(b.scope.path.isProgram()||b.kind==='module'))collect(p.node.name);}});
}
roots.forEach(collect);
const domain=vm.runInNewContext([...declarations.values()].sort((a,b)=>a.index-b.index||a.binding.path.node.start-b.binding.path.node.start)
  .map(({binding,source})=>(binding.path.isVariableDeclarator()?'const ':'')+source.slice(binding.path.node.start,binding.path.node.end)+';').join('\n')+'\n({'+roots.join(',')+'})');
const input={amount:120000,date:'2026-11-09',note:'chi thử',category:'Chi phí khác'};
function serverFixture(t){
  const previous=process.env.FIRESTORE_EMULATOR_HOST;process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8385';
  t.after(()=>{if(previous===undefined)delete process.env.FIRESTORE_EMULATOR_HOST;else process.env.FIRESTORE_EMULATOR_HOST=previous;});
  const records=new Map(),actor={uid:'u1',tenantId:'t1'},appId='dev';
  const path=(source,id)=>`artifacts/${appId}/public/data/${source}/${id}`;
  records.set(path('employees','e1'),{id:'e1',companyId:'t1',position:'Nhân sự',actions:['create_income','create_expense','edit_income_voucher','edit_expense_voucher']});
  records.set(path('companies','t1'),{id:'t1',autoReconcileByOrderCode:false});
  records.set(path('customers','c1'),{id:'c1',companyId:'t1'});
  let caps=['home.read','home.cashflow.read',...Object.keys(CONTRACT)],failCommit=false,reads=0;
  const db={doc:path=>({path}),async runTransaction(work){
    const writes=[];let wrote=false;
    const result=await work({get:async ref=>{assert.equal(wrote,false,'Firestore reads must precede every write');reads++;return {exists:records.has(ref.path),data:()=>structuredClone(records.get(ref.path))};},
      set:(ref,body)=>{wrote=true;writes.push([ref.path,structuredClone(body)]);}});
    if(failCommit)throw Error('injected atomic commit failure');
    for(const [key,value]of writes)records.set(key,value);return result;
  }};
  const authorize=async(tx,a)=>{
    const employee=(await tx.get(db.doc(path('employees','e1')))).data();
    const company=(await tx.get(db.doc(path('companies',a.tenantId)))).data();
    return {capabilities:caps,subject:{company,employee,currentUser:{id:employee.id,companyId:employee.companyId,firebaseUid:a.uid}}};
  };
  const policy={hasCompanyRolePermissionAction:(subject,module,action)=>module==='finance'&&subject.employee.actions.includes(action),isOwnerAccountUser:()=>false};
  const apply=createOfflineCashflowCommandService({db,projectId:'demo-cashflow',appId,authorize,policy,domain});
  const command=(key,kind,entityId,body,proof={})=>{const baseRevision=proof.baseRevision||0,payload={input:body,baseRevision,...(proof.baseFingerprint?{baseFingerprint:proof.baseFingerprint}: {})};return {commandId:key,idempotencyKey:key,kind,entityId,baseRevision,payload,payloadDigest:digest(JSON.stringify(payload))};};
  return {records,path,actor,apply,command,db,authorize,policy,setCaps:value=>{caps=value;},failCommit:value=>{failCommit=value;},reads:()=>reads};
}

test('server uses original normalizers; atomic receipt retries recheck real role and signed capability',async t=>{
  const f=serverFixture(t),command=f.command('create1','cashflow.expense.create','exp1',input);
  const result=await f.apply(f.actor,command);
  assert.equal(result.outcome,'accepted');assert.equal(result.document.note,'Chi thử');assert.equal(result.document.approvalStatus,'pending_handover');
  assert.equal(result.fingerprint,digest(canonicalCashflow(result.document)));
  const count=f.records.size,reads=f.reads();assert.deepEqual(await f.apply(f.actor,command),result);assert.equal(f.records.size,count);assert(f.reads()>reads);
  f.records.get(f.path('employees','e1')).actions=[];
  await assert.rejects(f.apply(f.actor,command),/role action denied/);
  f.records.get(f.path('employees','e1')).actions=['create_expense'];f.setCaps(['home.read','home.cashflow.read']);
  await assert.rejects(f.apply(f.actor,command),/authority required/);
});

test('server CAS preserves conflicts; idempotency binds kind, entity, revision and exact payload',async t=>{
  const f=serverFixture(t),created=await f.apply(f.actor,f.command('c','cashflow.expense.create','exp1',input));
  const proof={baseRevision:1,baseFingerprint:created.fingerprint};
  const update=f.command('u','cashflow.expense.update','exp1',{...input,amount:130000},proof);
  assert.equal((await f.apply(f.actor,update)).revision,2);
  const conflict=await f.apply(f.actor,f.command('stale','cashflow.expense.update','exp1',{...input,amount:140000},proof));
  assert.equal(conflict.outcome,'conflict');assert.equal(conflict.currentRevision,2);
  assert.equal(f.records.get(f.path('expenses','exp1')).amount,130000);
  await assert.rejects(f.apply(f.actor,f.command('u','cashflow.expense.update','exp1',{...input,amount:1},proof)),/idempotency key reused/);
  await assert.rejects(f.apply(f.actor,{...update,payloadDigest:'wrong'}),/digest mismatch/);
});

test('server rejects compound authority, wrong relations and income auto-matching; pending income does not post debt',async t=>{
  const f=serverFixture(t),income={amount:1000,date:'2026-11-09',note:'thu thử',customerId:'c1',method:'Tiền mặt'};
  await assert.rejects(f.apply(f.actor,f.command('bad','cashflow.expense.create','x',{...input,sourceType:'customer_debt_repayment'})),/Unsupported cashflow fields/);
  f.records.get(f.path('customers','c1')).companyId='other';
  await assert.rejects(f.apply(f.actor,f.command('badcustomer','cashflow.income.create','p1',income)),/relation denied/);
  f.records.get(f.path('customers','c1')).companyId='t1';f.records.get(f.path('companies','t1')).autoReconcileByOrderCode=true;
  await assert.rejects(f.apply(f.actor,f.command('match','cashflow.income.create','p1',income)),/order-matching/);
  f.records.get(f.path('companies','t1')).autoReconcileByOrderCode=false;
  const result=await f.apply(f.actor,f.command('ok','cashflow.income.create','p1',income));
  assert.equal(result.document.requiresApproval,true);assert.equal(result.document.approvalStatus,'pending_handover');
  assert(![...f.records.keys()].some(path=>path.includes('notifications')||path.includes('zalo')||path.includes('debt')));
  const approved={...result.document,approvalStatus:'approved'};f.records.set(f.path('payments','p1'),approved);
  await assert.rejects(f.apply(f.actor,f.command('editapproved','cashflow.income.update','p1',income,{baseRevision:1,baseFingerprint:fingerprint(approved)})),/pending manual income/);
});

test('server rolls back business mutation with receipt and refuses non-Development construction',async t=>{
  const f=serverFixture(t),before=f.records.size;f.failCommit(true);
  await assert.rejects(f.apply(f.actor,f.command('atomic','cashflow.expense.create','exp1',input)),/atomic commit failure/);
  assert.equal(f.records.size,before);f.failCommit(false);
  assert.equal((await f.apply(f.actor,f.command('atomic','cashflow.expense.create','exp1',input))).outcome,'accepted');
  assert.throws(()=>createOfflineCashflowCommandService({db:f.db,projectId:'real-project',appId:'dev',authorize:f.authorize,policy:f.policy,domain}),/Development Emulator/);
  assert.throws(()=>createOfflineCashflowCommandService({db:f.db,projectId:'demo-cashflow',appId:'dev',authorize:f.authorize,policy:f.policy,domain:{}}),/Original cashflow domain/);
});

test('server derives expense approval from original action; driver reports and inactive employee relations stay unsupported',async t=>{
  const f=serverFixture(t),employee=f.records.get(f.path('employees','e1'));
  employee.actions.push('approve_driver_cashflow');
  const receipt=await f.apply(f.actor,f.command('approvedexpense','cashflow.expense.create','exp1',input));
  assert.equal(receipt.document.approvalStatus,'approved');assert.equal(receipt.document.requiresApproval,false);
  employee.actions=['edit_cashflow'];
  assert.equal((await f.apply(f.actor,f.command('genericedit','cashflow.expense.update','exp1',{...input,amount:140000},{baseRevision:1,baseFingerprint:receipt.fingerprint}))).outcome,'accepted');
  employee.actions=['create_expense'];employee.position='Tài xế';
  await assert.rejects(f.apply(f.actor,f.command('driver','cashflow.expense.create','exp2',input)),/delivery workflow/);
  employee.position='Nhân sự';employee.isArchived=true;
  await assert.rejects(f.apply(f.actor,f.command('inactive','cashflow.expense.create','exp2',input)),/relation denied/);
  assert(!f.records.has(f.path('expenses','exp2')));
});

async function localFixture(t,extra={}){
  const SQL=await initSqlJs(),db=new SQL.Database();t.after(()=>db.close());
  db.run(readFileSync(new URL('../../../performance/offline-first/schema-v1.sql',import.meta.url),'utf8'));
  // Original command triggers and queue, in the same database as the overlays.
  let tail=Promise.resolve();const adapter={run:(sql,params=[])=>db.run(sql,params),query:(sql,params=[])=>{const st=db.prepare(sql);try{st.bind(params);const rows=[];while(st.step())rows.push(st.getAsObject());return rows;}finally{st.free();}}};
  const database={transaction(work){const pending=tail.then(async()=>{db.run('BEGIN');try{const result=await work(adapter);db.run('COMMIT');return result;}catch(error){db.run('ROLLBACK');throw error;}});tail=pending.catch(()=>{});return pending;}};
  db.run('CREATE TABLE offline_home_feed_records_v1 (tenant_id,principal_id,generation,source,id,seq,body)');
  db.run('CREATE TABLE offline_home_head_v1 (tenant_id,principal_id,revision,generation,snapshot_json)');
  db.run('CREATE TABLE offline_home_feed_checkpoint_v1 (tenant_id,principal_id,revision,generation,applied_seq,reported_seq)');
  const scope={projectId:'demo-cashflow',tenantId:'t1',principalId:'u1',sessionId:'s1',permissionRevision:'r1'},session=createVerifiedDataSession(scope);
  const options={database,session,deviceId:'d1',uuid:randomUUID,digest,employeeId:'e1',development:true,projectId:'demo-cashflow',
    authorize:async()=>({...scope,expiresAtMs:Date.now()+60000,capabilities:['home.read','home.cashflow.read',...Object.keys(CONTRACT)],appSession:{user:{id:'e1'}}}),...extra};
  return {db,database,adapter,options,scope,session,repository:await createOfflineCashflowRepository(options),leaseOwner:createOfflineCommandRepository({...options,authorize:async()=>{}})};
}

test('same SQLite command/outbox/overlay transaction rolls back together; retry keeps original identity',async t=>{
  let fail=true;const f=await localFixture(t,{beforeEnqueueCommit:()=>{if(fail)throw Error('crash before local commit');}});
  await assert.rejects(f.repository.create('expenses',input,'exp1'),/crash/);
  for(const table of ['local_commands','outbox','offline_cashflow_v1'])assert.equal(f.db.exec('SELECT COUNT(*) FROM '+table)[0].values[0][0],0);
  fail=false;const created=await f.repository.create('expenses',input,'exp1');
  assert.equal((await f.repository.create('expenses',input,'exp1')).commandId,created.commandId);
  assert.equal(f.db.exec('SELECT COUNT(*) FROM local_commands')[0].values[0][0],1);
  assert.equal(f.db.exec('SELECT COUNT(*) FROM outbox')[0].values[0][0],1);
  await assert.rejects(f.repository.create('expenses',{...input,amount:7},'exp1'),/nội dung khác/);
});

test('existing sync owner leases cashflow; authoritative receipt conflict retained and explicit resolution is a NEW command',async t=>{
  const server=serverFixture(t),f=await localFixture(t);
  await f.repository.create('expenses',input,'exp1');
  const lease=()=>f.leaseOwner.claimDue(f.scope,{now:Date.now(),leaseMs:60000,maxAttempts:8});
  const command=await lease(),receipt=await server.apply(server.actor,command);await f.repository.applyReceipt(f.scope,command,receipt);
  assert.equal((await f.repository.page())[0].state,'SYNCED');
  const proof=await f.repository.prepareEdit('expenses','exp1');
  await f.repository.update(proof,{...input,amount:130000});
  const live=server.records.get(server.path('expenses','exp1'));server.records.set(server.path('expenses','exp1'),{...live,note:'External change'});
  const update=await lease(),conflict=await server.apply(server.actor,update);await f.repository.applyReceipt(f.scope,update,conflict);
  assert.equal((await f.repository.page())[0].state,'CONFLICT_REQUIRES_REVIEW');
  await assert.rejects(f.repository.update(proof,{...input,amount:1}),/xung đột/);
  const row=(await f.repository.page())[0];
  await assert.rejects(f.repository.resolveConflict('expenses','exp1',{...input,amount:140000},{commandId:'old',currentFingerprint:conflict.currentFingerprint,currentRevision:conflict.currentRevision}),/xung đột đã thay đổi/);
  const retry=await f.repository.resolveConflict('expenses','exp1',{...input,amount:140000},{commandId:row.commandId,currentFingerprint:conflict.currentFingerprint,currentRevision:conflict.currentRevision});assert.notEqual(retry.commandId,update.commandId);
  const resolved=await lease();await f.repository.applyReceipt(f.scope,resolved,await server.apply(server.actor,resolved));
  assert.equal((await f.repository.page())[0].state,'SYNCED');assert.equal(server.records.get(server.path('expenses','exp1')).amount,140000);
  const history=f.adapter.query('SELECT state FROM local_commands ORDER BY created_at,command_id');
  assert.equal(history.filter(row=>row.state==='CONFLICT_REQUIRES_REVIEW').length,1);
  assert.equal(history.filter(row=>row.state==='SYNCED').length,2);
});

test('receipt local failure is retryable with same intent; modified receipt and missing signed cap fail closed',async t=>{
  const server=serverFixture(t);let crash=true;
  const f=await localFixture(t,{beforeReceiptCommit:()=>{if(crash)throw Error('crash before receipt commit');}});
  await f.repository.create('expenses',input,'exp1');
  const command=await f.leaseOwner.claimDue(f.scope,{now:Date.now(),leaseMs:60000,maxAttempts:8}),receipt=await server.apply(server.actor,command);
  await assert.rejects(f.repository.applyReceipt(f.scope,command,receipt),/crash/);
  assert.equal((await f.repository.page())[0].state,'SYNCING');crash=false;
  await assert.rejects(f.repository.applyReceipt(f.scope,command,{...receipt,document:{...receipt.document,amount:1}}),/không xác thực/);
  await f.repository.applyReceipt(f.scope,command,receipt);assert.equal((await f.repository.page())[0].state,'SYNCED');
  const readonly=await createOfflineCashflowRepository({...f.options,authorize:async()=>({...f.scope,expiresAtMs:Date.now()+10000,capabilities:['home.read','home.cashflow.read'],appSession:{user:{id:'e1'}}})});
  await assert.rejects(readonly.create('expenses',input,'exp2'),/Thiếu quyền/);
});

test('signed authority is rechecked inside queued local commit and rolls back intent plus overlay on revocation',async t=>{
  const f=await localFixture(t);let allowed=true;
  const repository=await createOfflineCashflowRepository({...f.options,
    authorize:async()=>({...f.scope,expiresAtMs:Date.now()+10000,capabilities:['home.read','home.cashflow.read',...(allowed?Object.keys(CONTRACT):[])],appSession:{user:{id:'e1'}}}),
    beforeEnqueueCommit:()=>{allowed=false;},
  });
  await assert.rejects(repository.create('expenses',input,'exp1'),/Thiếu quyền/);
  for(const table of ['local_commands','outbox','offline_cashflow_v1'])assert.equal(f.db.exec('SELECT COUNT(*) FROM '+table)[0].values[0][0],0);
});

test('Finance effects use identity guards and existing app Back hook; drafts have no synchronization effects',()=>{
  const view=readFileSync(new URL('./OfflineFinanceWorkspace.jsx',import.meta.url),'utf8'),editor=readFileSync(new URL('./OfflineCashflowEditor.jsx',import.meta.url),'utf8');
  parse(view,{sourceType:'module',plugins:['jsx']});parse(editor,{sourceType:'module',plugins:['jsx']});
  assert(view.includes('useAppScreenBack(closeInner)'));assert(view.includes('completed.current?.identity === identity'));
  assert(view.includes('previous.identity === identity ? {...previous,loading:true'));
  assert(!editor.includes('useEffect'));assert(!view.includes('backButton'));assert(!view.includes('useDebouncedValue'));
});


test('read lease cannot substitute full write authorization and write rejection rolls back intent/outbox',async t=>{
 let fixture,writeChecks=0,deny=false;
 fixture=await localFixture(t,{authorizeWrite:async()=>{writeChecks++;if(deny)throw Error('full write verification rejected');return {...fixture.scope,projectId:'demo-cashflow',expiresAtMs:Date.now()+60000,capabilities:['home.read','home.cashflow.read',...Object.keys(CONTRACT)],appSession:{user:{id:'e1'}}};}});
 assert.equal(writeChecks,0,'initial read/DDL uses read authority');await fixture.repository.page();assert.equal(writeChecks,0);
 await fixture.repository.create('expenses',input,'exp-verified');assert(writeChecks>=2,'write reverified before commit');deny=true;
 await assert.rejects(fixture.repository.create('expenses',{...input,note:'must not commit'},'exp-denied'),/full write verification rejected/);
 assert.equal(fixture.db.exec('SELECT COUNT(*) FROM local_commands')[0].values[0][0],1);assert.equal(fixture.db.exec('SELECT COUNT(*) FROM offline_cashflow_v1')[0].values[0][0],1);assert.equal(fixture.db.exec('SELECT COUNT(*) FROM outbox')[0].values[0][0],1);
});
