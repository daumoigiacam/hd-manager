import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {parse} from '@babel/parser';
import {transformSync} from 'esbuild';
import fs from 'node:fs';
import * as icons from 'lucide-react';
import {hooks,nodes} from './helpers/react-hook-frame.mjs';
import {roleDomain,roleApplicationSource} from './helpers/role-permission-domain.mjs';
import {createSettingsSaveController} from '../src/services/settingsSaveController.js';

const require=createRequire(import.meta.url);
function compile(source,name,env,capture=''){
  let declaration;
  function walk(node){if(!node||typeof node!=='object')return;if(node.type==='FunctionDeclaration'&&node.id?.name===name)declaration=node;
    for(const[key,value]of Object.entries(node)){if(['loc','extra','comments'].includes(key))continue;if(Array.isArray(value))value.forEach(walk);else if(value?.type)walk(value);}}
  walk(parse(source,{sourceType:'module',plugins:['jsx']}));assert.ok(declaration,name);
  let code=source.slice(declaration.start,declaration.end);
  if(capture){const last=declaration.body.body.findLast(row=>row.type==='ReturnStatement');
    code=source.slice(declaration.start,last.start)+`capture({${capture}});\n`+source.slice(last.start,declaration.end);}
  const bindings=Object.entries(env).filter(([key])=>/^[A-Za-z_$][\w$]*$/.test(key)&&key!=='default');
  return Function('require',...bindings.map(([key])=>key),transformSync(code,{loader:'jsx',jsx:'automatic',format:'cjs'}).code+`;return ${name};`)(require,...bindings.map(([,value])=>value));
}
const sales={id:'qa_sales',companyId:'qa',name:'QA sales',position:'Kinh doanh',role:'employee'};
const driver={id:'qa_driver',companyId:'qa',name:'QA driver',position:'Tài xế',role:'employee'};
function fixture(){
  const f={calls:[]},frame=hooks(),env={...frame,...icons,...roleDomain,createSettingsSaveController,
    useAppScreenBack:callback=>{f.back=callback;},capture:api=>{f.api=api;},AccessDeniedView:()=>null,getFriendlyFirebaseErrorMessage:error=>error.message};
  env.useSettingsSave=compile(fs.readFileSync(new URL('../src/hooks/useSettingsSave.js',import.meta.url),'utf8'),'useSettingsSave',env);
  const View=compile(roleApplicationSource,'RolePermissionView',env,
    'togglePermission,togglePermissionAction,setModuleActionPermissions,setDepartmentPermissions,resetDepartmentPermissions,handleSavePermissions,setSelectedDepartmentKey,setSelectedEmployeeId,draftPermissions,draftPermissionActions,draftEmployeePermissions,draftEmployeePermissionActions,selectedDepartment,selectedEmployee,canEditSelectedPermissionScope,saveStatus,isSaving');
  f.props={readIdentity:'owner-session',isSuperAdmin:true,canViewRolePermissions:true,canManageRolePermissions:true,canManageEmployeePermissionOverride:true,
    currentCompany:{id:'qa',rolePermissions:{sales:{messages:true},driver:{messages:true}},rolePermissionActions:{sales:{messages:{view_internal_messages:true}}},
      employeeRolePermissions:{qa_driver:{messages:false}},employeeRolePermissionActions:{qa_driver:{messages:{view_internal_messages:false}}}},
    employees:[sales,driver,{...sales,id:'foreign',companyId:'other'},{...sales,id:'archived',isArchived:true}]};
  f.ack=async(patch,options)=>{f.calls.push(structuredClone({patch,options}));f.props.currentCompany={...f.props.currentCompany,...patch};return{success:true,confirmed:true};};
  f.props.onUpdateCompanySettings=f.ack;
  f.render=()=>{let again,count=0;do{assert.ok(count++<15,'Stable render');frame.begin();f.tree=View(f.props);again=frame.commit();}while(again);return f.tree;};
  f.department=key=>{f.api.setSelectedDepartmentKey(key);f.render();};
  f.person=id=>{f.api.setSelectedEmployeeId(id);f.render();};
  f.action=(module,action)=>{f.api.togglePermissionAction(f.api.selectedDepartment.key,module,action);f.render();};
  f.unmount=()=>frame.unmount();f.render();return f;
}

