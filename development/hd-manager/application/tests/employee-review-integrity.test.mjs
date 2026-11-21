import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {parse} from '@babel/parser';
import {transformSync} from 'esbuild';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {isEmployeeReviewEnabled} from '../src/utils/companyEmployeeReviews.js';
import {isRetryableWriteError} from '../src/utils/pendingWriteRetry.js';
import {hasCompanyRolePermissionAction} from '../src/features/payroll/payrollOriginalDomain.js';
import {applyEmployeePayrollPolicyForMonth} from '../src/utils/payrollPolicyHistory.js';
import * as automation from '../src/utils/employeeEvaluationAutomation.js';

const require=createRequire(import.meta.url);
const source=fs.readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
const tree=parse(source,{sourceType:'module',plugins:['jsx']}),declarations=new Map();
function collect(n) {
  if(!n||typeof n!=='object')return;
  if(n.type==='VariableDeclarator'&&n.id?.name)declarations.set(n.id.name,n.init);
  if(n.type==='FunctionDeclaration'&&n.id?.name)declarations.set(n.id.name,n);
  for(const[k,v]of Object.entries(n)) {
    if(['loc','comments','extra'].includes(k))continue;
    if(Array.isArray(v))v.forEach(collect);else if(v?.type)collect(v);
  }
}
collect(tree);
const actual=(name,env)=>{
  const n=declarations.get(name);assert.ok(n,name);
  return Function(...Object.keys(env),`return (${source.slice(n.start,n.end)});`)(...Object.values(env));
};
const today=()=> '2026-11-22',asText=value=>String(value??'');
const domainEnv={...automation,isEmployeeReviewEnabled,applyEmployeePayrollPolicyForMonth,
  getTodayString:today,getDateKeyFromAnyValue:value=>asText(value).slice(0,10),getEntityTimestamp:()=>0,
  calculateAttendanceTiming:()=>({lateMinutes:0}),resolveEmployeeShiftPolicy:()=>({}),
  parseLooseMoneyValue:Number,parseMinutesInput:Number,formatCurrency:asText};
// Execute the production scoring declarations without mounting App/Firebase.
const domainStart=source.indexOf('const EMPLOYEE_REVIEW_BONUS_BY_CRITERIA_STAR =');
const radar=declarations.get('EmployeeReviewRadarChart');
const domainNames=tree.program.body.filter(n=>n.type==='VariableDeclaration'&&n.start>=domainStart&&n.end<=radar.start)
  .flatMap(n=>n.declarations.map(d=>d.id.name));
const domain=Function(...Object.keys(domainEnv),`${source.slice(domainStart,radar.start)};return {${domainNames.join(',')}};`)(...Object.values(domainEnv));
const owner={id:'owner',companyId:'tenant-a',role:'owner',name:'Private reviewer',position:'Chủ doanh nghiệp'};
const target={id:'driver',companyId:'tenant-a',name:'Driver QA',position:'Tài xế'};
const foreign={id:'foreign',companyId:'tenant-b',name:'Foreign'};
const reviewDraft={targetEmployeeId:target.id,reviewerEmployeeId:owner.id,source:'peer',monthKey:'2026-11',
  date:today(),createdAt:'2026-11-22T01:02:03.000Z',criteriaScores:domain.buildDefaultEmployeeReviewCriteriaScores(4),reason:'Checked'};
const tick=async()=>{for(let i=0;i<10;i++)await Promise.resolve();};

