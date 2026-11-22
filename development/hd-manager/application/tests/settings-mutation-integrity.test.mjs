import test from 'node:test';
import assert from 'node:assert/strict';
import {Timestamp} from 'firebase/firestore';
import * as integrity from '../src/utils/settingsMutationIntegrity.js';
import {fixture,companyId,owner,staff,metadata,tick,clone} from './helpers/settings-parent-fixture.mjs';

test('actual parent patches only supplied keys and publishes only after server ACK',async()=>{
  const f=fixture();f.defer=true;
  const patch={name:'  New name  '},options=metadata('profile',patch,f.base),before=clone({patch,options});
  let settled=false;const pending=f.call(patch,options).then(result=>{settled=true;return result;});await tick();
  assert.equal(settled,false);assert.equal(f.publications.length,0);assert.equal(f.visible.name,'Original');
  assert.deepEqual(f.writes.find(row=>row.ref.startsWith('companies/')).patch,{name:'New name',updatedAt:options.clientMutationAt});
  assert.equal(f.docs.get('companies/'+companyId).bankAccountNumber,'111');
  f.acks[0].resolve();assert.deepEqual(await pending,{success:true,confirmed:true,queued:false,replay:false});
  assert.equal(f.visible.name,'New name');assert.deepEqual({patch,options},before);
  assert.equal(f.writes.some(row=>JSON.stringify(row.patch).includes('expectedSettings')),false);
});

test('stale exact fields conflict; unrelated concurrent fields survive; legacy fallback still CAS checks',async()=>{
  for(const options of [undefined,metadata('stale',{name:'Mine'},fixture().base)]){
    const f=fixture();f.docs.get('companies/'+companyId).name='Other editor';
    await assert.rejects(f.call({name:'Mine'},options),{code:'settings_conflict'});assert.equal(f.writes.length,0);
  }
  const f=fixture();f.docs.get('companies/'+companyId).bankAccountNumber='222';
  await f.call({name:'Mine'},metadata('disjoint',{name:'Mine'},f.base));
  assert.equal(f.docs.get('companies/'+companyId).bankAccountNumber,'222');
});

test('lost-ACK replay preserves later edits; same ID with changed business payload is rejected',async()=>{
  const f=fixture(),patch={name:'First'},options=metadata('retry',patch,f.base);
  f.lostAck=true;await assert.rejects(f.call(patch,options),/Lost ACK/);assert.equal(f.publications.length,0);
  Object.assign(f.docs.get('companies/'+companyId),{name:'Later',updatedAt:'later',bankAccountNumber:'later-bank'});
  const before=clone([...f.docs]);f.lostAck=false;
  assert.equal((await f.call(patch,options)).replay,true);assert.deepEqual([...f.docs],before);assert.equal(f.visible.name,'Later');
  await assert.rejects(f.call({name:'Changed'},options),{code:'settings_command_conflict'});assert.deepEqual([...f.docs],before);
});

test('strict metadata and raw types reject falsy coercion, unknown authority, invalid numbers and malformed guards',async()=>{
  const bad=[{ownerId:'forged'},{companyId:'foreign'},{updatedAt:'spoof'},{customerLoyaltyEnabled:0},{salaryAdvancePercent:-1},
    {salaryAdvancePercent:NaN},{salaryAdvancePercent:Infinity},{loyaltyRevenuePercent:101},{customerCareInactiveDays:0},
    {warehouseOrderAutoCancelDays:1.5},{companyBankAccounts:[{id:'x',bankAccountNumber:123}]},{rolePermissions:{sales:{settings:'true'}}}];
  for(const patch of bad){const f=fixture();await assert.rejects(f.call(patch));assert.equal(f.writes.length,0);}
  const patch={floatingQuickActionEnabled:false};
  for(const extra of [{expectedSettings:{}},{expectedSettings:{floatingQuickActionEnabled:{exists:0}}},
    {expectedSettings:{floatingQuickActionEnabled:{exists:false,value:null}}},
    {expectedSettings:{floatingQuickActionEnabled:{exists:true,value:undefined}}},
    {clientCommandId:''},{clientMutationAt:'2026-11-22'},{unknown:true}]){
    const f=fixture();await assert.rejects(f.call(patch,{...metadata('invalid',patch,f.base),...extra}));assert.equal(f.writes.length,0);
  }
});

