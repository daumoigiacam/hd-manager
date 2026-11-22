import test from 'node:test';
import assert from 'node:assert/strict';
import {roleDomain as model,getEmployeeRolePermissionKey,roleApplicationSource} from './helpers/role-permission-domain.mjs';
import {parse} from '@babel/parser';

const positions={owner:'Chủ doanh nghiệp',accounting:'Kế toán & nhân sự',sales:'Kinh doanh',driver:'Tài xế',production:'Sản xuất',warehouse:'Cân hàng xuất kho'};
const employee=key=>({id:'qa-'+key,companyId:'qa',position:positions[key],role:key==='owner'?'owner':'employee'});
const context=(key,company={})=>({employee:employee(key),currentUser:{...employee(key)},company:{id:'qa',...company}});

test('actual role catalogue has unique modules/actions and complete defaults for every supported department',()=>{
  assert.equal(new Set(model.ROLE_PERMISSION_MODULES.map(row=>row.id)).size,model.ROLE_PERMISSION_MODULES.length);
  for(const department of model.ROLE_PERMISSION_DEPARTMENTS){
    assert.equal(getEmployeeRolePermissionKey(employee(department.key)),department.key);
    for(const module of model.ROLE_PERMISSION_MODULES){
      const actions=model.getRolePermissionActionItems(module);
      assert.ok(actions.length>0,module.id);assert.equal(new Set(actions.map(row=>row.id)).size,actions.length,module.id);
      assert.equal(typeof model.DEFAULT_ROLE_PERMISSIONS[department.key][module.id],'boolean');
      for(const action of actions)assert.equal(typeof model.DEFAULT_ROLE_PERMISSION_ACTIONS[department.key][module.id][action.id],'boolean');
    }
  }
});

test('all actual module/action grants can be explicitly revoked; employee override denies take precedence over department grants',()=>{
  let verified=0;
  for(const department of model.ROLE_PERMISSION_DEPARTMENTS.filter(row=>row.key!=='owner')){
    const person=employee(department.key);
    for(const module of model.ROLE_PERMISSION_MODULES){
      const actionIds=model.getRolePermissionActionItems(module).map(row=>row.id),off=Object.fromEntries(actionIds.map(id=>[id,false]));
      const company={rolePermissions:{[department.key]:{[module.id]:false}},rolePermissionActions:{[department.key]:{[module.id]:off}}};
      assert.equal(model.hasCompanyRolePermission(context(department.key,company),module.id),false,module.id);
      for(const action of actionIds){
        assert.equal(model.hasCompanyRolePermissionAction(context(department.key,company),module.id,action),false);
        const grant={...company,rolePermissionActions:{[department.key]:{[module.id]:{...off,[action]:true}}}};
        assert.equal(model.hasCompanyRolePermissionAction(context(department.key,grant),module.id,action),true,'Explicit action grant is authoritative');
        const override={...grant,employeeRolePermissions:{[person.id]:{[module.id]:false}},employeeRolePermissionActions:{[person.id]:{[module.id]:off}}};
        assert.equal(model.hasCompanyRolePermissionAction(context(department.key,override),module.id,action),false,'Employee override revocation');
        assert.equal(model.hasCompanyRolePermissionAction(context(department.key,grant),module.id,action),true,'Removing override inherits department grant');
        verified++;
      }
    }
  }
  assert.ok(verified>1000,'Exercise every catalogue action in all five staff roles');
});

test('owner access remains immutable across all actual modules/actions and cannot be disabled by an employee override',()=>{
  const permissions=model.buildPermissionSet([]),actions=model.buildPermissionActionSet([]);
  const owner=employee('owner'), company={rolePermissions:{owner:permissions},rolePermissionActions:{owner:actions},
    employeeRolePermissions:{[owner.id]:permissions},employeeRolePermissionActions:{[owner.id]:actions}};
  for(const module of model.ROLE_PERMISSION_MODULES){
    assert.equal(model.hasCompanyRolePermission(context('owner',company),module.id),true);
    for(const action of model.getRolePermissionActionItems(module))assert.equal(model.hasCompanyRolePermissionAction(context('owner',company),module.id,action.id),true);
  }
});

test('sensitive default grants retain accounting/sales/driver restrictions rather than inheriting owner rights',()=>{
  for(const role of ['sales','driver','production','warehouse']){
    const current=context(role);
    assert.equal(model.hasCompanyRolePermissionAction(current,'settings','manage_employee_review_settings'),false);
    assert.equal(model.hasCompanyRolePermissionAction(current,'payroll','configure_salary_advance_limit'),false);
    assert.equal(model.hasCompanyRolePermissionAction(current,'role_permissions','manage_role_permissions'),false);
    assert.equal(model.hasCompanyRolePermissionAction(current,'messages','view_support_messages'),false);
    assert.equal(model.hasCompanyRolePermissionAction(current,'messages','view_internal_messages'),true);
  }
});

test('all literal permission checks in the actual App refer to registered modules/actions',()=>{
  const modules=new Map(model.ROLE_PERMISSION_MODULES.map(row=>[row.id,new Set(model.getRolePermissionActionItems(row).map(action=>action.id))]));
  const unknown=[],seen=new Set();
  function visit(node){if(!node||typeof node!=='object')return;
    if(node.type==='CallExpression'&&['canRoleAction','hasCompanyRolePermissionAction'].includes(node.callee?.name)){
      const offset=node.callee.name==='canRoleAction'?0:1,[module,action]=node.arguments.slice(offset,offset+2);
      if(module?.type==='StringLiteral'&&action?.type==='StringLiteral'){
        const key=module.value+'/'+action.value;seen.add(key);
        if(!modules.get(module.value)?.has(action.value))unknown.push({check:key,line:node.loc.start.line});
      }
    }
    for(const[key,value]of Object.entries(node)){if(['loc','extra','comments'].includes(key))continue;if(Array.isArray(value))value.forEach(visit);else if(value?.type)visit(value);}
  }
  visit(parse(roleApplicationSource,{sourceType:'module',plugins:['jsx']}));
  assert.ok(seen.size>100,'Exercise real operation-to-permission wiring');assert.deepEqual(unknown,[]);
});

test('actual read-owner revision retains the immutable owner editor but invalidates staff reads when policies change',()=>{
  const app=parse(roleApplicationSource,{sourceType:'module',plugins:['jsx']}).program.body.find(row=>row.type==='FunctionDeclaration'&&row.id.name==='ApplicationView');
  const declaration=app.body.body.flatMap(row=>row.declarations||[]).find(row=>row.id.name==='readPermissionKey');
  assert.ok(declaration,'Current read-owner policy revision');
  const source=roleApplicationSource.slice(declaration.init.start,declaration.init.end);
  const evaluate=Function('useMemo','isOwnerAccountUser','canonicalQueryValue','getCompanyRolePermissions','getCompanyRolePermissionActions','currentCompany','currentUser',`return ${source};`);
  const revision=(company,user)=>evaluate(callback=>callback(),(_employee,actor)=>actor.role==='owner',JSON.stringify,model.getCompanyRolePermissions,model.getCompanyRolePermissionActions,company,user);
  const before={},after={rolePermissionActions:{sales:{messages:{view_internal_messages:false}}}};
  assert.equal(revision(before,{role:'owner'}),revision(after,{role:'owner'}),'Owner editor remains mounted for command ACK');
  assert.notEqual(revision(before,{role:'sales'}),revision(after,{role:'sales'}),'Staff revocation retains private-read invalidation');
});