function parentFixture() {
  const calls=[],confirmations=[],documents=new Map(),publications=[],notifications=[];
  let rows=[];
  const env={...domainEnv,...domain,firebaseUser:{uid:'auth-owner'},myCompanyId:'tenant-a',currentCompany:{id:'tenant-a'},
    currentUser:{...owner},appCurrentEmployee:owner,hasCompanyRolePermissionAction,
    readOwnerKey:'account-a',readOwnerRef:{current:'account-a'},activeTenantScopeRef:{current:'tenant-a'},
    rawEmployees:[owner,target,foreign],rawEmployeeReviews:rows,capitalizeFirst:asText,formatNumber:asText,
    withTimeout:promise=>promise,isRetryableWriteError,
    saveDataDocument:async(...args)=>{
      calls.push(args);documents.set(`${args[0]}/${args[1]}`,args[2]);
      return args[0]==='employeeReviews'?{queued:true,companyId:'tenant-a'}:undefined;
    },
    flushPendingFirebaseWriteNow:(...args)=>new Promise((resolve,reject)=>confirmations.push({args,resolve,reject})),
    rememberRecentLocalWrite(){},
    upsertLocalListRecord:(setter,row)=>setter(prev=>[...prev.filter(item=>item.id!==row.id),row]),
    setRawEmployeeReviews:update=>{rows=update(rows);env.rawEmployeeReviews=rows;publications.push(rows);},
    setRawNotifications:update=>{notifications.splice(0,notifications.length,...update(notifications));}};
  env.requireSharedWriteConfirmation=actual('requireSharedWriteConfirmation',env);
  return {env,calls,confirmations,documents,publications,notifications,get rows(){return rows;},
    add:data=>actual('handleAddEmployeeReview',env)(data)};
}

// Hook frames preserve real refs/state, effect cleanup and memo dependencies.
// The complete production view and radar JSX are compiled, not a recreated form.
function hooks() {
  const slots=[];let cursor=0,pending=[],dirty=false;
  const same=(a,b)=>a&&b&&a.length===b.length&&a.every((value,i)=>Object.is(value,b[i]));
  return {
    begin(){cursor=0;pending=[];dirty=false;},commit(){pending.forEach(effect=>effect());return dirty;},
    unmount(){slots.forEach(slot=>slot?.cleanup?.());},
    useState(initial){const i=cursor++;if(!slots[i])slots[i]={value:typeof initial==='function'?initial():initial};
      return[slots[i].value,next=>{const value=typeof next==='function'?next(slots[i].value):next;
        if(!Object.is(value,slots[i].value)){slots[i].value=value;dirty=true;}}];},
    useRef(initial){const i=cursor++;return slots[i]??(slots[i]={current:initial});},
    useMemo(calculate,deps){const i=cursor++;if(!slots[i]||!same(slots[i].deps,deps))slots[i]={value:calculate(),deps};return slots[i].value;},
    useEffect(effect,deps){const i=cursor++;if(!slots[i]||!same(slots[i].deps,deps)){
      const previous=slots[i];slots[i]={deps};pending.push(()=>{previous?.cleanup?.();slots[i].cleanup=effect();});}}
  };
}
const nodes=(node,predicate,out=[])=>{
  if(!node||typeof node!=='object')return out;
  if(predicate(node))out.push(node);
  React.Children.forEach(node.props?.children,child=>nodes(child,predicate,out));return out;
};
const text=node=>typeof node==='string'||typeof node==='number'?String(node):React.Children.toArray(node?.props?.children).map(text).join('');
const view=declarations.get('EmployeeReviewModuleView');
const lastReturn=view.body.body.findLast(n=>n.type==='ReturnStatement');
const capture='capture({handleSubmitPeerReview,handleEditReviewHistory});\n';
const componentCode=transformSync(source.slice(view.start,lastReturn.start)+capture+source.slice(lastReturn.start,view.end),
  {loader:'jsx',jsx:'automatic',format:'cjs'}).code;
