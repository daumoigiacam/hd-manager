import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {parse} from '@babel/parser';
import {transformSync} from 'esbuild';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import * as locks from '../src/utils/payrollPeriodLock.js';
import * as carry from '../src/utils/payrollDebtCarryover.js';
import * as advances from '../src/utils/salaryAdvancePeriod.js';
import * as workspaceModel from '../src/features/payroll/payrollWorkspaceModel.js';
import {applyEmployeePayrollPolicyForMonth} from '../src/utils/payrollPolicyHistory.js';
import {projectEvaluationSummaryToPayroll} from '../src/utils/payrollEvaluationBonus.js';
import {isEmployeeReviewEnabled} from '../src/utils/companyEmployeeReviews.js';
import {selectRetainedReadProjection} from '../src/hooks/useRetainedReadProjection.js';
import {isRetryableWriteError} from '../src/utils/pendingWriteRetry.js';

const require=createRequire(import.meta.url);
const read=file=>fs.readFileSync(new URL(file,import.meta.url),'utf8');
const ast=source=>parse(source,{sourceType:'module',plugins:['jsx']});
const source=read('../src/features/legacy/SalaryView.jsx'),tree=ast(source);
const factory=tree.program.body.find(n=>n.type==='ExportNamedDeclaration'&&n.declaration?.id?.name==='createSalaryView').declaration;
const view=factory.body.body.find(n=>n.type==='FunctionDeclaration'&&n.id.name==='SalaryView');
const lastReturn=view.body.body.findLast(n=>n.type==='ReturnStatement');
// Capture the actual closures for row commands; render the complete production
// component and its actual PayrollWorkspace instead of reconstructing a form.
const capture=`capture({openFinancialModal,openEditFinancialModal,handleSubmit,setExpandedEmp,setSalaryMonth,
  payrollViewReady,liveSalaryRows,canLockSelectedPayrollPeriod,financialSubmitRef,financialIntentRef});\n`;
const factoryText=source.slice(factory.start,lastReturn.start)+capture+source.slice(lastReturn.start,factory.end);
const factoryCode=transformSync(factoryText,{loader:'jsx',jsx:'automatic',format:'cjs'}).code;
const workspaceSource=read('../src/features/payroll/PayrollWorkspace.jsx'),workspaceTree=ast(workspaceSource);
const workspaceText=workspaceTree.program.body.filter(n=>n.type!=='ImportDeclaration').map(n=>{
  const declaration=n.type==='ExportDefaultDeclaration'?n.declaration:n;
  return workspaceSource.slice(declaration.start,declaration.end);
}).join('\n');
const workspaceCode=transformSync(workspaceText,{loader:'jsx',jsx:'automatic',format:'cjs'}).code;
const retainedSource=read('../src/hooks/useRetainedReadProjection.js');
const retained=ast(retainedSource).program.body.find(n=>n.type==='ExportNamedDeclaration'&&n.declaration?.id?.name==='useRetainedReadProjection').declaration;
const retainedCode=retainedSource.slice(retained.start,retained.end);
const shared=read('../src/features/customers/productCRMShared.jsx'),sharedTree=ast(shared);
function sharedFunction(name) {
  const n=sharedTree.program.body.filter(n=>n.type==='VariableDeclaration').flatMap(n=>n.declarations).find(n=>n.id.name===name);
  return Function(`return (${shared.slice(n.init.start,n.init.end)})`)();
}
const parseInputCurrency=sharedFunction('parseInputCurrency'),parseLooseMoneyValue=sharedFunction('parseLooseMoneyValue');
const empty={rows:[],evaluations:new Map(),detailsByEmployee:new Map()};
const employee={id:'qa-staff',companyId:'tenant-a',name:'Payroll QA',position:'Sản xuất',basicSalary:6000000,salaryMonthDays:26,
  payrollPolicies:[{id:'policy',version:'v1',effectiveFrom:'2026-11-01',effectiveTo:'',values:{position:'Sản xuất',basicSalary:6000000,salaryMonthDays:26}}]};
