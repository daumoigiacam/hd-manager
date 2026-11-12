import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {parse} from '@babel/parser';
import {createOfflineBusinessDirectory,OFFLINE_BUSINESS_SOURCES} from '../../data/offlineBusinessDirectory.js';
import {createHomeFeedStorage} from '../../data/offlineHomeFeedStorage.js';
import {HOME_FEED_SOURCES} from '../../data/homeFeedContract.js';
import {createPayrollEmployeeSnapshot,createPayrollPeriodRecord} from '../../utils/payrollPeriodLock.js';
import {buildEmployeePayrollPolicyUpdate} from '../../utils/payrollPolicyHistory.js';
import {inspectPayrollSnapshot} from '../../utils/payrollSnapshotIntegrity.js';
import {createOfflineHRReadRepository,hrMonthRange} from './offlineHRReadRepository.js';
import {createHRFilters,hrDirectoryOptions,hrReadAccess,hrSourceState,readHRPage,readHRDetail} from './offlineHRModel.js';

const ids=page=>page.items.map(row=>row.id);
function payroll(employeeId='e1',monthKey='2026-10'){
  const base={id:employeeId,name:'Nguyễn Thị Hồng',companyId:'tenant',position:'accounting',basicSalary:10000000};
  const employee={...base,...buildEmployeePayrollPolicyUpdate({nextEmployee:base,effectiveFrom:'2026-01-01',changedAt:'2026-01-01T00:00:00Z'})};
  const salaryDetails={monthKey,workDays:24,baseSalaryCalc:9000000,grossSalary:10000000,netSalary:8500000,endingDebt:0,
    totalAdvance:1000000,totalPenalty:500000,deductionTotal:1500000,totalBonus:1000000};
  const snapshot=createPayrollEmployeeSnapshot({companyId:'tenant',monthKey,employee,salaryDetails,lockedAt:'2026-10-31T12:00:00Z'});
  assert.equal(inspectPayrollSnapshot(snapshot).isComplete,true);
  const period=createPayrollPeriodRecord({companyId:'tenant',monthKey,snapshots:[snapshot],lockedAt:snapshot.lockedAt});
  assert(period);
  return {snapshot,period,employee};
}
async function fixture(t,records=[]){
  const sql=new DatabaseSync(':memory:');t.after(()=>sql.close());
  const scope={tenantId:'tenant',principalId:'principal',permissionRevision:'r1',sessionId:'login1'};
  let current=true,hook=null;
  const statements=[];
  const grant={...scope,expiresAtMs:Date.now()+3600000,capabilities:[...new Set(Object.values(OFFLINE_BUSINESS_SOURCES).flatMap(s=>s.requiredCapabilities))]};
  const db={async query(statement,params=[]){statements.push({statement,params});if(hook)await hook(statement,params);return sql.prepare(statement).all(...params).map(row=>({...row}));},
    async run(statement,params=[]){statements.push({statement,params});return sql.prepare(statement).run(...params);}};
  let tail=Promise.resolve();
  const database={transaction(work){const task=tail.then(async()=>{sql.exec('BEGIN IMMEDIATE');try{const value=await work(db);sql.exec('COMMIT');return value;}catch(error){sql.exec('ROLLBACK');throw error;}});tail=task.catch(()=>{});return task;}};
  sql.exec(`CREATE TABLE offline_home_head_v1(tenant_id TEXT,principal_id TEXT,revision TEXT,generation TEXT,captured_at INTEGER,day_key TEXT,snapshot_json TEXT,PRIMARY KEY(tenant_id,principal_id));
    CREATE TABLE protected_outbox(id TEXT,payload TEXT);INSERT INTO protected_outbox VALUES('pending','unchanged');`);
  const counts=Object.fromEntries(HOME_FEED_SOURCES.map(source=>[source,0]));
  const events=records.map(([source,document],i)=>{counts[source]++;return {source,id:document.id,document:{companyId:scope.tenantId,...document},operation:'upsert',seq:i+1,generation:'g1'};});
  const head={...scope,ready:true,generation:'g1',seq:events.length,asOfDay:'2026-11-09',sources:HOME_FEED_SOURCES,counts};
  const storage=await createHomeFeedStorage({transaction:database.transaction,keys:[scope.tenantId,scope.principalId],scope});
  for(let i=0;i<events.length;i+=100)await storage.applyPage(head,{...scope,generation:'g1',after:i,target:head.seq,events:events.slice(i,i+100)});
  if(!events.length)await storage.checkpoint(head);
  await storage.publish(head,{counts,snapshot:{finance:{todayKey:head.asOfDay}},overview:{snapshot:{finance:{todayKey:head.asOfDay}}}});
  const session={scope,isCurrent:()=>current};
  const authorize=async request=>{assert.equal(request.kind,'home.read');assert.equal(request.scope.tenantId,scope.tenantId);return grant;};
  const directory=createOfflineBusinessDirectory({database,session,authorize});
  const reader=createOfflineHRReadRepository({database,session,authorize});
  const runtime={scope,isCurrent:()=>current,expiresAtMs:grant.expiresAtMs,capabilities:grant.capabilities,
    appSession:{currentUser:{id:'e1',firebaseUid:scope.principalId,companyId:scope.tenantId},currentCompany:{id:scope.tenantId},sourceProfile:undefined},
    business:{hrReader:async()=>reader}};
  statements.length=0;
  return {sql,scope,grant,runtime,session,database,directory,reader,statements,revoke:()=>{current=false;},hook:fn=>{hook=fn;}};
}

