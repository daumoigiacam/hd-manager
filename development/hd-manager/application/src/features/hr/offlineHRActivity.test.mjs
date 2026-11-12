import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {parse} from '@babel/parser';
import traverseModule from '@babel/traverse';
import * as model from './offlineHRModel.js';
import * as attendanceModel from './offlineAttendanceEditorModel.js';
import {businessDayKey} from '../../utils/businessDate.js';

// Execute the real component hook/effect bodies and existing Back hook. Only
// JSX returns become inspection objects; no DOM, bundler, build or native app.
const code=readFileSync(new URL('./OfflineHRWorkspace.jsx',import.meta.url),'utf8');
const ast=parse(code,{sourceType:'module',plugins:['jsx']});
const traverse=traverseModule.default||traverseModule;
function componentCode(name,inspection){
  let target;
  traverse(ast,{FunctionDeclaration(path){if(path.node.id?.name===name)target=path;}});
  assert(target);
  const replacements=[];
  target.traverse({ReturnStatement(path){
    if(path.getFunctionParent()===target&&path.get('argument').isJSXElement()){
      replacements.push({start:path.node.start,end:path.node.end,text:`return {${inspection}};`});path.skip();
    }
  }});
  let output=code.slice(target.node.start,target.node.end);
  for(const edit of replacements.sort((a,b)=>b.start-a.start))output=output.slice(0,edit.start-target.node.start)+edit.text+output.slice(edit.end-target.node.start);
  return output;
}
const workspaceCode=componentCode('OfflineHRWorkspace','source,filters,selected,page,rows,head,denied,loading,identity,change,setSource,setSelected,setReload,load,closeDetail,attendanceDraft,activeDraft,setAttendanceDraft,openAttendance,submitAttendance,refreshAttendance');
const detailCode=componentCode('HRDetail','state,identity,result,row,ready,denied');
const backCode=readFileSync(new URL('../../hooks/useAppScreenBack.js',import.meta.url),'utf8')
  .replace(/^import[^;]+;/,'').replace('export function','function');

function hooks(program,name,initialProps){
  const slots=[],listeners=new Set();let index=0,dirty=true,reattach=false,effects=[],view,props=initialProps;
  const useState=initial=>{
    const slot=index++;
    if(!slots[slot])slots[slot]={value:typeof initial==='function'?initial():initial};
    return [slots[slot].value,value=>{
      const next=typeof value==='function'?value(slots[slot].value):value;
      if(!Object.is(next,slots[slot].value)){slots[slot].value=next;dirty=true;}
    }];
  };
  const useRef=initial=>{const slot=index++;return slots[slot]||=( {current:initial} );};
  const useEffect=(effect,deps)=>{
    const slot=index++,old=slots[slot];
    const changed=reattach||!old||deps.some((value,n)=>!Object.is(value,old.deps[n]));
    slots[slot]={...old,deps};
    if(changed)effects.push(()=>{old?.cleanup?.();slots[slot].cleanup=effect();});
  };
  const window={addEventListener(name,handler){assert.equal(name,'hd-manager-screen-back');listeners.add(handler);},
    removeEventListener(_name,handler){listeners.delete(handler);}};
  const component=vm.runInNewContext(backCode+'\n'+program+`\n${name};`,{...model,...attendanceModel,businessDayKey,useState,useRef,useEffect,window});
  return {
    async settle(){
      for(let n=0;n<12;n++){
        if(dirty){dirty=false;index=0;effects=[];view=component(props);reattach=false;for(const effect of effects)effect();}
        await new Promise(resolve=>setImmediate(resolve));
      }
      return view;
    },
    get view(){return view;},get listeners(){return listeners.size;},
    setProps(next){props={...props,...next};dirty=true;},
    hide(){for(const slot of slots){slot.cleanup?.();slot.cleanup=undefined;}},
    show(){reattach=true;dirty=true;},
    back(){const event={detail:{},defaultPrevented:false,preventDefault(){this.defaultPrevented=true;}};for(const handler of listeners)handler(event);return event;},
  };
}
function fixture(){
  const scope={tenantId:'tenant',principalId:'principal',permissionRevision:'r1',sessionId:'s1'};
  const cp={...scope,generation:'g1',seq:7,capturedAt:1,dayKey:'2026-11-09',sourceProfile:'legacy-v1'};
  let current=true,pageCalls=0,lookupCalls=0;const runtimeListeners=new Set();
  const runtime={scope,subscribe(listener){runtimeListeners.add(listener);return()=>runtimeListeners.delete(listener);},isCurrent:()=>current,expiresAtMs:Date.now()+3600000,capabilities:['home.read','home.payroll.read'],
    appSession:{currentUser:{id:'e1',firebaseUid:scope.principalId,companyId:scope.tenantId},currentCompany:{id:scope.tenantId}}};
  const result=(source,id='e1')=>({items:[{id,document:{companyId:scope.tenantId,name:'Hồng',employeeId:id},state:'SERVER_CONFIRMED'}],
    hasMore:true,nextCursor:'next-page',metadata:{source,checkpoint:cp,serverConfirmedOnly:true,financialCalculationAllowed:false,
      timeZone:'Asia/Ho_Chi_Minh',projection:'bounded-directory-scalars-v1'}});
  const directory={
    async page(source,options){pageCalls++;const page=result(source,options.cursor?'e2':'e1');if(options.cursor){page.hasMore=false;page.nextCursor=null;}return page;},
    async lookup(source,ids){lookupCalls++;return {...result(source,ids[0]),hasMore:false,nextCursor:null};},
  };
  const navigations=[];
  const props={runtime,directory,onNavigate:route=>navigations.push(route),initialSource:'employees'};
  return {props,runtime,directory,cp,navigations,close:()=>{current=false;},
    get pageCalls(){return pageCalls;},get lookupCalls(){return lookupCalls;},get runtimeSubscribers(){return runtimeListeners.size;},emit(topic){for(const listener of runtimeListeners)listener(topic);},
    workspace:()=>hooks(workspaceCode,'OfflineHRWorkspace',props),
    detail:selected=>hooks(detailCode,'HRDetail',{runtime,directory,selected,onClose(){},onEmployee(){}})};
}