const radarCode=transformSync(source.slice(radar.start,radar.end),{loader:'jsx',jsx:'automatic',format:'cjs'}).code;
function fixture(onSave=async()=>({success:true})) {
  const frame=hooks(),calls=[],f={};
  const env={...domainEnv,...domain,...frame,React,
    AccessDeniedView:()=>React.createElement('div',null,'Access denied'),LazyEmployeeReviewFeatureSettings:()=>null,
    formatMonthYearShortLabel:asText,formatDateTimeLabel:asText,getFriendlyFirebaseErrorMessage:error=>error.message,
    capture:api=>{f.api=api;}};
  const Radar=Function('require',...Object.keys(env),`${radarCode};return EmployeeReviewRadarChart;`)(require,...Object.values(env));
  const View=Function('require',...Object.keys(env),'EmployeeReviewRadarChart',`${componentCode};return EmployeeReviewModuleView;`)(require,...Object.values(env),Radar);
  f.props={currentEmployee:owner,currentCompany:{id:'tenant-a'},employees:[target,owner,foreign],employeeReviews:[],
    canViewEmployeeReviews:true,canCreateEmployeeReview:true,canViewAllEmployeeReviews:true,
    onAddEmployeeReview:async data=>{calls.push(data);return onSave(data);}};
  f.calls=calls;
  f.render=()=>{let again;let renders=0;do{assert.ok(renders++<12,'Effects settle');frame.begin();f.tree=View(f.props);again=frame.commit();}while(again);return f.tree;};
  f.reason=()=>nodes(f.tree,n=>n.type==='textarea')[0];
  f.input=value=>{f.reason().props.onChange({target:{value}});f.render();};
  f.button=()=>nodes(f.tree,n=>n.type==='button'&&/Gửi đánh giá|Lưu chỉnh sửa|Đang lưu đánh giá/.test(text(n)))[0];
  f.submit=()=>f.button().props.onClick();
  f.select=id=>{nodes(f.tree,n=>n.type==='select')[0].props.onChange({target:{value:id}});f.render();};
  f.month=value=>{nodes(f.tree,n=>n.type==='input'&&n.props.type==='month')[0].props.onChange({target:{value}});f.render();};
  f.score=(criteriaId,level)=>{
    const node=nodes(f.tree,n=>n.type===Radar)[0],radarTree=Radar(node.props);
    const criterion=node.props.criteriaList.find(item=>item.id===criteriaId);
    nodes(radarTree,n=>n.type==='circle'&&n.props['aria-label']===`${criterion.label}: ${level} sao`)[0].props.onClick();f.render();
  };
  f.unmount=()=>frame.unmount();
  f.render();return f;
}

test('actual view and parent preserve the self-review reason on business rejection, without writing or notifying',async()=>{
  const p=parentFixture(),f=fixture(p.add);f.select(owner.id);f.input('QA tự chấm phải bị chặn');
  f.score('commitment',4);await f.submit();f.render();
  assert.equal(f.reason().props.value,'QA tự chấm phải bị chặn');
  assert.match(renderToStaticMarkup(nodes(f.tree,n=>n.props.role==='status')[0]),/Không tự chấm chính mình/);
  assert.equal(f.button().props.disabled,false);assert.equal(p.calls.length,0);assert.equal(p.notifications.length,0);
});

test('actual view synchronously locks rapid submits, disables draft controls and retains false/queued/error drafts',async()=>{
  for(const outcome of [{success:false,message:'Business rejection'},{queued:true},Error('Save failed')]) {
    let finish;const f=fixture(()=>new Promise((resolve,reject)=>{finish=()=>outcome instanceof Error?reject(outcome):resolve(outcome);}));
    f.input('Keep this reason');f.score('commitment',5);
    const first=f.submit();await f.submit();assert.equal(f.calls.length,1,'Ref lock applies before any rerender');
    f.render();assert.equal(f.button().props.disabled,true);assert.equal(f.reason().props.disabled,true);
    assert.ok(nodes(f.tree,n=>n.type==='select'||(n.type==='input'&&n.props.type==='month')).every(n=>n.props.disabled));
    f.input('Cannot replace in-flight intent');assert.equal(f.reason().props.value,'Keep this reason');
    finish();await first;f.render();assert.equal(f.reason().props.value,'Keep this reason');
    assert.equal(f.calls[0].criteriaScores.commitment,5);assert.equal(f.button().props.disabled,false);
    assert.ok(nodes(f.tree,n=>n.props.role==='status').length);
  }
});

test('actual queued parent waits for the exact review ACK before draft clear, local publication, anonymous notification and success',async()=>{
  const p=parentFixture(),f=fixture(p.add);f.input('Private review reason');f.score('commitment',4);
  let settled=false;const pending=f.submit().then(()=>{settled=true;});await tick();f.render();
  const id=`er_${f.calls[0].clientMutationId}`;
  assert.equal(settled,false);assert.equal(f.reason().props.value,'Private review reason');
  assert.equal(p.publications.length,0);assert.equal(p.notifications.length,0);assert.equal(p.calls.length,1);
  assert.deepEqual(p.confirmations[0].args.slice(0,2),['employeeReviews',id]);assert.equal(p.confirmations[0].args[3],'tenant-a');
  p.confirmations[0].resolve({confirmed:true});await pending;f.render();
  assert.equal(f.reason().props.value,'');assert.equal(p.rows.length,1);assert.equal(p.rows[0].reviewerName,'Ẩn danh');
  assert.equal(p.notifications.length,1);assert.equal(p.notifications[0].id,`employee_review_${id}`);
  assert.doesNotMatch(JSON.stringify(p.notifications[0]),/Private reviewer|Private review reason/);
});

