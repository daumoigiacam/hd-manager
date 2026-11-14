import assert from 'node:assert/strict';
import test from 'node:test';
import {initialLocalWorkspace,showRestoredWorkspace,localWorkspaceTab,localWorkspaceInitialSource,restoredWorkspaceEntryTab} from '../development/hd-manager/application/src/services/workspacePresentation.js';

test('online Web opens the complete product; an Offline launch retains local presentation',()=>{
  assert.equal(initialLocalWorkspace({native:false,online:true}),false);
  assert.equal(initialLocalWorkspace({native:false,online:false}),true);
  assert.equal(initialLocalWorkspace({native:true,online:true}),true);
  assert.equal(initialLocalWorkspace({native:true,online:false}),true);
  const view={native:false,localMode:false,restored:true,online:true,firebaseUid:'a',principalId:'a'};
  assert.equal(showRestoredWorkspace(view),false);
  // Reconnect does not itself replace an Offline editor with the online UI.
  assert.equal(showRestoredWorkspace({...view,localMode:true,online:false}),true);
  assert.equal(showRestoredWorkspace({...view,localMode:true,online:true}),true);
  assert.equal(showRestoredWorkspace({...view,localMode:true,firebaseUid:'b'}),false);
});

test('Auth restoration preserves an explicit menu intent only for its original principal',()=>{
  const intent={requested:'more',requestedPrincipalId:'a',principalId:'a',accountType:'employee',fallback:'home'};
  assert.equal(restoredWorkspaceEntryTab(intent),'more');
  assert.equal(restoredWorkspaceEntryTab({...intent,principalId:'b'}),'home');
  assert.equal(restoredWorkspaceEntryTab({...intent,requestedPrincipalId:null}),'home');
  assert.equal(restoredWorkspaceEntryTab({...intent,accountType:'customer',fallback:'customer_home'}),'customer_home');
  assert.equal(restoredWorkspaceEntryTab({...intent,requested:'salarySettlements'}),'home');
  assert.equal(restoredWorkspaceEntryTab({...intent,requested:undefined,fallback:'orders'}),'orders');
});

test('Android presentation is identical to the accepted native condition',()=>{
  for(let bits=0;bits<256;bits++){
    const value={native:true,localMode:Boolean(bits&128),restored:Boolean(bits&1),online:Boolean(bits&2),hasCurrentUser:Boolean(bits&4),minimalEntry:Boolean(bits&8),enabled:Boolean(bits&16),firebaseUid:bits&32?'a':'b',principalId:'a',biometricUnlocked:Boolean(bits&64)};
    const accepted=value.restored||(!value.online&&!value.hasCurrentUser)
      ||(value.minimalEntry&&value.enabled&&value.firebaseUid===value.principalId&&value.biometricUnlocked);
    assert.equal(showRestoredWorkspace(value),accepted,`native case ${bits}`);
  }
});

test('existing Web route names map only to available local modules',()=>{
  assert.equal(localWorkspaceTab('warehouse_import',[{id:'warehouseImports'}]),'warehouseImports');
  assert.equal(localWorkspaceTab('warehouse_dispatch',[{id:'warehouseDispatches'}]),'warehouseDispatches');
  assert.equal(localWorkspaceTab('delivery_reports',[{id:'delivery'}]),'delivery');
  assert.equal(localWorkspaceTab('company_attendance',[{id:'hr'}]),'hr');
  assert.equal(localWorkspaceTab('payroll',[{id:'hr'}]),'hr');
  assert.equal(localWorkspaceTab('warehouse_import',[]),null);
  assert.equal(localWorkspaceTab('bank_payments',[{id:'finance'}]),null);
  assert.equal(localWorkspaceTab('messages',[]),null);
  assert.equal(localWorkspaceInitialSource('company_attendance'),'attendance');
  assert.equal(localWorkspaceInitialSource('payroll'),'payrollSnapshots');
  assert.equal(localWorkspaceInitialSource('employees'),'employees');
  assert.equal(localWorkspaceInitialSource('finance'),undefined);
});
