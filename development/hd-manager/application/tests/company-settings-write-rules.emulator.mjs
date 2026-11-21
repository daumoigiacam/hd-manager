import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {initializeTestEnvironment} from '@firebase/rules-unit-testing';
import {collection,deleteDoc,doc,documentId,getDoc,getDocs,query,serverTimestamp,setDoc,setLogLevel,updateDoc,where,writeBatch} from 'firebase/firestore';
import {buildCompanyBankAccountUpdate,getCompanyBankAccounts} from '../src/features/settings/companyBankAccounts.js';

const endpoint=process.env.FIRESTORE_EMULATOR_HOST||'127.0.0.1:8185';
if(!/^(?:127\.0\.0\.1|localhost):8185$/.test(endpoint))throw Error('Loopback Firestore port 8185 only');
const projectId=`demo-company-settings-rules-${process.pid}`;
if(!/^demo-company-settings-rules-\d+$/.test(projectId))throw Error('Owned demo settings Rules project only');
process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8185';setLogLevel('silent');
const rules=fs.readFileSync(new URL('../../../../firestore.rules',import.meta.url),'utf8');
console.log(`FENCE emulator=127.0.0.1:8185 project=${projectId} rootRulesSHA256=${createHash('sha256').update(rules).digest('hex')}`);
const env=await initializeTestEnvironment({projectId,firestore:{host:'127.0.0.1',port:8185,rules}});
const appId='settings-rules-only',companyId='company-a',otherCompanyId='company-b';
const positions={owner:'Chủ doanh nghiệp',accounting:'Kế toán & nhân sự',sales:'Kinh doanh',driver:'Tài xế',production:'Sản xuất',warehouse:'Xuất kho'};
const people=Object.entries(positions).map(([id,position])=>({id,companyId,position,role:id==='owner'?'owner':'employee'}));
const actor=id=>people.find(row=>row.id===id);
const client=(id,claims={})=>env.authenticatedContext(id,{companyId,appUserId:id,identityId:'identity-'+id,accountType:'employee',role:actor(id)?.role||'employee',...claims}).firestore();
const owner=client('owner'),staff=client('accounting'),sales=client('sales'),driver=client('driver'),warehouse=client('warehouse');
const ref=(db,name,id)=>doc(db,'artifacts',appId,'public','data',name,id);
const company=db=>ref(db,'companies',companyId);
const denied=promise=>assert.rejects(promise,error=>error.code==='permission-denied');
const read=async()=>(await getDoc(company(owner))).data();
const seedCompany=patch=>env.withSecurityRulesDisabled(context=>setDoc(company(context.firestore()),patch,{merge:true}));
async function seed(patch={}){
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async context=>{
    const db=context.firestore();
    await setDoc(company(db),{id:companyId,name:'Original',ownerId:'server-owner',billingStatus:'active',bankAccountNumber:'111',customerLoyaltyEnabled:false,...patch});
    await setDoc(ref(db,'companies',otherCompanyId),{id:otherCompanyId,name:'Other tenant'});
    for(const employee of people)await setDoc(ref(db,'employees',employee.id),employee);
  });
}
const individual=(id,modules,actions)=>({employeeRolePermissions:{[id]:modules},employeeRolePermissionActions:{[id]:actions}});
const settingsActions=['edit_company_profile','manage_bank_accounts','manage_payment_qr','manage_loyalty_settings','manage_employee_review_settings',
  'manage_customer_care_reminders','manage_attendance_wifi','manage_warehouse_dispatch_settings','manage_order_request_auto_cancel','manage_quick_action_defaults',
  'manage_gemini_api','restore_data','backup_restore_data','reset_company_data','reset_selected_data_scopes'];