test('employee/attendance/month filters use the finalized directory with no eager SQL or global history',async t=>{
  const f=await fixture(t,[['employees',{id:'e1',name:'Hồng',phone:'0123'}],['attendance',{id:'2026-10-31_e1',date:'2026-11-01',status:'late'}],['attendance',{id:'2026-11-01_e1',status:'leave'}]]);
  assert.equal(f.statements.length,0);
  const filters={...createHRFilters(),monthKey:'2026-10',employeeId:'e1'};
  assert.deepEqual(hrDirectoryOptions('attendance',filters),{limit:40,cursor:null,checkpoint:null,from:'2026-10-01',to:'2026-11-01',employeeId:'e1'});
  const page=await readHRPage({...f,source:'attendance',filters});
  assert.deepEqual(ids(page),['2026-10-31_e1']);
  assert.equal(page.metadata.checkpoint.permissionRevision,'r1');
  assert(f.statements.every(({statement})=>/^(SELECT|WITH)/.test(statement)));
  assert.equal(hrDirectoryOptions('employees',filters).monthKey,undefined);
});

test('financial month, employee, type and Vietnamese text predicates are SQL-before-LIMIT and cursors are stable',async t=>{
  const rows=Array.from({length:83},(_,i)=>['financials',{id:'f'+String(i).padStart(3,'0'),date:'2026-10-12',empId:'e1',type:'bonus',amount:100,reason:'Thưởng Đặng Hồng'}]);
  rows.push(['financials',{id:'wrong-month',date:'2026-11-01',empId:'e1',type:'bonus',reason:'Hồng'}],['financials',{id:'wrong-employee',date:'2026-10-12',empId:'e2',type:'bonus',reason:'Hồng'}]);
  const f=await fixture(t,rows),filters={monthKey:'2026-10',employeeId:'e1',text:'dang hong',type:'bonus',limit:40};
  const first=await f.reader.pageFinancials(filters),second=await f.reader.pageFinancials({...filters,cursor:first.nextCursor,checkpoint:first.metadata.checkpoint}),third=await f.reader.pageFinancials({...filters,cursor:second.nextCursor,checkpoint:first.metadata.checkpoint});
  assert.equal(first.items.length,40);assert.equal(second.items.length,40);assert.equal(third.items.length,3);
  assert.equal(third.hasMore,false);assert.equal(new Set([...ids(first),...ids(second),...ids(third)]).size,83);
  assert.deepEqual(ids(first).slice(0,2),['f082','f081']);
  assert(f.statements.every(({statement})=>!/^\s*(CREATE|ALTER|UPDATE|INSERT|DELETE|DROP)/.test(statement)));
});

test('financial details retain stored sign, pending flags and bounded text; never substitute creation date',async t=>{
  const f=await fixture(t,[['financials',{id:'f1',date:'2026-10-09',createdAt:'2026-11-09',empId:'e1',type:'advance',amount:-25,reason:'x'.repeat(6000),__pendingLocalSync:true,localSyncState:'PENDING_SYNC'}],['financials',{id:'undated',createdAt:'2026-10-09',empId:'e1',type:'bonus',amount:100}]]);
  const page=await readHRPage({...f,source:'financials',filters:{...createHRFilters(),monthKey:'2026-10'}});
  assert.deepEqual(ids(page),['f1']);
  const detail=await readHRDetail({...f,source:'financials',id:'f1',checkpoint:page.metadata.checkpoint});
  assert.equal(detail.row.document.amount,-25);assert.equal(detail.row.document.reason.length,1024);
  assert.equal(detail.row.document.__pendingLocalSync,true);assert.equal(hrSourceState(detail.row).pending,true);
  assert.equal(page.metadata.financialCalculationAllowed,false);
});