test('actual lost-ack retry reuses review ID, date and createdAt; confirmed new reviews in the same month remain separate intents',async()=>{
  const p=parentFixture(),f=fixture(p.add);f.input('Retry original');
  const first=f.submit();await tick();p.confirmations[0].reject(Error('offline acknowledgement'));await first;f.render();
  const original=structuredClone(f.calls[0]);assert.equal(f.reason().props.value,'Retry original');
  const retry=f.submit();await tick();assert.deepEqual(f.calls[1],original);
  assert.equal([...p.documents.keys()].filter(key=>key.startsWith('employeeReviews/')).length,1);
  p.confirmations[1].resolve({confirmed:true});await retry;f.render();
  f.input('Retry original');const next=f.submit();await tick();
  assert.notEqual(f.calls[2].clientMutationId,original.clientMutationId);
  p.confirmations[2].resolve({confirmed:true});await next;assert.equal(p.rows.length,2);
  assert.equal(p.rows[0].monthKey,p.rows[1].monthKey);assert.equal(p.rows[0].reviewerEmployeeId,p.rows[1].reviewerEmployeeId);
});

test('actual failed intent gets a new ID when its payload changes and an edit preserves its original ID and createdAt',async()=>{
  const f=fixture(async()=>({success:false,message:'Try again'}));f.input('First');await f.submit();f.render();
  f.input('Changed');await f.submit();assert.notEqual(f.calls[0].clientMutationId,f.calls[1].clientMutationId);
  const p=parentFixture(),saved={...reviewDraft,id:'er-existing',companyId:'tenant-a',source:'peer',rating:4};
  p.env.rawEmployeeReviews=[saved];const edit=fixture(p.add);edit.props.employeeReviews=[saved];edit.render();
  nodes(edit.tree,n=>n.type==='article')[0].props.onClick();edit.render();edit.input('Edited reason');
  const pending=edit.submit();await tick();assert.equal(p.calls[0][1],'er-existing');
  assert.equal(p.calls[0][2].createdAt,saved.createdAt);p.confirmations[0].resolve({confirmed:true});await pending;
});

test('actual history edits preserve customer/system source and original reviewer identity; parent rejects reclassification and new nonpeer sources',async()=>{
  for(const source of ['customer','system']) {
    const p=parentFixture(),saved={...reviewDraft,id:`er-${source}`,companyId:'tenant-a',source,rating:4,
      reviewerEmployeeId:source==='customer'?'':`original-${source}`,reviewerName:`Original ${source}`,isAnonymous:false,createdByEmpId:'original-author'};
    p.env.rawEmployeeReviews=[saved];const f=fixture(p.add);f.props.employeeReviews=[saved];f.render();
    nodes(f.tree,n=>n.type==='article')[0].props.onClick();f.render();f.input('Edited without reclassifying');
    const pending=f.submit();await tick();assert.equal(f.calls[0].source,source);
    assert.equal(f.calls[0].reviewerEmployeeId,saved.reviewerEmployeeId,'Empty customer reviewer must never become the editing owner');
    const payload=p.calls[0][2];assert.equal(payload.source,source);assert.equal(payload.isAnonymous,false);
    assert.equal(payload.reviewerEmployeeId,saved.reviewerEmployeeId);assert.equal(payload.reviewerName,saved.reviewerName);
    assert.equal(payload.createdByEmpId,saved.createdByEmpId);assert.equal(payload.createdAt,saved.createdAt);
    assert.equal(payload.updatedByEmpId,owner.id);
    p.confirmations[0].resolve({confirmed:true});await pending;
    const count=p.calls.length;
    assert.equal((await p.add({...saved,source:'peer',reviewerName:'Forged',reviewerEmployeeId:'forged'})).success,false);
    assert.equal(p.calls.length,count);
  }
  for(const source of ['customer','system','unknown']) {
    const p=parentFixture();assert.equal((await p.add({...reviewDraft,source})).success,false);assert.equal(p.calls.length,0);
  }
});