const details={monthKey:'2026-11',netSalary:6700000,grossSalary:6700000,deductionTotal:0,baseSalaryCalc:6000000,
  workDays:26,supportSalary:500000,responsibilitySalary:200000,experienceSalary:0,commission:0,totalBonus:0,totalPenalty:0,
  totalAdvance:0,totalEmployeePurchase:0,earlyOvertimeHours:0,afterShiftOvertimeHours:0,automaticOvertimeHours:0,
  overtimePay:0,tieredBonus:0,badDebt:0,attendanceEntries:[],bonusRecords:[],penaltyRecords:[],advanceRecords:[],employeePurchaseRecords:[],
  perf:{revenue:0,overtime:0},evaluationResult:{status:'disabled',bonus:0}};
const completed={rows:[{emp:employee,details}],evaluations:new Map(),detailsByEmployee:new Map([[employee.id,details]])};
const noop=()=>null,asText=value=>String(value??'');
const nodes=(node,predicate,out=[])=>{
  if(!node||typeof node!=='object')return out;
  if(predicate(node))out.push(node);
  React.Children.forEach(node.props?.children,child=>nodes(child,predicate,out));return out;
};
const text=node=>typeof node==='string'||typeof node==='number'?String(node):React.Children.toArray(node?.props?.children).map(text).join('');
function hooks() {
  let slots=[],cursor=0,layouts=[];
  return {
    begin(){cursor=0;layouts=[];},commit(){layouts.forEach(effect=>effect());},reset(){slots=[];},
    useState(initial){const slot=cursor++;if(!(slot in slots))slots[slot]=typeof initial==='function'?initial():initial;
      return[slots[slot],next=>{slots[slot]=typeof next==='function'?next(slots[slot]):next;}];},
    useRef(initial){const slot=cursor++;if(!(slot in slots))slots[slot]={current:initial};return slots[slot];},
    useMemo:calculate=>calculate(),useCallback:callback=>callback,useEffect(){},useLayoutEffect:effect=>layouts.push(effect),
  };
}
function fixture(handlers={}) {
  const root=hooks(),child=hooks(),calls=[];
  const icons=Object.fromEntries([...tree.program.body,...workspaceTree.program.body].filter(n=>n.type==='ImportDeclaration'&&n.source.value==='lucide-react')
    .flatMap(n=>n.specifiers.map(s=>[s.local.name,noop])));
  const Workspace=Function('require',...Object.keys({...workspaceModel,...child,...icons}),`${workspaceCode};return PayrollWorkspace;`)(
    require,...Object.values({...workspaceModel,...child,...icons}));
  const useRetainedReadProjection=Function('useRef','useLayoutEffect','selectRetainedReadProjection',`${retainedCode};return useRetainedReadProjection;`)(
    root.useRef,root.useLayoutEffect,selectRetainedReadProjection);
  const f={calls,handlers,projection:{pending:false,error:null,value:completed}};
  const runtime={EMPTY_PAYROLL_VIEW:empty,ModuleDependencyService:{getEmployeesMissingPayrollConfig:()=>[]},
    PayrollWorkspace:Workspace,PayrollCloseDialog:noop,PayrollCompactMetric:noop,PayrollEvaluationDetailDialog:noop,
    SALARY_ADVANCE_DEPARTMENT_OPTIONS:[],buildPayrollViewProjectionSteps:noop,capitalizeFirst:asText,
    formatCommissionPercentLabel:asText,formatCurrency:asText,formatDateTimeLabel:asText,formatInputCurrency:asText,
    formatMonthYearLabel:asText,formatPercentValue:asText,formatTime:asText,getEmployeePositionSummary:e=>e.position,
    getCompanySalaryAdvancePercentByDepartment:()=>({}),getEmployeeSalaryAdvanceLimitConfig:()=>({percent:50}),
    getEmployeeSalaryAdvancePercent:()=>50,getFriendlyFirebaseErrorMessage:error=>error.message,getTodayString:()=> '2026-11-20',
    isAccountingPosition:position=>position==='Kế toán & nhân sự',isEmployeeSalesPosition:()=>false,
    isOwnerAccountUser:(_employee,user)=>user?.role==='owner',isOwnerPosition:()=>false,isSalesCollaboratorPosition:()=>false,
    normalizeSalaryAdvancePercent:Number,parseInputCurrency,parseLooseMoneyValue,roundMoneyValue:Math.round};
  const env={...root,...locks,...advances,getPreviousPayrollMonthKey:carry.getPreviousPayrollMonthKey,applyEmployeePayrollPolicyForMonth,
    getReadOnlyModuleProjectionEntry:()=>({}),getLocalProjectionClockScope:()=> '2026-11-20',EMPTY_MODULE_PROJECTION_SOURCE:[],
    useCooperativeProjection:()=>f.projection,useRetainedReadProjection,useAppScreenBack(){},CommissionCalculationDetails:noop,
    projectEvaluationSummaryToPayroll,isEmployeeReviewEnabled,payrollAutomationConfig:{autoLockEnabled:false},...icons,
    getVietnamPayrollDateKey:()=> '2026-11-30',capture:api=>{f.api=api;}};
  const View=Function('require',...Object.keys(env),`${factoryCode};return createSalaryView;`)(require,...Object.values(env))(runtime);
  const invoke=kind=>async(...args)=>{calls.push({kind,args});return handlers[kind]?handlers[kind](...args):kind==='add'?{confirmed:true,queued:false}:undefined;};
  f.props={selectedPayrollEmployeeId:employee.id,setSelectedPayrollEmployeeId(){},payrollScreen:'detail',setPayrollScreen(){},
    payrollSearchKeyword:'',payrollFilterOpen:false,currentCompany:{id:'tenant-a',employeeReviewsEnabled:false},
    currentUser:{id:'owner-account',role:'owner',companyId:'tenant-a'},currentEmployee:employee,employees:[employee],
    employeeReviews:[],payrollPeriods:[],payrollDebtCarryovers:[],payrollAutoLockPlans:[],attendance:{},financials:[],performance:{},
    customers:[],orders:[],payments:[],holidays:[],deliveryReports:[],customerComplaints:[],attendanceLoaded:true,complaintsLoaded:true,
    advanceRequests:[],onAddFinancial:invoke('add'),onEditFinancial:invoke('edit'),onUpdatePerformance:invoke('performance'),onLockPayrollPeriod:noop};
  let lastKey;
  f.render=()=>{
    root.begin();f.tree=View(f.props);root.commit();
    const node=nodes(f.tree,n=>n.type===Workspace)[0];
    if(!node){child.reset();lastKey=undefined;f.workspace=undefined;f.childTree=undefined;return f.tree;}
    if(lastKey!==node.key)child.reset();lastKey=node.key;f.workspace=node;
    child.begin();f.childTree=Workspace(node.props);child.commit();return f.tree;
  };
  f.open=(type='bonus',record=null)=>{
    record?f.api.openEditFinancialModal(employee,record):f.api.openFinancialModal(employee,type);
    f.render();return f.dialog();
  };
  f.dialog=()=>nodes(f.tree,n=>n.type==='form'&&n.props.role==='dialog')[0];
  f.input=(label,value)=>{
    const input=nodes(f.dialog(),n=>n.type==='input'&&n.props['aria-label']===label)[0];assert.ok(input,label);
    input.props.onChange({target:{value}});f.render();
  };
  f.submit=()=>f.dialog().props.onSubmit({preventDefault(){}});
  f.render();return f;
}