test('financial month boundaries use Vietnam instants without fractional-second rollover',async t=>{
  const f=await fixture(t,[
    ['financials',{id:'before',date:'2026-10-31T16:59:59.999999999Z',empId:'e1',type:'bonus'}],
    ['financials',{id:'next',date:'2026-10-31T17:00:00Z',empId:'e1',type:'bonus'}],
    ['financials',{id:'wall',date:'2026-10-31T23:59:59.999999999',empId:'e1',type:'bonus'}],
  ]);
  assert.deepEqual(ids(await f.reader.pageFinancials({monthKey:'2026-10'})),['wall','before']);
  assert.deepEqual(ids(await f.reader.pageFinancials({monthKey:'2026-11'})),['next']);
});

test('payroll detail reuses complete ORIGINAL snapshot results for exactly one employee/month',async t=>{
  const p=payroll(),other=payroll('e2');
  p.period.snapshotIds.push(other.snapshot.id);
  const f=await fixture(t,[['payrollSnapshots',p.snapshot],['payrollSnapshots',other.snapshot],['payrollPeriods',p.period]]);
  const page=await readHRPage({...f,source:'payrollSnapshots',filters:{...createHRFilters(),monthKey:'2026-10',employeeId:'e1'}});
  const detail=await readHRDetail({...f,source:'payrollSnapshots',id:p.snapshot.id,checkpoint:page.metadata.checkpoint});
  assert.equal(detail.payroll.kind,'frozen');
  assert.equal(detail.payroll.details.netSalary,p.snapshot.salaryDetails.netSalary);
  assert.equal(detail.payroll.details.endingDebt,0);
  assert.equal(detail.payroll.policyVersion,p.snapshot.policyVersion);
  assert.equal(detail.payroll.details.commission,null); // Missing is unavailable, never invented zero.
  const raw=f.statements.filter(({statement})=>statement.includes('AS bytes'));
  assert.equal(raw.length,1);assert(raw[0].params.includes('e1'));assert(raw[0].params.includes('2026-10'));
  assert.match(raw[0].statement,/LIMIT 2/);assert.match(raw[0].statement,/employeeId/);assert.match(raw[0].statement,/monthKey/);
  assert(!JSON.stringify(detail.payroll).includes('policySnapshot'));
  assert.equal(f.sql.prepare('SELECT payload FROM protected_outbox').get().payload,'unchanged');
});

test('incomplete, inconsistent, adjusted, unlisted and pending salary snapshots never publish a computed net',async t=>{
  for(const change of ['incomplete','inconsistent','adjusted','unlisted','pending','period-pending','employee-mismatch','draft']){
    const p=payroll();
    if(change==='incomplete')delete p.snapshot.policySnapshot;
    if(change==='inconsistent')p.snapshot.calculationSnapshot.results.netSalary=1;
    if(change==='adjusted'){p.period.status='ADJUSTED';p.period.adjustmentCount=1;}
    if(change==='unlisted')p.period.snapshotIds=[];
    if(change==='pending')p.snapshot.__pendingFirebaseSync=true;
    if(change==='period-pending')p.period.localSyncState='PENDING_SYNC';
    if(change==='employee-mismatch')p.snapshot.employee.id='someone-else';
    if(change==='draft')p.snapshot.status='DRAFT';
    const f=await fixture(t,[['payrollSnapshots',p.snapshot],['payrollPeriods',p.period]]);
    const result=await f.reader.payrollDetail({employeeId:'e1',monthKey:'2026-10'});
    assert.notEqual(result.kind,'frozen',change);assert.equal(result.details,null,change);
  }
});

test('missing open-month salary and ambiguous snapshots fail without fetch-all or latest-write selection',async t=>{
  const f=await fixture(t);
  const result=await f.reader.payrollDetail({employeeId:'e1',monthKey:'2026-11'});
  assert.equal(result.kind,'unavailable');assert.equal(result.details,null);
  const p=payroll(),second={...p.snapshot,id:'another-snapshot'};
  const g=await fixture(t,[['payrollSnapshots',p.snapshot],['payrollSnapshots',second],['payrollPeriods',p.period]]);
  await assert.rejects(()=>g.reader.payrollDetail({employeeId:'e1',monthKey:'2026-10'}),error=>error.code==='ambiguous-snapshot');
});