test('actual scope tokens reject stale handlers and late clears across account, company, target, month, permission and feature changes',async()=>{
  const changes=[f=>{f.props.currentEmployee={...owner,id:'new-account'};},
    f=>{f.props.currentCompany={id:'tenant-b'};},f=>{f.props.canCreateEmployeeReview=false;},
    f=>{f.props.currentCompany={id:'tenant-a',employeeReviewsEnabled:false};},
    f=>f.month('2026-10'),f=>f.select(owner.id)];
  for(const change of changes) {
    let resolve;const f=fixture(()=>new Promise(done=>{resolve=done;}));f.input('Old draft');const stale=f.api.handleSubmitPeerReview;
    change(f);f.render();await stale();assert.equal(f.calls.length,0,'Previous scope closure cannot submit');
    const g=fixture(()=>new Promise(done=>{resolve=done;}));g.input('Pending old draft');const pending=g.submit();
    if(change===changes[4]){g.props.employees=[owner];}else if(change===changes[5]){g.props.employees=[owner];}else change(g);
    g.render();if(g.reason()){g.input('Current scope draft');}
    resolve({success:true,message:'Old scope success'});await pending;g.render();
    if(g.reason())assert.equal(g.reason().props.value,'Current scope draft');
    assert.doesNotMatch(text(g.tree),/Old scope success/);
  }
  let finish;const unmounted=fixture(()=>new Promise(resolve=>{finish=resolve;}));unmounted.input('Unmounted');
  const pending=unmounted.submit();unmounted.unmount();finish({success:true});await pending;
});

test('actual parent rejects foreign, missing, self, feature-off, stale-account and ungranted writes before persistence',async()=>{
  const cases=[_p=>({...reviewDraft,targetEmployeeId:foreign.id}),_p=>({...reviewDraft,targetEmployeeId:'missing'}),
    _p=>({...reviewDraft,targetEmployeeId:owner.id}),p=>{p.env.currentCompany.employeeReviewsEnabled=false;return reviewDraft;},
    p=>{p.env.readOwnerRef.current='another-account';return reviewDraft;},
    p=>{p.env.activeTenantScopeRef.current='tenant-b';return reviewDraft;},
    p=>{p.env.currentUser={id:'staff',role:'employee'};p.env.appCurrentEmployee={id:'staff',position:'Tài xế'};
      p.env.currentCompany.employeeRolePermissions={staff:{employee_reviews:false,employees:false}};
      p.env.currentCompany.employeeRolePermissionActions={staff:{employee_reviews:{create_employee_review:false},employees:{create_employee_review:false}}};return reviewDraft;},
    _p=>({...reviewDraft,id:'foreign-review'}),_p=>({...reviewDraft,clientMutationId:'invalid/path'}),
    _p=>({...reviewDraft,companyId:'tenant-b'})];
  for(const [index,prepare] of cases.entries()){const p=parentFixture(),pending=p.add(prepare(p));
    assert.equal(p.calls.length,0,'Invalid scope must fail before persistence, case '+index);const result=await pending;
    assert.equal(result.success,false);assert.equal(p.calls.length,0);assert.equal(p.notifications.length,0);}
});

test('actual parent failures never notify, and late ACKs cannot publish into a different account or company',async()=>{
  for(const mode of ['failed-receipt','denied','new-account','new-company']) {
    const p=parentFixture();
    if(mode==='failed-receipt')p.env.saveDataDocument=async()=>({success:false,message:'Rejected'});
    const pending=p.add({...reviewDraft,clientMutationId:'stable'});await tick();
    if(mode==='failed-receipt')await assert.rejects(pending,/Rejected/);
    else if(mode==='denied'){
      p.confirmations[0].reject(Object.assign(Error('Denied'),{code:'permission-denied'}));await assert.rejects(pending,/Denied/);
    }else{
      if(mode==='new-account')p.env.readOwnerRef.current='new-account';else p.env.activeTenantScopeRef.current='tenant-b';
      p.confirmations[0].resolve({confirmed:true});assert.equal((await pending).success,false);
    }
    assert.equal(p.notifications.length,0);assert.equal(p.publications.length,0);
  }
});
