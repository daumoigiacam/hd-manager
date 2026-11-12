import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {createOfflineAttendanceRepository,canonicalAttendance} from '../../data/offlineAttendanceRepository.js';
import {createHomeFeedStorage} from '../../data/offlineHomeFeedStorage.js';
import {HOME_FEED_SOURCES} from '../../data/homeFeedContract.js';
import {attendanceWriteAccess,newAttendanceDraft,submitAttendanceDraft} from './offlineAttendanceEditorModel.js';

const digest=async text=>createHash('sha256').update(text).digest('hex');
test('explicit unknown-outcome retry keeps the original key, payload and attempt history',async t=>{
 const f=await fixture(t),created=await f.request(),old=await f.claim();await f.repository.failLease(f.scope,old,{state:'SYNC_FAILED',code:'sync-rejected',nextAttemptAt:null});
 const request={kind:old.kind,commandId:old.commandId,entityId:old.entityId,payloadDigest:old.payloadDigest},before=f.sql.prepare('SELECT payload_json,idempotency_key FROM local_commands WHERE command_id=?').get(created.commandId);
 await assert.rejects(()=>f.repository.claimFailed({...f.scope,tenantId:'other'},request));
 const retry=await f.repository.claimFailed(f.scope,request,{now:Date.now()+2000,leaseMs:60000});assert.equal(retry.commandId,old.commandId);assert.equal(retry.idempotencyKey,old.idempotencyKey);assert.equal(retry.attempts,old.attempts+1);assert.equal(await digest(JSON.stringify(retry.payload)),old.payloadDigest);await f.repository.authorizeExplicitRetry(f.scope,retry);await f.repository.applyReceipt(f.scope,retry,await f.receipt(retry));assert.deepEqual(f.sql.prepare('SELECT payload_json,idempotency_key FROM local_commands WHERE command_id=?').get(created.commandId),before);assert.equal(f.sql.prepare('SELECT count(*) AS n FROM local_commands').get().n,1);await assert.rejects(()=>f.repository.claimFailed(f.scope,request));
});
async function fixture(t,extra={}){
  const sql=new DatabaseSync(':memory:');t.after(()=>sql.close());
  sql.exec(readFileSync(new URL('../../../../../../performance/offline-first/schema-v1.sql',import.meta.url),'utf8'));
  sql.exec('CREATE TABLE offline_home_head_v1(tenant_id TEXT,principal_id TEXT,revision TEXT,generation TEXT,captured_at INTEGER,day_key TEXT,snapshot_json TEXT,PRIMARY KEY(tenant_id,principal_id))');
  const scope={tenantId:'co',principalId:'u',permissionRevision:'r1',sessionId:'s1'};let current=true,seq=0;
  const grant={...scope,projectId:'demo-attendance',expiresAtMs:Date.now()+3600000,capabilities:['home.read','home.payroll.read','attendance.check_in','attendance.check_out'],appSession:{user:{id:'e',companyId:'co',firebaseUid:'u'}}};
  const adapter={query:async(statement,params=[])=>sql.prepare(statement).all(...params).map(row=>({...row})),run:async(statement,params=[])=>sql.prepare(statement).run(...params)};
  let tail=Promise.resolve();const database={transaction(work){const task=tail.then(async()=>{sql.exec('BEGIN IMMEDIATE');try{const out=await work(adapter);sql.exec('COMMIT');return out;}catch(error){sql.exec('ROLLBACK');throw error;}});tail=task.catch(()=>{});return task;}};
  const storage=await createHomeFeedStorage({transaction:database.transaction,keys:['co','u'],scope});
  const counts=Object.fromEntries(HOME_FEED_SOURCES.map(s=>[s,0]));
  const head={...scope,ready:true,generation:'g',seq:0,asOfDay:'2026-10-04',sources:HOME_FEED_SOURCES,counts};
  await storage.checkpoint(head);await storage.publish(head,{counts,snapshot:{finance:{todayKey:head.asOfDay}},overview:{snapshot:{finance:{todayKey:head.asOfDay}}}});
  const session={scope,isCurrent:()=>current};
  const repository=await createOfflineAttendanceRepository({database,session,employeeId:'e',deviceId:'d',projectId:'demo-attendance',development:true,digest,
    uuid:()=>`cmd${++seq}`,authorize:async()=>grant,captureMethod:async()=>({type:'wifi',ssid:'Office',bssid:'aa:bb:cc:dd:ee:01'}),...extra});
  const runtime={scope,isCurrent:()=>current,expiresAtMs:grant.expiresAtMs,capabilities:grant.capabilities,appSession:{currentUser:{...grant.appSession.user,position:'Kinh doanh'}}};
  const request=()=>repository.request({kind:'attendance.check_in',workDate:'2026-10-04',workRole:'Kinh doanh'});
  const claim=()=>repository.claimDue(scope,{now:Date.now()+1000,leaseMs:60000,maxAttempts:5});
  async function receipt(command,outcome='accepted'){
    const document={id:command.entityId,companyId:'co',workRole:'Kinh doanh',checkIn:'2026-10-04T01:00:00.000Z',status:'present',offlineAttendanceRevision:1};
    return {tenantId:'co',principalId:'u',commandId:command.commandId,idempotencyKey:command.commandId,payloadDigest:command.payloadDigest,
      entityId:command.entityId,kind:command.kind,baseRevision:command.baseRevision,workRole:'Kinh doanh',workDate:'2026-10-04',outcome,
      ...(outcome==='accepted'?{document,fingerprint:await digest(canonicalAttendance(document))}:
        {reason:'attendance-changed',currentDocument:document,currentFingerprint:await digest(canonicalAttendance(document)),currentRevision:1})};
  }
  return {sql,scope,grant,repository,runtime,request,claim,receipt,revoke:()=>{current=false;}};
}