test('30 Activity detach/reattach cycles retain typed filters, selected detail and completed rows without page refetch',async()=>{
  const f=fixture(),h=f.workspace();await h.settle();
  h.view.change('text','bản nháp tìm kiếm Hồng');h.view.change('employeeId','e1');await h.settle();
  h.view.setSelected({source:'employees',id:'e1',checkpoint:h.view.head});await h.settle();
  const {filters,selected,page,rows}=h.view,calls=f.pageCalls;
  for(let n=0;n<30;n++){
    h.hide();assert.equal(h.listeners,0);h.show();await h.settle();
    assert.equal(h.view.filters,filters);assert.equal(h.view.selected,selected);
    assert.equal(h.view.page,page);assert.equal(h.view.rows,rows);assert.equal(h.listeners,1);
  }
  assert.equal(f.pageCalls,calls);assert.equal(h.view.filters.text,'bản nháp tìm kiếm Hồng');
});

test('completed exact detail remains intact through 30 Activity effect reattachments without lookup refetch',async()=>{
  const f=fixture(),selected={source:'employees',id:'e1',checkpoint:f.cp},h=f.detail(selected);
  await h.settle();const result=h.view.result,state=h.view.state;
  assert(result);assert.equal(f.lookupCalls,1);
  for(let n=0;n<30;n++){h.hide();h.show();await h.settle();assert.equal(h.view.result,result);assert.equal(h.view.state,state);}
  assert.equal(f.lookupCalls,1);
});

test('source choice, next page and cursor survive reattach instead of resetting to initialSource',async()=>{
  const f=fixture(),h=f.workspace();await h.settle();
  h.view.setSource('attendance');await h.settle();
  await h.view.load(h.view.page.nextCursor,2,h.view.head);await h.settle();
  const page=h.view.page,calls=f.pageCalls;
  h.hide();h.show();await h.settle();
  assert.equal(h.view.source,'attendance');assert.equal(h.view.page,page);assert.equal(h.view.page.number,2);
  assert.equal(h.view.rows[0].id,'e2');assert.equal(f.pageCalls,calls);
});

test('the existing Back hook closes detail first, leaves list navigation to main, and owns one removable listener',async()=>{
  const f=fixture(),h=f.workspace();await h.settle();
  assert.equal(h.listeners,1);assert.equal(h.back().defaultPrevented,false);
  h.view.setSelected({source:'employees',id:'e1',checkpoint:h.view.head});await h.settle();
  const page=h.view.page,event=h.back();
  assert.equal(event.defaultPrevented,true);assert.equal(event.detail.handled,true);await h.settle();
  assert.equal(h.view.selected,null);assert.equal(h.view.page,page);assert.equal(h.back().defaultPrevented,false);
  assert.equal(f.navigations.length,0);
  h.hide();assert.equal(h.listeners,0);h.show();await h.settle();assert.equal(h.listeners,1);
});