test('actual SalaryView keeps PayrollWorkspace and its selected detail tab during pending refresh without an updating banner',()=>{
  const f=fixture();
  nodes(f.childTree,n=>n.props?.role==='tab'&&text(n)==='Thưởng/Phạt')[0].props.onClick();f.render();
  const key=f.workspace.key,type=f.workspace.type;
  f.projection={pending:true,error:null,value:empty};f.render();
  assert.equal(f.workspace.type,type);assert.equal(f.workspace.key,key);
  assert.strictEqual(f.workspace.props.rows,completed.rows);
  assert.equal(nodes(f.childTree,n=>n.props?.role==='tab'&&text(n)==='Thưởng/Phạt')[0].props['aria-selected'],true);
  assert.equal(nodes(f.tree,n=>n.props?.role==='status').length,0);
  assert.equal(nodes(f.tree,n=>n.type==='input'&&n.props.type==='month').length,0);
  assert.equal(f.tree.props['aria-busy'],true);
  assert.equal(f.api.payrollViewReady,false);
  assert.equal(f.api.liveSalaryRows.length,0,'Retained presentation never becomes the live write source');
  assert.equal(f.api.canLockSelectedPayrollPeriod,false);
  f.projection={pending:false,error:null,value:completed};f.render();
  assert.equal(nodes(f.childTree,n=>n.props?.role==='tab'&&text(n)==='Thưởng/Phạt')[0].props['aria-selected'],true);
});