test('oversized snapshot is rejected intact instead of truncated to an apparently valid salary',async t=>{
  const p=payroll();p.snapshot.calculationSnapshot.inputs.large='x'.repeat(600000);
  const f=await fixture(t,[['payrollSnapshots',p.snapshot],['payrollPeriods',p.period]]);
  await assert.rejects(()=>f.reader.payrollDetail({employeeId:'e1',monthKey:'2026-10'}),error=>error.code==='record-too-large');
});

test('home.read alone, invented roles, and native B profile never read HR source records',async t=>{
  const f=await fixture(t);
  f.grant.capabilities=['home.read'];
  await assert.rejects(()=>f.reader.pageFinancials({monthKey:'2026-10'}),error=>error.code==='permission-denied');
  assert.equal(f.statements.length,0);
  f.grant.capabilities=['home.read','home.payroll.read'];f.grant.appSession={sourceProfile:'native-isolation-v1'};
  await assert.rejects(()=>f.reader.payrollDetail({employeeId:'e1',monthKey:'2026-10'}),error=>error.code==='permission-denied');
  assert.equal(f.statements.length,0);
  f.runtime.appSession.sourceProfile='native-isolation-v1';
  assert.match(hrReadAccess(f.runtime,f.directory),/native/);
});

test('employees need no HR helper binding; financials reports the missing lazy binding without fallback SQL',async t=>{
  const f=await fixture(t,[['employees',{id:'e1',name:'Nguyễn An'}]]);
  delete f.runtime.business.hrReader;
  const filters={...createHRFilters(),monthKey:'2026-10'};
  assert.deepEqual(ids(await readHRPage({...f,source:'employees',filters})),['e1']);
  f.statements.length=0;
  await assert.rejects(()=>readHRPage({...f,source:'financials',filters}),/chưa được chủ Runtime kết nối/);
  assert.equal(f.statements.length,0);
});

test('head, permission and session changes reject delayed reads and related lookups',async t=>{
  const f=await fixture(t,[['financials',{id:'f1',date:'2026-10-09',empId:'e1',type:'bonus'}]]);
  const page=await f.reader.pageFinancials({monthKey:'2026-10'});
  f.sql.exec('UPDATE offline_home_feed_checkpoint_v1 SET applied_seq=applied_seq+1');
  await assert.rejects(()=>f.reader.financialDetail('f1',{checkpoint:page.metadata.checkpoint}),error=>error.code==='stale-checkpoint');
  f.sql.exec('UPDATE offline_home_feed_checkpoint_v1 SET applied_seq=applied_seq-1');
  f.hook(statement=>{if(statement.startsWith('WITH scoped'))f.revoke();});
  await assert.rejects(()=>f.reader.pageFinancials({monthKey:'2026-10'}),error=>error.code==='permission-denied');
});

test('signed capability revocation and expiry during a scoped SQL read withhold the result',async t=>{
  for(const change of ['capability','expiry']){
    const f=await fixture(t,[['financials',{id:'f1',date:'2026-10-09',empId:'e1',type:'bonus'}]]);
    f.hook(statement=>{if(statement.startsWith('WITH scoped')){
      if(change==='capability')f.grant.capabilities=['home.read'];
      else f.grant.expiresAtMs=Date.now()-1;
    }});
    await assert.rejects(()=>f.reader.pageFinancials({monthKey:'2026-10'}),error=>error.code==='permission-denied');
  }
});

test('runtime owner replacement while the helper resolves cannot publish an old financial page',async t=>{
  const f=await fixture(t);let release;
  f.runtime.business.hrReader=()=>new Promise(resolve=>{release=resolve;});
  const task=readHRPage({...f,source:'financials',filters:{...createHRFilters(),monthKey:'2026-10'}});
  await Promise.resolve();f.revoke();release(f.reader);
  await assert.rejects(()=>task,/Phiên/);
});

test('stale cursor/query, cross-account checkpoint and invalid unbounded inputs fail closed',async t=>{
  const rows=Array.from({length:42},(_,i)=>['financials',{id:'f'+i,date:'2026-10-01',empId:'e1',type:'bonus'}]);
  const f=await fixture(t,rows),first=await f.reader.pageFinancials({monthKey:'2026-10'});
  await assert.rejects(()=>f.reader.pageFinancials({monthKey:'2026-11',cursor:first.nextCursor}),error=>error.code==='stale-checkpoint');
  await assert.rejects(()=>f.reader.financialDetail('f1',{checkpoint:{...first.metadata.checkpoint,tenantId:'other'}}),error=>error.code==='stale-checkpoint');
  for(const options of [{monthKey:'2026-13'},{monthKey:'2026-10',limit:1000},{monthKey:'2026-10',text:'x'.repeat(129)},{monthKey:'2026-10',type:'salary_sum'},{monthKey:'2026-10',offset:1},{monthKey:'2026-10',employeeId:0}])await assert.rejects(()=>f.reader.pageFinancials(options),error=>error.code==='invalid-argument');
});