test('actual module switch off revokes all tiny permissions instead of leaving hidden action grants enabled',async()=>{
  const f=fixture();f.department('sales');f.api.togglePermission('sales','messages');f.render();
  assert.equal(f.api.draftPermissions.sales.messages,false);
  assert.ok(Object.values(f.api.draftPermissionActions.sales.messages).every(value=>value===false));
  await f.api.handleSavePermissions();f.render();
  assert.deepEqual(Object.keys(f.calls[0].patch).sort(),['rolePermissionActions','rolePermissions']);
  assert.equal(roleDomain.hasCompanyRolePermissionAction({company:f.props.currentCompany,employee:sales,currentUser:sales},'messages','view_internal_messages'),false);
});

test('department-only manager saves only department fields and cannot edit an employee override',async()=>{
  const f=fixture();f.props.canManageEmployeePermissionOverride=false;f.render();f.department('sales');f.action('messages','view_internal_messages');
  await f.api.handleSavePermissions();f.render();assert.equal(f.calls.length,1);assert.deepEqual(Object.keys(f.calls[0].patch).sort(),['rolePermissionActions','rolePermissions']);
  assert.deepEqual(f.props.currentCompany.employeeRolePermissions,{qa_driver:{messages:false}});
  f.person('qa_sales');assert.equal(f.api.canEditSelectedPermissionScope,false);f.action('messages','send_internal_messages');await f.api.handleSavePermissions();assert.equal(f.calls.length,1);
});

test('override-only manager saves only employee fields, preserving department and other employee policies',async()=>{
  const f=fixture();f.props.canManageRolePermissions=false;f.render();f.department('sales');assert.equal(f.api.canEditSelectedPermissionScope,false);
  f.person('qa_sales');assert.equal(f.api.canEditSelectedPermissionScope,true);f.action('messages','view_internal_messages');
  const before=structuredClone(f.props.currentCompany.rolePermissions);await f.api.handleSavePermissions();f.render();
  assert.deepEqual(Object.keys(f.calls[0].patch).sort(),['employeeRolePermissionActions','employeeRolePermissions']);
  assert.deepEqual(f.props.currentCompany.rolePermissions,before);assert.deepEqual(f.calls[0].patch.employeeRolePermissions.qa_driver,{messages:false});
});

test('reset employee override removes both maps and restores inheritance without rewriting department policy',async()=>{
  const f=fixture();f.department('driver');f.person('qa_driver');f.api.resetDepartmentPermissions('driver');f.render();await f.api.handleSavePermissions();f.render();
  assert.equal(Object.hasOwn(f.calls[0].patch.employeeRolePermissions,'qa_driver'),false);assert.equal(Object.hasOwn(f.calls[0].patch.employeeRolePermissionActions,'qa_driver'),false);
  assert.equal(roleDomain.hasCompanyRolePermissionAction({company:f.props.currentCompany,employee:driver,currentUser:driver},'messages','view_internal_messages'),true);
});

test('role draft survives realtime company/employee updates and saves with its exact opening snapshot',async()=>{
  const f=fixture(),opening=structuredClone(f.props.currentCompany.rolePermissions);f.department('sales');f.action('messages','view_internal_messages');
  f.props.currentCompany={...f.props.currentCompany,name:'Realtime metadata'};f.props.employees=f.props.employees.map(row=>({...row,name:row.name+' updated'}));f.render();
  assert.equal(f.api.draftPermissionActions.sales.messages.view_internal_messages,false);assert.equal(f.api.selectedDepartment.key,'sales');
  await f.api.handleSavePermissions();f.render();assert.deepEqual(f.calls[0].options.expectedSettings.rolePermissions,{exists:true,value:opening});
});