test('intent, original local_commands/Outbox trigger and append-only overlay enqueue atomically without invented check-in',async t=>{
  const f=await fixture(t),queued=await f.request();assert.equal(queued.localDurable,true);
  assert.equal(f.sql.prepare('SELECT count(*) n FROM local_commands').get().n,1);
  assert.equal(f.sql.prepare('SELECT count(*) n FROM outbox').get().n,1);
  assert.equal(f.sql.prepare('SELECT count(*) n FROM command_events').get().n,1);
  assert.equal(f.sql.prepare('SELECT count(*) n FROM offline_home_feed_records_v1').get().n,0);
  const row=await f.repository.command(queued.commandId);
  assert.equal(row.state,'PENDING_SYNC');assert.equal(row.provisional,true);assert.equal(row.serverDocument,null);
  assert.equal(row.intent.checkIn,undefined);assert.equal(row.intent.deviceSecret,undefined);
  await assert.rejects(f.request,/đang chờ/);
  assert.equal(f.sql.prepare('SELECT count(*) n FROM local_commands').get().n,1);
});

test('an enqueue failure rolls back the overlay, command, events and triggered Outbox together',async t=>{
  const f=await fixture(t,{beforeEnqueueCommit:()=>{throw Error('injected commit failure');}});
  await assert.rejects(f.request,/injected/);
  for(const table of ['local_commands','outbox','command_events','offline_attendance_overlay_v1'])assert.equal(f.sql.prepare(`SELECT count(*) n FROM ${table}`).get().n,0,table);
});

test('accepted receipt publishes only the server-confirmed hours and lets checkout use that exact CAS base before feed catches up',async t=>{
  const f=await fixture(t);await f.request();const command=await f.claim(),receipt=await f.receipt(command);
  await f.repository.applyReceipt(f.scope,command,receipt);
  const row=await f.repository.command(command.commandId);assert.equal(row.state,'SYNCED');assert.equal(row.serverDocument.checkIn,receipt.document.checkIn);
  const proof=await f.repository.prepare({workDate:'2026-10-04',workRole:'Kinh doanh'});assert.equal(proof.baseFingerprint,receipt.fingerprint);assert.equal(proof.baseRevision,1);
  assert.equal(f.sql.prepare('SELECT count(*) n FROM offline_home_feed_records_v1').get().n,0);
});

test('receipt state, lease, event and overlay rollback as one unit on failure',async t=>{
  let fail=true;const f=await fixture(t,{beforeReceiptCommit:()=>{if(fail)throw Error('receipt rollback');}});
  await f.request();const command=await f.claim(),receipt=await f.receipt(command);
  await assert.rejects(()=>f.repository.applyReceipt(f.scope,command,receipt),/receipt rollback/);
  assert.equal((await f.repository.command(command.commandId)).state,'SYNCING');
  assert.equal((await f.repository.command(command.commandId)).receipt,null);
  assert.equal(f.sql.prepare('SELECT lease_owner FROM outbox').get().lease_owner,command.leaseOwner);
  fail=false;await f.repository.applyReceipt(f.scope,command,receipt);assert.equal((await f.repository.command(command.commandId)).state,'SYNCED');
});

