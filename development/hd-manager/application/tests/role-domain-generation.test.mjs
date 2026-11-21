import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {extractEmployeeHomeDomain} from '../scripts/helpers/employee-home-domain-extraction.mjs';
import {extractEmployeeHomeDomain as rootExtract} from '../../../../scripts/helpers/employee-home-domain-extraction.mjs';
import {roleDomain as actual} from './helpers/role-permission-domain.mjs';
import * as payroll from '../src/features/payroll/payrollOriginalDomain.js';
const require=createRequire(import.meta.url);
const backend=require('../../../../functions/generated/offlineOriginalDomain.cjs');

test('extractor retains ordered forEach/if/property initializers and their transitive dependencies',()=>{
  const source=`const catalog={staff:{read:true}};
    const keys=['staff'];const restriction=false;
    keys.forEach(key=>{catalog[key].read=restriction;});
    if(catalog.staff)catalog.staff.extra=2;
    Object.assign(catalog.staff,{later:catalog.staff.extra+1});
    const evaluate=()=>({...catalog.staff});
    const unrelated={};unrelated.secret=window.secret;
    function neverCalled(){catalog.staff.read=true;}
    `;
  const evaluate=extract=>Function(extract(source,'.',['evaluate']).replace('export {evaluate};','return evaluate;'))()();
  assert.deepEqual(evaluate(extractEmployeeHomeDomain),{read:false,extra:2,later:3});
  assert.deepEqual(evaluate(rootExtract),evaluate(extractEmployeeHomeDomain));
  assert.doesNotMatch(extractEmployeeHomeDomain(source,'.',['evaluate']),/window|neverCalled/);
});

test('initializer dependencies cannot introduce browser or network globals into generated domains',()=>{
  for(const action of ['catalog.value=window.secret;','Object.assign(catalog,{value:fetch("/secret")});']){
    assert.throws(()=>extractEmployeeHomeDomain(`const catalog={};${action}const read=()=>catalog;`,'.',['read']),/Unapproved employee Home global/);
  }
});

test('all actual App catalog actions match generated payroll and backend across every department and override precedence',t=>{
  const modules=actual.ROLE_PERMISSION_MODULES;
  const modulesOn=Object.fromEntries(modules.map(m=>[m.id,true]));
  const modulesOff=Object.fromEntries(modules.map(m=>[m.id,false]));
  const actions=value=>Object.fromEntries(modules.map(m=>[m.id,Object.fromEntries(actual.getRolePermissionActionItems(m).map(a=>[a.id,value]))]));
  let comparisons=0;
  for(const department of actual.ROLE_PERMISSION_DEPARTMENTS){
    const employee={id:'actor',companyId:'tenant',position:department.positions[0],role:department.key==='owner'?'owner':'employee'};
    const cases=[{},
      {rolePermissions:{[department.key]:modulesOff}},
      {rolePermissions:{[department.key]:modulesOff},rolePermissionActions:{[department.key]:actions(true)}},
      {rolePermissions:{[department.key]:modulesOn},rolePermissionActions:{[department.key]:actions(false)}},
      {employeeRolePermissions:{actor:modulesOff}},
      {employeeRolePermissions:{actor:modulesOff},employeeRolePermissionActions:{actor:actions(true)}},
      {employeeRolePermissions:{actor:modulesOn},employeeRolePermissionActions:{actor:actions(false)}},
      {rolePermissionActions:{[department.key]:actions(false)},employeeRolePermissions:{actor:modulesOn}},
      {employeeRolePermissionActions:{actor:actions(false)}},
    ];
    for(const [index,policy]of cases.entries())for(const module of modules)for(const action of actual.getRolePermissionActionItems(module)){
      const subject={company:{id:'tenant',...policy},employee,currentUser:{...employee,accountType:'employee'}};
      const expected=actual.hasCompanyRolePermissionAction(subject,module.id,action.id);
      for(const [name,domain]of [['payroll',payroll],['backend',backend]]){
        assert.equal(domain.hasCompanyRolePermissionAction(subject,module.id,action.id),expected,`${name}/${department.key}/${index}/${module.id}/${action.id}`);
        comparisons++;
      }
    }
  }
  assert.ok(comparisons>20000,`Full catalog parity: ${comparisons}`);
  t.diagnostic(`${comparisons} actual-App comparisons across all catalog actions, six departments, nine override cases and two generated consumers`);
});

test('actual staff support/attachment restrictions survive generation while explicit grants remain authoritative',()=>{
  for(const department of actual.ROLE_PERMISSION_DEPARTMENTS.filter(row=>['sales','driver','production','warehouse'].includes(row.key))){
    const employee={id:'actor',companyId:'tenant',position:department.positions[0]},subject={company:{},employee,currentUser:employee};
    for(const domain of [actual,payroll,backend]){
      for(const action of ['view_support_messages','send_support_messages','send_bank_qr_attachment','send_report_attachment'])assert.equal(domain.hasCompanyRolePermissionAction(subject,'messages',action),false,department.key+'/'+action);
      const grant={...subject,company:{employeeRolePermissions:{actor:{messages:false}},employeeRolePermissionActions:{actor:{messages:{view_support_messages:true}}}}};
      assert.equal(domain.hasCompanyRolePermissionAction(grant,'messages','view_support_messages'),true);
    }
  }
});