test('actual role save locks duplicate clicks/back and retries the same failed command without losing its draft',async()=>{
  const f=fixture();let reject;f.props.onUpdateCompanySettings=(patch,options)=>{f.calls.push(structuredClone({patch,options}));return new Promise((_,r)=>{reject=r;});};
  f.department('sales');f.action('messages','view_internal_messages');const pending=f.api.handleSavePermissions();await f.api.handleSavePermissions();f.render();
  assert.equal(f.calls.length,1);assert.equal(f.back(),true);assert.equal(nodes(f.tree,n=>n.type==='fieldset')[0].props.disabled,true);
  reject(Error('Role ACK lost'));await pending;f.render();assert.match(f.api.saveStatus,/Role ACK lost/);assert.equal(f.api.draftPermissionActions.sales.messages.view_internal_messages,false);
  f.props.onUpdateCompanySettings=f.ack;f.render();await f.api.handleSavePermissions();f.render();assert.deepEqual(f.calls[1],f.calls[0]);assert.match(f.api.saveStatus,/Đã lưu/);
});

test('queued, false and incomplete role acknowledgements retain the draft and cannot claim success',async()=>{
  for(const receipt of [undefined,{success:false},{success:true},{success:true,confirmed:true,queued:true}]){
    const f=fixture();f.props.onUpdateCompanySettings=async()=>receipt;f.department('sales');f.action('messages','view_internal_messages');await f.api.handleSavePermissions();f.render();
    assert.doesNotMatch(f.api.saveStatus,/Đã lưu/);assert.ok(f.api.saveStatus);assert.equal(f.api.isSaving,false);assert.equal(f.api.draftPermissionActions.sales.messages.view_internal_messages,false);
  }
});

test('actor change or revoked manage rights cannot receive a late save status or retain the old private draft',async()=>{
  for(const change of ['actor','permission']){
    const f=fixture();let finish;f.props.onUpdateCompanySettings=()=>new Promise(resolve=>{finish=resolve;});f.department('sales');f.action('messages','view_internal_messages');
    const pending=f.api.handleSavePermissions();
    if(change==='actor'){f.props.readIdentity='different-owner';f.props.currentCompany={...f.props.currentCompany,id:'other'};}
    else{f.props.canManageRolePermissions=false;f.props.canManageEmployeePermissionOverride=false;}
    f.render();finish({success:true,confirmed:true});await pending;f.render();assert.equal(f.api.saveStatus,'');assert.equal(f.api.isSaving,false);
  }
});

test('view-only legacy manager flag cannot grant editing; owner controls remain immutable and foreign/archived staff are excluded',async()=>{
  const f=fixture();f.props.canManageRolePermissions=false;f.props.canManageEmployeePermissionOverride=false;f.render();f.department('sales');
  assert.equal(f.api.canEditSelectedPermissionScope,false);f.action('messages','view_internal_messages');await f.api.handleSavePermissions();assert.equal(f.calls.length,0);
  const options=nodes(f.tree,n=>n.type==='option').map(row=>row.props.value);assert.ok(options.includes('qa_sales'));assert.ok(!options.includes('foreign'));assert.ok(!options.includes('archived'));
  f.props.canManageRolePermissions=true;f.render();f.department('owner');f.api.setDepartmentPermissions('owner',false);f.render();assert.ok(Object.values(f.api.draftPermissions.owner).every(Boolean));
});

test('employee archived while editing blocks save instead of silently applying its override to a department',async()=>{
  const f=fixture();f.department('sales');f.person('qa_sales');f.action('messages','view_internal_messages');
  f.props.employees=f.props.employees.map(row=>row.id==='qa_sales'?{...row,isArchived:true}:row);f.render();
  assert.equal(f.api.canEditSelectedPermissionScope,false);await f.api.handleSavePermissions();f.render();assert.equal(f.calls.length,0);assert.match(f.api.saveStatus,/Nhân sự đã thay đổi/);
});