test('catalog rights are per field and rechecked against server revocation, active employee and tenant',async()=>{
  const perms={employeeRolePermissions:{[staff.id]:{settings:true}},employeeRolePermissionActions:{[staff.id]:{settings:{edit_company_profile:true,manage_bank_accounts:false}}}};
  const f=fixture({actor:staff,company:perms});
  await assert.rejects(f.call({bankAccountNumber:'222'}),{code:'permission-denied'});assert.equal(f.writes.length,0);
  f.docs.get('companies/'+companyId).employeeRolePermissionActions[staff.id].settings.edit_company_profile=false;
  await assert.rejects(f.call({name:'Revoked'}),{code:'permission-denied'});assert.equal(f.writes.length,0);
  for(const actorPatch of [{companyId:'foreign'},{isArchived:true}]){
    const x=fixture();Object.assign(x.docs.get('employees/'+owner.id),actorPatch);
    await assert.rejects(x.call({name:'Denied'}),{code:'permission-denied'});assert.equal(x.writes.length,0);
  }
});

test('scope changes before read or after ACK never publish into another account/company',async()=>{
  const f=fixture();f.env.readOwnerRef.current='other';await assert.rejects(f.call({name:'Denied'}),{code:'settings_scope_changed'});assert.equal(f.writes.length,0);
  const g=fixture();g.defer=true;const pending=g.call({name:'Committed'});await tick();
  g.env.activeTenantScopeRef.current='foreign';g.acks[0].resolve();await assert.rejects(pending,{code:'settings_scope_changed'});assert.equal(g.publications.length,0);
});

test('review toggle retains server-only audit whitelist; WiFi retains owner and raw BSSID guards',async()=>{
  const f=fixture();await f.call({employeeReviewsEnabled:false},metadata('review',{employeeReviewsEnabled:false},f.base));
  assert.deepEqual(f.writes.find(row=>row.ref.startsWith('companies/')).patch,{employeeReviewsEnabled:false,employeeReviewsUpdatedByEmpId:owner.id,employeeReviewsUpdatedAt:{serverTimestamp:true}});
  const g=fixture(),wifi={attendanceWifiEnabled:true,attendanceWifiSsid:' QA ',attendanceWifiBssid:'AA:BB:CC:DD:EE:12',attendanceWifiUpdatedAt:'draft'};
  await g.call(wifi,metadata('wifi',wifi,g.base));assert.equal(g.docs.get('companies/'+companyId).attendanceWifiBssid,'aa:bb:cc:dd:ee:12');
  const x=fixture();await assert.rejects(x.call({...wifi,attendanceWifiBssid:'02:00:00:00:00:00'}));assert.equal(x.writes.length,0);
  await assert.rejects(x.call({employeeReviewsEnabled:false,name:'Mixed'}));assert.equal(x.writes.length,0);
});

test('timestamp equality preserves nanoseconds, primitive types and missing versus explicit falsy fields',async()=>{
  const canonical=integrity.canonicalSettingsValue;
  assert.deepEqual(canonical(new Timestamp(100,123000000)),canonical(new Date(100123)));
  assert.deepEqual(canonical(new Timestamp(100,123456789)),canonical({_seconds:100,_nanoseconds:123456789}));
  assert.deepEqual(canonical(new Timestamp(100,123456789)),canonical(JSON.parse(JSON.stringify(new Timestamp(100,123456789)))));
  assert.notDeepEqual(canonical(new Timestamp(100,123456789)),canonical(new Timestamp(100,123456788)));
  for(const value of [false,0,'',null]){
    const f=fixture();f.docs.get('companies/'+companyId).floatingQuickActionEnabled=value;
    await assert.rejects(f.call({floatingQuickActionEnabled:true},metadata('presence',{floatingQuickActionEnabled:true},f.base)),{code:'settings_conflict'});
  }
  const f=fixture({company:{floatingQuickActionEnabled:false}});await f.call({floatingQuickActionEnabled:true});
});

