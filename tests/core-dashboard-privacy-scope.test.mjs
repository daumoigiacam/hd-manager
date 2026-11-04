import test from 'node:test';import assert from 'node:assert/strict';import {createDashboardPrivacyScope} from '../src/utils/dashboardPrivacyScope.js';
const base={companyId:'a',currentUser:{id:'u',companyId:'a',role:'employee',accountType:'employee'},employee:{id:'e',companyId:'a',position:'Kinh doanh',salesLeaderId:'lead',secondaryPositions:['Giao hàng']},rolePermissionKey:'sales',rolePermissions:['home','orders'],rolePermissionActions:{orders:{view_orders:true}},employeeScopeIds:new Set(['e','child'])};
test('report continuity ignores display/backup metadata and Firestore reference objects without serializing private documents',()=>{
 const circular={};circular.self=circular;const newer={...base,currentUser:{...base.currentUser,lastSeenAt:99},employee:{...base.employee,name:'Updated display name',lastSeenAt:99,userRef:circular}};
 assert.equal(createDashboardPrivacyScope(base),createDashboardPrivacyScope(newer));
 assert.equal(createDashboardPrivacyScope({...base,employeeScopeIds:new Set(['child','e'])}),createDashboardPrivacyScope(base));
});
test('tenant, principal, role grant, ownership and employee hierarchy changes clear the retained read scope',()=>{
 for(const patch of [{companyId:'b'},{currentUser:{...base.currentUser,id:'other'}},{currentUser:{...base.currentUser,accountType:'customer'}},
  {employee:{...base.employee,id:'different'}},{employee:{...base.employee,salesLeaderId:'other'}},
  {rolePermissionActions:{orders:{view_orders:false}}},{rolePermissions:['home']},{isOwnerAccount:true},
  {employeeScopeIds:new Set(['e'])},{employee:{...base.employee,position:'Kho'}}])
  assert.notEqual(createDashboardPrivacyScope({...base,...patch}),createDashboardPrivacyScope(base));
});
test('unknown object-valued access fields fail closed without traversing references',()=>{
 const ref={};ref.circular=ref;const input={...base,employee:{...base.employee,department:ref}};
 assert.equal(createDashboardPrivacyScope(input),createDashboardPrivacyScope(input));
 assert.notEqual(createDashboardPrivacyScope(input),createDashboardPrivacyScope({...base,employee:{...base.employee,department:{}}}));
});
test('confirmed company owner retains a report during personnel hydration but loses retention on revoked owner access',()=>{
 const owner={...base,isOwnerAccount:true,rolePermissionKey:'owner'};
 assert.equal(createDashboardPrivacyScope(owner),createDashboardPrivacyScope({...owner,
  employee:{...base.employee,accountType:'employee',position:'Kế toán & nhân sự'},employeeScopeIds:new Set(['different-child'])}));
 assert.notEqual(createDashboardPrivacyScope(owner),createDashboardPrivacyScope({...owner,isOwnerAccount:false}));
 assert.notEqual(createDashboardPrivacyScope(owner),createDashboardPrivacyScope({...owner,employee:{...base.employee,id:'other'}}));
 assert.notEqual(createDashboardPrivacyScope(owner),createDashboardPrivacyScope({...owner,rolePermissionActions:{orders:{view_orders:false}}}));
});