test('actual presentation rejects retained rows across actor, tenant, month, permissions, lock and evaluation scopes and exposes errors',()=>{
  const changes=[f=>{f.props.currentUser={...f.props.currentUser,id:'another-account'};},
    f=>{f.props.currentCompany={...f.props.currentCompany,id:'another-company'};},f=>f.api.setSalaryMonth('2026-10'),
    f=>{f.props.canViewAllPayroll=true;},f=>{f.props.currentCompany={...f.props.currentCompany,employeeReviewsEnabled:true};}];
  for(const change of changes){const f=fixture();change(f);f.projection={pending:true,error:null,value:empty};f.render();
    assert.equal(f.workspace,undefined);assert.ok(nodes(f.tree,n=>n.props?.role==='status').length);}
  const locked=fixture();locked.props.payrollPeriods=[{id:'locked',companyId:'tenant-a',monthKey:'2026-11',status:'LOCKED'}];
  locked.projection={pending:true,error:null,value:empty};locked.render();assert.equal(locked.workspace.props.rows.length,0);
  const failure=fixture();failure.projection={pending:false,error:Error('denied'),value:empty};failure.render();
  assert.equal(failure.workspace,undefined);assert.ok(nodes(failure.tree,n=>n.props?.role==='alert').length);
});

test('actual modal locks rapid submits, retains failed drafts, reuses intent IDs on retry and changes IDs only for a changed or new intent',async()=>{
  let release,fail=true;
  const f=fixture({add:()=>new Promise((resolve,reject)=>{release=()=>fail?reject(Error('lost acknowledgement')):resolve({confirmed:true});})});
  f.open();f.input('Số tiền (VNĐ)','100000');f.input('Lý do','Thưởng đã kiểm tra');
  const first=f.submit();f.render();await f.submit();assert.equal(f.calls.length,1);
  assert.ok(nodes(f.dialog(),n=>n.type==='button'&&n.props.type==='submit')[0].props.disabled);
  release();await first;f.render();assert.ok(f.dialog());assert.match(renderToStaticMarkup(f.dialog()),/lost acknowledgement/);
  assert.equal(nodes(f.dialog(),n=>n.props?.['aria-label']==='Số tiền (VNĐ)')[0].props.value,'100000');
  const id=f.calls[0].args[5].clientMutationId;
  const retry=f.submit();release();await retry;f.render();assert.equal(f.calls[1].args[5].clientMutationId,id);
  f.input('Số tiền (VNĐ)','200000');const changed=f.submit();release();await changed;f.render();
  assert.notEqual(f.calls[2].args[5].clientMutationId,id);
  fail=false;const confirmed=f.submit();release();await confirmed;f.render();assert.equal(f.dialog(),undefined);
  assert.equal(f.calls[3].args[5].clientMutationId,f.calls[2].args[5].clientMutationId);
  f.open();f.input('Số tiền (VNĐ)','200000');const newIntent=f.submit();release();await newIntent;
  assert.notEqual(f.calls[4].args[5].clientMutationId,f.calls[3].args[5].clientMutationId);
});