const allFalse=()=>Object.fromEntries(settingsActions.map(key=>[key,false]));
const command=(id='intent',who='accounting')=>({companyId,actorId:who,commandId:id,fingerprint:'a'.repeat(64),mutationAt:'2026-11-22T01:02:03.000Z'});
const commandRef=(db,data)=>ref(db,'companySettingsCommands',data.companyId+'_'+data.actorId+'_'+data.commandId);
// Execute the actual App catalog initialization, including its post-build
// default overrides. This avoids a second guessed role/default matrix.
const appSource=fs.readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
const catalogStart=appSource.indexOf('const ROLE_PERMISSION_DEPARTMENTS ='),catalogEnd=appSource.indexOf('const getEmployeeRolePermissionKey =',catalogStart);
assert.ok(catalogStart>=0&&catalogEnd>catalogStart);
const catalog=Function('SALES_COLLABORATOR_POSITION','WAREHOUSE_EXPORT_POSITION',appSource.slice(catalogStart,catalogEnd)
  +';return {modules:DEFAULT_ROLE_PERMISSIONS,actions:DEFAULT_ROLE_PERMISSION_ACTIONS};')('Cộng tác viên kinh doanh','Xuất kho');

try{
  await test('direct SDK denies revoked profile, bank, QR, loyalty, care, warehouse, quick-action and AI fields atomically',{timeout:30000},async()=>{
    await seed(individual('accounting',{settings:false},{settings:allFalse()}));
    const before=await read();
    for(const patch of [{name:'Forged'},{bankAccountNumber:'999'},{invoiceQrTemplate:'compact'},{customerLoyaltyEnabled:true},
      {loyaltyRevenuePercent:99},{customerCareRules:{inactive:{enabled:true}}},{customerCareInactiveDays:1},
      {warehouseOrderAutoCancelDays:7},{floatingQuickActionEnabled:false},{enableAiAutoReply:true},
      {name:'Mixed',bankAccountNumber:'888'}]){
      await denied(updateDoc(company(staff),patch));assert.deepEqual(await read(),before);
    }
  });
  await test('live role/individual overrides match App semantics, including explicit action grants with a disabled module',{timeout:30000},async()=>{
    await seed(individual('accounting',{settings:false},{settings:{...allFalse(),edit_company_profile:true}}));
    await updateDoc(company(staff),{name:'Granted'});
    await denied(updateDoc(company(staff),{name:'Mixed',bankAccountNumber:'999'}));assert.equal((await read()).name,'Granted');
    await seedCompany(individual('accounting',{settings:true},{settings:{...allFalse(),edit_company_profile:false}}));
    await denied(updateDoc(company(staff),{name:'Revoked same session'}));
    await seedCompany({rolePermissions:{accounting:{settings:true}},rolePermissionActions:{accounting:{settings:{edit_company_profile:true}}}});
    await denied(updateDoc(company(staff),{name:'Role cannot override an individual revoke'}));
  });
  await test('actual App default catalog matches permitted config/domain fields for all six roles',{timeout:30000},async()=>{
    await seed();
    const cases=[['settings','edit_company_profile',id=>({name:'profile-'+id})],['settings','manage_bank_accounts',id=>({bankAccountNumber:'bank-'+id})],
      ['settings','manage_quick_action_defaults',()=>({floatingQuickActionEnabled:false})],['payroll','configure_salary_advance_limit',()=>({salaryAdvancePercent:30})],
      ['employee_reviews','manage_employee_review_criteria',()=>({employeeReviewCriteriaLabels:{quality:'QA'}})],
      ['employees','edit_employee',()=>({employeeDepartments:[{id:'qa',name:'QA'}]})]];
    for(const person of people)for(const[module,action,makePatch]of cases){
      const patch=makePatch(person.id);await seedCompany(Object.fromEntries(Object.keys(patch).map(key=>[key,key==='name'?'Original':null])));
      const expected=catalog.actions[person.id][module][action]===true;
      if(expected)await updateDoc(company(client(person.id)),patch);else await denied(updateDoc(company(client(person.id)),patch));
    }
  });
  await test('unknown authority and billing fields, replacement deletions and company deletion are server-owned even for owners',{timeout:30000},async()=>{
    await seed();const before=await read();
    for(const db of [staff,owner]){
      for(const patch of [{ownerId:'attacker'},{ownerPhone:'fake'},{uid:'fake'},{billingStatus:'paid'},{subscription:{active:true}},{isSuperAdmin:true},{unknownAuthority:true}])await denied(updateDoc(company(db),patch));
      await denied(setDoc(company(db),{id:companyId,name:'Replacement'}));await denied(deleteDoc(company(db)));
    }
    await denied(updateDoc(company(staff),{rolePermissions:{accounting:{role_permissions:true}}}));
    await updateDoc(company(owner),{rolePermissions:{accounting:{settings:true}},rolePermissionActions:{accounting:{settings:{manage_loyalty_settings:false}}}});
    assert.equal((await read()).ownerId,before.ownerId);assert.equal((await read()).billingStatus,before.billingStatus);
  });
  await test('bank-only edits retain QR across a twelve-account list and QR-only changes stay at the top level',{timeout:30000},async()=>{
    const accounts=Array.from({length:12},(_,index)=>({id:'bank-'+index,bankId:'VCB',bankName:'Bank',bankAccountName:'QA',bankAccountNumber:String(index),invoiceQrTemplate:'compact'}));
    await seed({...individual('accounting',{settings:true},{settings:{manage_bank_accounts:true,manage_payment_qr:false}}),companyBankAccounts:accounts});
    const changed=structuredClone(accounts);changed[11].bankAccountName='Edited';await updateDoc(company(staff),{companyBankAccounts:changed});
    const forged=structuredClone(changed);forged[11].invoiceQrTemplate='qr_only';await denied(updateDoc(company(staff),{companyBankAccounts:forged}));
    await updateDoc(company(staff),{companyBankAccounts:[...changed].reverse()});
    await seedCompany(individual('accounting',{settings:false},{settings:{manage_bank_accounts:false,manage_payment_qr:true}}));
    await updateDoc(company(staff),{invoiceQrTemplate:'qr_only'});await denied(updateDoc(company(staff),{companyBankAccounts:accounts}));
  });
  await test('bank-only legacy primary-account materialization preserves its existing custom QR without a QR grant',{timeout:30000},async()=>{
    await seed({...individual('accounting',{settings:true},{settings:{manage_bank_accounts:true,manage_payment_qr:false}}),
      bankId:'VCB',bankName:'Legacy bank',bankAccountName:'QA',bankAccountNumber:'111',invoiceQrTemplate:'compact',
      sepayVirtualAccountNumber:'',sepayUseVirtualAccount:false,autoReconcileByOrderCode:true});
    const current=await read(),draft={...getCompanyBankAccounts(current)[0],bankAccountName:'EDITED'};
    const patch=buildCompanyBankAccountUpdate(current,draft,false,{canManageAccounts:true,canManageQr:false});
    await updateDoc(company(staff),patch);assert.equal((await read()).companyBankAccounts[0].invoiceQrTemplate,'compact');
  });
  await test('non-Settings stock, product, department, payroll and review writers use their own catalog grants',{timeout:30000},async()=>{
    await seed(individual('warehouse',{settings:false,warehouse_import:true},{settings:allFalse(),warehouse_import:{create_warehouse_import:true,edit_warehouse_import:true,edit_inventory_balance:true}}));
    await updateDoc(company(warehouse),{productGroups:['Gà'],warehouseQuantityUnits:['Kg'],dailyInventorySnapshots:{qa:{weight:2}}});
    await denied(updateDoc(company(warehouse),{dailyInventorySnapshots:{},name:'Forged profile'}));
    await seedCompany(individual('sales',{settings:false,payroll:false,employees:false,employee_reviews:false},{settings:allFalse(),payroll:{configure_salary_advance_limit:true},employees:{edit_employee:true},employee_reviews:{manage_employee_review_criteria:true}}));
    await updateDoc(company(sales),{salaryAdvancePercent:null,salaryAdvancePercentByDepartment:{sales:30},employeeDepartments:[{id:'sales',name:'Sales'}],employeeReviewCriteriaLabels:{quality:'Cam kết'}});
    await seedCompany(individual('sales',{settings:false},{settings:{...allFalse(),reset_company_data:true}}));
    await updateDoc(company(sales),{warehouseStockResetAt:'2026-11-22',dailyInventorySnapshots:{},processingInventorySnapshots:{}});
  });
  await test('settings receipts require exact metadata, current actor rights, immutable creation and matching company field permissions',{timeout:30000},async()=>{
    const noMutationModules={settings:false,warehouse_import:false,products:false,employees:false,payroll:false,employee_reviews:false,role_permissions:false};
    await seed(individual('accounting',noMutationModules,{settings:allFalse()}));let data=command();
    await denied(setDoc(commandRef(staff,data),data));
    await seedCompany(individual('accounting',{settings:false},{settings:{...allFalse(),edit_company_profile:true}}));
    const batch=writeBatch(staff);batch.update(company(staff),{name:'Command confirmed',updatedAt:data.mutationAt});batch.set(commandRef(staff,data),data);await batch.commit();
    await denied(updateDoc(commandRef(staff,data),{fingerprint:'b'.repeat(64)}));await denied(deleteDoc(commandRef(staff,data)));
    for(const patch of [{actorId:'owner'},{companyId:otherCompanyId},{fingerprint:'invalid'},{extra:true}]){data={...command('bad-'+Object.keys(patch)[0]),...patch};await denied(setDoc(commandRef(staff,data),data));}
    data=command('mixed');const mixed=writeBatch(staff);mixed.update(company(staff),{name:'Never',bankAccountNumber:'999'});mixed.set(commandRef(staff,data),data);await denied(mixed.commit());
    assert.equal((await getDoc(commandRef(owner,data))).exists(),false);assert.equal((await read()).name,'Command confirmed');
  });
  await test('data command roots/parts enforce kind-specific rights and immutable plans/status transitions',{timeout:30000},async()=>{
    await seed(individual('accounting',{settings:false},{settings:allFalse()}));
    const root={...command('restore'),kind:'restore',requestFingerprint:'b'.repeat(64),totalChunks:1,status:'preparing'};
    const rootRef=ref(staff,'companyDataCommands',companyId+'_accounting_restore');
    await denied(setDoc(rootRef,root));
    await seedCompany(individual('accounting',{settings:false},{settings:{...allFalse(),restore_data:true}}));
    await setDoc(rootRef,root);const partRef=ref(staff,'companyDataCommands',companyId+'_accounting_restore__part_0');
    const part={companyId,actorId:'accounting',fingerprint:root.fingerprint,index:0,status:'prepared',expected:[{revision:null,skip:false}]};
    await setDoc(partRef,part);await denied(updateDoc(partRef,{expected:[]}));await denied(updateDoc(rootRef,{fingerprint:'c'.repeat(64)}));
    await updateDoc(rootRef,{status:'prepared'});await updateDoc(partRef,{status:'done'});await updateDoc(rootRef,{status:'complete'});
    await denied(updateDoc(rootRef,{status:'preparing'}));await denied(deleteDoc(partRef));
    const reset={...root,...command('reset'),kind:'reset'};await denied(setDoc(ref(staff,'companyDataCommands',companyId+'_accounting_reset'),reset));
    await seedCompany(individual('accounting',{settings:false},{settings:allFalse()}));await denied(updateDoc(rootRef,{status:'complete'}));
  });
  await test('unchanged delegated payroll/review/stock saves can create their exact command receipt without unrelated Settings grants',{timeout:30000},async()=>{
    for(const[module,action,patch]of [['payroll','configure_salary_advance_limit',{salaryAdvancePercent:30}],
      ['employee_reviews','manage_employee_review_criteria',{employeeReviewCriteriaLabels:{quality:'QA'}}],
      ['warehouse_import','edit_inventory_balance',{dailyInventorySnapshots:{qa:{weight:2}}}]]){
      await seed({...individual('sales',{settings:false,[module]:false},{settings:allFalse(),[module]:{[action]:true}}),...patch});
      const data={...command('noop-'+module,'sales')};const batch=writeBatch(sales);
      batch.update(company(sales),{...patch,updatedAt:data.mutationAt});batch.set(commandRef(sales,data),data);await batch.commit();
    }
  });
  await test('review and role schemas retain existing server audit constraints; unknown-field mixing cannot bypass them',{timeout:30000},async()=>{
    await seed(individual('sales',{settings:false},{settings:{manage_employee_review_settings:true}}));
    const review={employeeReviewsEnabled:false,employeeReviewsUpdatedByEmpId:'sales',employeeReviewsUpdatedAt:serverTimestamp()};
    await updateDoc(company(sales),review);await denied(updateDoc(company(sales),{...review,ownerId:'attacker'}));
    await denied(updateDoc(company(sales),{...review,employeeReviewsUpdatedByEmpId:'owner'}));
    await denied(updateDoc(company(sales),{attendanceWifiEnabled:true,attendanceWifiSsid:'Forged'}));
    await updateDoc(company(owner),{attendanceWifiEnabled:true,attendanceWifiSsid:'QA',attendanceWifiBssid:'aa:bb:cc:dd:ee:12'});
  });
  await test('existing runtime heartbeat/healing and order wake schemas work without granting unrelated Settings fields',{timeout:30000},async()=>{
    await seed({zaloDispatcherEnabled:true});
    await updateDoc(company(driver),{zaloDispatcherMachineId:'qa-machine',zaloDispatcherMachineName:'QA',zaloDispatcherHeartbeatAt:'2026-11-22T00:00:00.000Z'});
    await updateDoc(company(driver),{zaloDispatcherSendInvoicesEnabled:true,zaloDispatcherSendCampaignsEnabled:true,zaloDispatcherPaused:false,zaloDispatcherDisabled:false});
    await denied(updateDoc(company(driver),{enableAiAutoReply:true}));await denied(updateDoc(company(driver),{zaloDispatcherHeartbeatAt:'later',bankAccountNumber:'999'}));
    await updateDoc(company(sales),{zaloDispatcherEnabled:true,zaloDispatcherDisabled:false,zaloDispatcherPaused:false,zaloDispatcherSendInvoicesEnabled:true,zaloDispatcherWakeAt:'2026-11-22T00:00:00.000Z'});
    await denied(updateDoc(company(sales),{zaloDispatcherDelayMinSec:99,enableAiAutoReply:true}));
  });
  await test('archived/foreign employees, stale owner claims, customer identities and cross-tenant SDK writes cannot bypass config guards',{timeout:30000},async()=>{
    await seed();await env.withSecurityRulesDisabled(context=>updateDoc(ref(context.firestore(),'employees','accounting'),{isArchived:true}));
    await denied(updateDoc(company(staff),{name:'Archived'}));
    await denied(updateDoc(company(client('driver',{role:'owner'})),{name:'Spoofed owner'}));
    await denied(updateDoc(company(client('owner',{accountType:'customer',customerId:'qa'})),{name:'Customer'}));
    await denied(updateDoc(company(client('owner',{companyId:otherCompanyId})),{name:'Other tenant'}));
  });
  await test('tenant company/receipt reads and exact-document queries retain their existing contract',{timeout:30000},async()=>{
    await seed(individual('accounting',{settings:false},{settings:allFalse()}));
    assert.equal((await getDoc(company(staff))).data().name,'Original');
    const list=await getDocs(query(collection(staff,'artifacts',appId,'public','data','companies'),where(documentId(),'==',companyId)));assert.equal(list.size,1);
    await denied(getDoc(ref(staff,'companies',otherCompanyId)));
    await denied(getDocs(collection(staff,'artifacts',appId,'public','data','companies')));
  });
}finally{await env.cleanup();}