test('accepted review, department, warehouse, salary, bank, loyalty and care payloads retain their exact field groups',async()=>{
  const cases=[{employeeReviewCriteriaLabels:{quality:'Cam kết'}},{employeeDepartments:[{id:'ops',name:'Vận hành',createdAt:'',updatedAt:''}]},
    {productGroups:['Gà','Vịt']},{warehouseQuantityUnits:['Kg','Con']},{salaryAdvancePercentByDepartment:{sales:null,driver:0}},
    {customerCareRules:{inactive:{enabled:false,inactiveDays:7,message:'QA',holidayDates:[]}}},
    {companyBankAccounts:[{id:'b',bankId:'VCB',bankName:'Bank',bankAccountName:'QA',bankAccountNumber:'123',sepayUseVirtualAccount:false}],primaryCompanyBankAccountId:'b'},
    {customerLoyaltyEnabled:false,loyaltyEarnMode:'fixed',loyaltyRevenuePercent:0,loyaltyEarnAmountPerPoint:1000,loyaltyRedeemValuePerPoint:1000,loyaltyEligibilityConditions:{notOverdue:true}}];
  for(const[index,patch]of cases.entries()){
    const f=fixture();await f.call(patch,metadata('group-'+index,patch,f.base));
    assert.deepEqual(Object.keys(f.writes.find(row=>row.ref.startsWith('companies/')).patch).sort(),[...Object.keys(patch),'updatedAt'].sort());
  }
});

test('validation failure and rejected transaction preserve drafts and publish nothing',async()=>{
  const f=fixture(),patch={name:'Keep draft'},options=metadata('denied',patch,f.base),before=clone({patch,options});
  f.denied=true;await assert.rejects(f.call(patch,options),{code:'permission-denied'});
  assert.equal(f.publications.length,0);assert.deepEqual({patch,options},before);assert.equal(f.writes.length,0);
});

test('bank-only actors preserve nested QR, cannot change it, and QR-only actors can update only the top-level QR',async()=>{
  const account={id:'bank',bankId:'VCB',bankName:'Bank',bankAccountName:'QA',bankAccountNumber:'123',invoiceQrTemplate:'compact'};
  const company={companyBankAccounts:[account],employeeRolePermissions:{[staff.id]:{settings:true}},
    employeeRolePermissionActions:{[staff.id]:{settings:{manage_bank_accounts:true,manage_payment_qr:false}}}};
  const f=fixture({actor:staff,company});await f.call({companyBankAccounts:[{...account,bankAccountName:'NEW'}]});
  const g=fixture({actor:staff,company});await assert.rejects(g.call({companyBankAccounts:[{...account,invoiceQrTemplate:'qr_only'}]}),{code:'permission-denied'});assert.equal(g.writes.length,0);
  const qrCompany=structuredClone(company);Object.assign(qrCompany.employeeRolePermissionActions[staff.id].settings,{manage_bank_accounts:false,manage_payment_qr:true});
  const h=fixture({actor:staff,company:qrCompany});await h.call({invoiceQrTemplate:'qr_only'});assert.deepEqual(h.docs.get('companies/'+companyId).companyBankAccounts,[account]);
  await assert.rejects(h.call({companyBankAccounts:[account]}),{code:'permission-denied'});
});

test('transaction CAS accepts JSON SDK timestamps and rejects one-nanosecond changes in exact draft snapshots',async()=>{
  const rules={inactive:{enabled:false,enabledAt:new Timestamp(100,123456789)}};
  const patch={customerCareRules:{inactive:{enabled:true,message:'QA'}}};
  for(const changed of [false,true]){
    const f=fixture({company:{customerCareRules:rules}}),options=JSON.parse(JSON.stringify(metadata('timestamp',patch,f.base)));
    if(changed)f.docs.get('companies/'+companyId).customerCareRules.inactive.enabledAt.nanoseconds++;
    if(changed)await assert.rejects(f.call(patch,options),{code:'settings_conflict'});else assert.equal((await f.call(patch,options)).confirmed,true);
  }
});