test('actual modal rejects invalid/current pending writes, explicit queued/failed add receipts and accepts void edit/performance APIs',async()=>{
  for(const value of ['0','-1','Infinity','NaN']){const f=fixture();f.open();f.input('Số tiền (VNĐ)',value);await f.submit();f.render();
    assert.equal(f.calls.length,0);assert.ok(nodes(f.dialog(),n=>n.props?.role==='alert').length);}
  for(const receipt of [{queued:true},{success:false,message:'denied'}]){const f=fixture({add:async()=>receipt});f.open();f.input('Số tiền (VNĐ)','100000');
    await f.submit();f.render();assert.ok(f.dialog());assert.ok(nodes(f.dialog(),n=>n.props?.role==='alert').length);}
  const pending=fixture();pending.open();pending.input('Số tiền (VNĐ)','100000');pending.projection={pending:true,error:null,value:empty};pending.render();
  await pending.submit();assert.equal(pending.calls.length,0);
  const edit=fixture();edit.open('bonus',{id:'f-existing',type:'bonus',amount:100000,reason:'Edit'});await edit.submit();edit.render();
  assert.equal(edit.calls[0].kind,'edit');assert.equal(edit.dialog(),undefined);
  let fail=true;const performance=fixture({performance:async()=>{if(fail)throw Error('overtime failure');}});performance.open('performance');
  performance.input('Số giờ tăng ca đã duyệt','2.5');await performance.submit();performance.render();
  assert.match(renderToStaticMarkup(performance.dialog()),/overtime failure/);fail=false;await performance.submit();performance.render();
  assert.equal(performance.dialog(),undefined);assert.equal(performance.calls[1].args[1],2.5);
});

test('actual role notice is shown only to read-only employees; stale-scope modal closures cannot write',async()=>{
  const owner=fixture();owner.api.setExpandedEmp(employee.id);owner.render();assert.doesNotMatch(text(owner.tree),/Bảng lương chỉ dùng để xem lương cá nhân/);
  const reader=fixture();reader.props.currentUser={id:employee.id,role:'employee'};reader.api.setExpandedEmp(employee.id);reader.render();
  assert.match(text(reader.tree),/Bảng lương chỉ dùng để xem lương cá nhân/);
  const f=fixture();f.open();f.input('Số tiền (VNĐ)','100000');const stale=f.api.handleSubmit;
  f.props.currentUser={...f.props.currentUser,id:'new-account'};f.projection={pending:true,error:null,value:empty};f.render();
  assert.equal(f.dialog(),undefined);await stale({preventDefault(){}});assert.equal(f.calls.length,0);
});

const app=read('../src/App.jsx'),appTree=ast(app),appFunctions=new Map();
function collect(n){if(!n||typeof n!=='object')return;if(n.type==='VariableDeclarator'&&n.id.name)appFunctions.set(n.id.name,n.init);
  for(const[k,v]of Object.entries(n)){if(['loc','comments','extra'].includes(k))continue;if(Array.isArray(v))v.forEach(collect);else if(v?.type)collect(v);}}