test('component parses as JSX with bounded paging and no direct network/lifecycle listeners',()=>{
  const code=readFileSync(new URL('./OfflineHRWorkspace.jsx',import.meta.url),'utf8');
  parse(code,{sourceType:'module',plugins:['jsx']});
  assert(code.includes('readHRDetail'));assert(code.includes('readHRPage'));assert(code.includes('PayrollResult'));
  assert(!/addEventListener|setInterval|createConnection|openDatabase|fetch\s*\(/.test(code));
  assert(!/\.reduce\s*\(/.test(code));
  assert(code.includes('Trang tiếp'));
  assert.equal(hrMonthRange('2026-12').to,'2027-01-01');
});

test('attendance detail preserves independent role times and excludes GPS/private evidence',async t=>{
 const f=await fixture(t,[['attendance',{id:'2026-11-01_e1',employeeId:'e1',workRoles:{Sales:{checkIn:'2026-11-01T01:00:00Z',checkOut:'2026-11-01T10:00:00Z',status:'present',deviceSecret:'not-for-display',checkInMethodMeta:{latitude:10}},Driver:{checkIn:'13:00',checkOut:'17:00',status:'late'}},checkIn:'legacy-must-not-duplicate'}]]);
 const page=await f.directory.page('attendance',{limit:1});const result=await f.reader.attendanceDetail('2026-11-01_e1',{checkpoint:page.metadata.checkpoint});
 assert.equal(result.roles.length,2);assert.equal(result.roles[0].workRole,'Driver');assert.equal(result.roles[0].checkIn,'13:00');assert.equal(result.roles[1].checkIn,'2026-11-01T01:00:00Z');assert.equal(JSON.stringify(result).includes('not-for-display'),false);assert.equal(JSON.stringify(result).includes('latitude'),false);
 const detail=await readHRDetail({runtime:f.runtime,directory:f.directory,source:'attendance',id:'2026-11-01_e1',checkpoint:page.metadata.checkpoint});assert.deepEqual(detail.attendance.roles,result.roles);assert(f.statements.every(({statement})=>!/^\s*(UPDATE|INSERT|DELETE|ALTER)/.test(statement)));
});
test('attendance detail keeps legacy flat record, rejects stale checkpoint and revoked session',async t=>{
 const f=await fixture(t,[['attendance',{id:'2026-11-01_e1',employeeId:'e1',checkIn:'08:00',checkOut:'17:00',status:'present'}]]),page=await f.directory.page('attendance',{limit:1}),cp=page.metadata.checkpoint;
 const result=await f.reader.attendanceDetail('2026-11-01_e1',{checkpoint:cp});assert.equal(result.roles.length,1);assert.equal(result.roles[0].checkIn,'08:00');await assert.rejects(f.reader.attendanceDetail('2026-11-01_e1',{checkpoint:{...cp,principalId:'other'}}),/nguồn/);f.revoke();await assert.rejects(f.reader.attendanceDetail('2026-11-01_e1',{checkpoint:cp}),/Phiên/);
});
test('attendance detail refuses excess roles rather than silently omitting history',async t=>{
 const f=await fixture(t,[['attendance',{id:'2026-11-01_e1',employeeId:'e1',workRoles:Object.fromEntries(Array.from({length:33},(_,i)=>['role'+i,{checkIn:'08:00'}]))}]]);await assert.rejects(f.reader.attendanceDetail('2026-11-01_e1'),/định dạng/);
});

test('attendance status filters include secondary work roles before LIMIT without duplicating documents',async t=>{
 const f=await fixture(t,[['attendance',{id:'2026-11-01_e1',employeeId:'e1',status:'present',workRoles:{Sales:{status:'present'},Driver:{status:'late'},Warehouse:{status:'late'}}}],['attendance',{id:'2026-11-02_e1',employeeId:'e1',status:'present'}],['attendance',{id:'2026-11-03_e1',employeeId:'e1',status:'leave'}]]);
 const first=await f.directory.page('attendance',{from:'2026-11-01',to:'2026-12-01',status:'late',limit:1});assert.deepEqual(ids(first),['2026-11-01_e1']);assert.equal(first.hasMore,false);const leave=await f.directory.page('attendance',{from:'2026-11-01',to:'2026-12-01',status:'leave',limit:1});assert.deepEqual(ids(leave),['2026-11-03_e1']);
});