test('changed query, explicit reload and a genuinely changed initialSource still fetch; closed runtime hides retained rows',async()=>{
  const f=fixture(),h=f.workspace();await h.settle();let calls=f.pageCalls;
  h.view.change('text','mới');await h.settle();assert.equal(f.pageCalls,++calls);
  h.view.setReload(value=>value+1);await h.settle();assert.equal(f.pageCalls,++calls);
  h.setProps({initialSource:'attendance'});await h.settle();assert.equal(h.view.source,'attendance');assert.equal(f.pageCalls,++calls);
  f.close();h.hide();h.show();await h.settle();
  assert(h.view.denied);assert.equal(h.view.rows.length,0);assert.equal(f.pageCalls,calls);
});

test('attendance form draft and locally submitted intent survive Activity reattachment and Back keeps the draft',async()=>{
  const f=fixture(),h=f.workspace();let requests=0,receiptState=null;
  const repository={protocol:'offline-attendance-v1',employeeId:'e1',async request(){requests++;return {commandId:'intent1',state:'PENDING_SYNC',localDurable:true,serverConfirmed:false};},
    async command(){return receiptState;},async page(){return [];}};
  f.runtime.capabilities.push('attendance.check_in','attendance.check_out');
  h.setProps({attendanceRepository:repository});await h.settle();
  h.view.setSource('attendance');await h.settle();
  h.view.openAttendance('attendance.check_in');await h.settle();
  h.view.setAttendanceDraft(previous=>({...previous,workDate:'2026-10-04',workRole:'Kinh doanh'}));await h.settle();
  const draft=h.view.attendanceDraft,rows=h.view.rows,calls=f.pageCalls;
  for(let n=0;n<30;n++){h.hide();h.show();await h.settle();assert.equal(h.view.attendanceDraft,draft);assert.equal(h.view.rows,rows);}
  assert.equal(h.back().defaultPrevented,true);await h.settle();assert.equal(h.view.attendanceDraft.open,false);assert.equal(h.view.attendanceDraft.workRole,'Kinh doanh');
  h.view.openAttendance('attendance.check_in');await h.settle();await h.view.submitAttendance();await h.settle();
  assert.equal(requests,1);assert.equal(h.view.attendanceDraft.commandId,'intent1');assert.match(h.view.attendanceDraft.message,/chờ máy chủ/);
  const submitted=h.view.attendanceDraft;h.hide();h.show();await h.settle();assert.equal(h.view.attendanceDraft,submitted);
  assert.equal(f.pageCalls,calls);assert.equal(requests,1);
  receiptState={commandId:'intent1',state:'SYNCED',receipt:{outcome:'accepted'}};
  await h.view.refreshAttendance();await h.settle();h.view.openAttendance('attendance.check_out');await h.settle();
  assert.equal(h.view.attendanceDraft.kind,'attendance.check_out');assert.equal(h.view.attendanceDraft.commandId,null);
  assert.equal(f.pageCalls,calls);
});

test('one scoped receipt subscription refreshes status without replacing input and cleans up on Activity hide',async()=>{
 const f=fixture(),h=f.workspace();let row=null;
 const repository={protocol:'offline-attendance-v1',employeeId:'e1',request:async()=>({commandId:'same-intent',state:'PENDING_SYNC',localDurable:true}),command:async()=>row,page:async()=>[]};
 f.runtime.capabilities.push('attendance.check_in','attendance.check_out');h.setProps({attendanceRepository:repository});await h.settle();h.view.setSource('attendance');h.view.openAttendance('attendance.check_in');await h.settle();h.view.setAttendanceDraft(p=>({...p,workRole:'Kinh doanh đã chọn'}));await h.settle();await h.view.submitAttendance();await h.settle();assert.equal(f.runtimeSubscribers,1);
 row={commandId:'same-intent',state:'SYNCED',receipt:{outcome:'accepted'}};f.emit('attendance');await h.settle();assert.equal(h.view.attendanceDraft.row.state,'SYNCED');assert.equal(h.view.attendanceDraft.workRole,'Kinh doanh đã chọn');
 for(let i=0;i<30;i++){h.hide();assert.equal(f.runtimeSubscribers,0);h.show();await h.settle();assert.equal(f.runtimeSubscribers,1);}h.hide();assert.equal(f.runtimeSubscribers,0);
});