test('conflict retains original intent/server evidence; explicit reviewed retry creates a NEW command without deleting history',async t=>{
  const f=await fixture(t);await f.request();const command=await f.claim(),receipt=await f.receipt(command,'conflict');
  await f.repository.applyReceipt(f.scope,command,receipt);
  const conflict=await f.repository.command(command.commandId);assert.equal(conflict.state,'CONFLICT_REQUIRES_REVIEW');assert.equal(conflict.intent.baseFingerprint,null);
  assert.equal(conflict.receipt.currentFingerprint,receipt.currentFingerprint);
  await assert.rejects(f.request,/xung đột/);
  const next=await f.repository.request({kind:'attendance.check_out',workDate:'2026-10-04',workRole:'Kinh doanh',reviewedConflict:{commandId:command.commandId,currentFingerprint:receipt.currentFingerprint,currentRevision:1}});
  assert.notEqual(next.commandId,command.commandId);assert.equal(f.sql.prepare('SELECT count(*) n FROM offline_attendance_overlay_v1').get().n,2);
  assert.equal((await f.repository.command(command.commandId)).state,'CONFLICT_REQUIRES_REVIEW');
});

test('an authoritative rejection can be explicitly reviewed and retried as a new intent; original rejected row is retained',async t=>{
  const f=await fixture(t);await f.request();const command=await f.claim(),receipt=await f.receipt(command,'rejected');
  delete receipt.currentDocument;delete receipt.currentFingerprint;delete receipt.currentRevision;receipt.reason='original-attendance-validation-denied';
  await f.repository.applyReceipt(f.scope,command,receipt);
  await assert.rejects(f.request,/biên nhận/);
  const next=await f.repository.request({kind:'attendance.check_in',workDate:'2026-10-04',workRole:'Kinh doanh',reviewedConflict:{commandId:command.commandId,outcome:'rejected'}});
  assert.notEqual(next.commandId,command.commandId);assert.equal((await f.repository.command(command.commandId)).state,'SYNC_FAILED');
  assert.equal(f.sql.prepare('SELECT count(*) n FROM offline_attendance_overlay_v1').get().n,2);
});

test('accepted explicit review settles the retained error chain without blocking a later ordinary checkout',async t=>{
  const f=await fixture(t);await f.request();const first=await f.claim(),conflict=await f.receipt(first,'conflict');
  await f.repository.applyReceipt(f.scope,first,conflict);
  await f.repository.request({kind:'attendance.check_in',workDate:'2026-10-04',workRole:'Kinh doanh',reviewedConflict:{commandId:first.commandId,currentFingerprint:conflict.currentFingerprint,currentRevision:1}});
  const reviewed=await f.claim(),accepted=await f.receipt(reviewed);accepted.duplicate=true;
  await f.repository.applyReceipt(f.scope,reviewed,accepted);
  const checkout=await f.repository.request({kind:'attendance.check_out',workDate:'2026-10-04',workRole:'Kinh doanh'});
  assert.equal(checkout.state,'PENDING_SYNC');assert.equal((await f.repository.command(first.commandId)).state,'CONFLICT_REQUIRES_REVIEW');
  assert.equal(f.sql.prepare('SELECT count(*) n FROM offline_attendance_overlay_v1').get().n,3);
});

test('untrusted receipt, missing capability, closed owner and accidental credential evidence cannot mutate source or Outbox',async t=>{
  const f=await fixture(t);f.grant.capabilities=['home.read','home.payroll.read'];await assert.rejects(f.request,/quyền/);
  assert.equal(f.sql.prepare('SELECT count(*) n FROM local_commands').get().n,0);
  const g=await fixture(t,{captureMethod:async()=>({type:'wifi',ssid:'Office',bssid:'aa:bb:cc:dd:ee:01',deviceSecret:'never-store'})});
  await assert.rejects(g.request,/bằng chứng/);assert.equal(g.sql.prepare('SELECT count(*) n FROM local_commands').get().n,0);
  const h=await fixture(t);await h.request();const cmd=await h.claim(),r=await h.receipt(cmd);r.document.checkIn=null;
  await assert.rejects(()=>h.repository.applyReceipt(h.scope,cmd,r),/không hợp lệ/);assert.equal((await h.repository.command(cmd.commandId)).state,'SYNCING');
  h.revoke();await assert.rejects(()=>h.repository.command(cmd.commandId),/Phiên/);
});

test('form requires the provided protocol plus explicit signed capability and claims only local durability',async t=>{
  const f=await fixture(t);
  assert.equal(attendanceWriteAccess(f.runtime,null,'attendance.check_in').length>0,true);
  assert.equal(attendanceWriteAccess(f.runtime,f.repository,'attendance.check_in'),'');
  const draft=newAttendanceDraft(f.runtime,f.repository,'attendance.check_in','scope');draft.workDate='2026-10-04';
  const result=await submitAttendanceDraft(f.runtime,f.repository,draft);assert.equal(result.serverConfirmed,false);assert.equal(result.localDurable,true);
  f.runtime.capabilities=['home.read','home.payroll.read'];await assert.rejects(()=>submitAttendanceDraft(f.runtime,f.repository,draft),/quyền/);
});