collect(appTree);
const actual=(name,env)=>{const n=appFunctions.get(name);assert.ok(n,name);return Function(...Object.keys(env),`return (${app.slice(n.start,n.end)})`)(...Object.values(env));};
function parentFixture(){
  const calls=[],confirmations=[],publications=[],documents=new Map();let rows=[{id:'f-own',companyId:'tenant-a',amount:100000},{id:'f-foreign',companyId:'tenant-b',amount:100000}];
  const env={isVpsStagingMode:false,firebaseUser:{uid:'actor'},myCompanyId:'tenant-a',currentUser:{id:'actor'},
    employees:[employee,{id:'foreign',companyId:'tenant-b'}],rawFinancials:rows,parseLooseMoneyValue,capitalizeFirst:asText,
    getTodayString:()=> '2026-11-20',activeTenantScopeRef:{current:'tenant-a'},isRetryableWriteError,withTimeout:promise=>promise,
    saveDataDocument:async(...args)=>{calls.push(args);documents.set(args[1],args[2]);return{queued:true,companyId:'tenant-a'};},
    flushPendingFirebaseWriteNow:(...args)=>new Promise((resolve,reject)=>confirmations.push({args,resolve,reject})),
    setRawFinancials:next=>{rows=next(rows);publications.push(rows);}};
  env.requireSharedWriteConfirmation=actual('requireSharedWriteConfirmation',env);
  return{calls,confirmations,publications,documents,get rows(){return rows;},add:actual('addFinancialRecord',env),
    edit:actual('handleEditFinancialRecord',env),remove:actual('handleDeleteFinancialRecord',env)};
}
const tick=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
test('actual parent add/edit wait for the exact financial document confirmation instead of acknowledging a queue receipt',async()=>{
  for(const kind of ['add','edit']){const f=parentFixture();let settled=false;
    const save=kind==='add'?f.add(employee.id,'bonus',100000,'Checked','2026-11-20',{clientMutationId:'stable'}):f.edit('f-own',{amount:120000});
    save.then(()=>{settled=true;});await tick();assert.equal(settled,false);
    assert.deepEqual(f.confirmations[0].args.slice(0,2),['financials',kind==='add'?'f_stable':'f-own']);
    f.confirmations[0].resolve({confirmed:true,id:f.calls[0][1]});assert.equal((await save).confirmed,true);
  }
});
test('actual parent denies foreign or missing financial records and nonpositive/nonfinite amounts before writes',async()=>{
  const f=parentFixture();for(const amount of [0,-1,NaN,Infinity,-Infinity]){
    await assert.rejects(f.add(employee.id,'bonus',amount,'Invalid'));await assert.rejects(f.edit('f-own',{amount}));}
  await assert.rejects(f.add('foreign','bonus',100000,'Foreign'));
  for(const id of ['f-foreign','missing']){await assert.rejects(f.edit(id,{amount:100000}));await assert.rejects(f.remove(id));}
  assert.equal(f.calls.length,0);assert.equal(f.publications.length,0);
});
test('actual parent lost-ack retry keeps the same financial document ID and delete publishes only after ACK',async()=>{
  const f=parentFixture(),args=[employee.id,'bonus',100000,'Checked','2026-11-20',{clientMutationId:'same-intent'}];
  const first=f.add(...args);await tick();f.confirmations[0].reject(Error('offline acknowledgement'));
  await assert.rejects(first,{code:'firestore/sync-pending'});
  const retry=f.add(...args);await tick();assert.deepEqual(f.calls.map(call=>call[1]),['f_same-intent','f_same-intent']);
  assert.equal(f.documents.size,1);f.confirmations[1].resolve({confirmed:true});await retry;
  const removal=f.remove('f-own');await tick();assert.equal(f.publications.length,0);assert.equal(f.rows[0].isArchived,undefined);
  assert.deepEqual(f.confirmations[2].args.slice(0,2),['financials','f-own']);f.confirmations[2].resolve({confirmed:true});await removal;
  assert.equal(f.rows[0].isArchived,true);assert.equal(f.rows[1].isArchived,undefined);assert.equal(f.publications.length,1);
  const failed=parentFixture(),failedRemoval=failed.remove('f-own');await tick();
  const denied=Object.assign(Error('archive denied'),{code:'permission-denied'});
  failed.confirmations[0].reject(denied);await assert.rejects(failedRemoval,error=>error===denied);
  assert.equal(failed.publications.length,0);assert.equal(failed.rows[0].isArchived,undefined);
});
