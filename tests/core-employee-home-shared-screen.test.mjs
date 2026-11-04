import test from 'node:test';import assert from 'node:assert/strict';import path from 'node:path';
import {readFileSync} from 'node:fs';import {parse} from '@babel/parser';import traverseModule from '@babel/traverse';
import {build} from 'esbuild';import {chromium} from 'playwright-core';import {chromiumLaunchOptions} from './helpers/chromium-launch-options.mjs';
import {extractEmployeeHomeDomain} from '../scripts/helpers/employee-home-domain-extraction.mjs';
import {originalPersonalHomeComponent} from './fixtures/employee-personal-home-before-screen.mjs';
const source=readFileSync('src/App.jsx','utf8'),tree=parse(source,{sourceType:'module',plugins:['jsx']}),traverse=traverseModule.default;
const names=['EmployeePersonalHomeView','EmployeePersonalHomeScreen'],nodes=tree.program.body.filter(n=>n.type==='FunctionDeclaration'&&names.includes(n.id.name));
const stubs=['AccountGreeting','EmployeeHomeStatCard','EmployeeHomeQuickRow','Star','Bell','TrendingUp','Receipt','Download'];
const ignored=new Set([...names,...stubs,'useMemo','useRef','useState','useEffect']);const roots=new Set();let program;
traverse(tree,{Program(p){program=p},FunctionDeclaration(p){if(!names.includes(p.node.id?.name))return;
 p.traverse({ReferencedIdentifier(q){const b=q.scope.getBinding(q.node.name);if(b?.scope===program.scope&&!ignored.has(q.node.name))roots.add(q.node.name)}});p.skip()}});
const domain=extractEmployeeHomeDomain(source,path.resolve('src'),[...roots]);

test('shared compact Home screen matches the pre-refactor DOM and actions across roles, dates, attendance, payroll, assets and delivery',{timeout:60000},async()=>{
 const contents=`import React,{useMemo,useRef,useState,useEffect}from'react';import{createRoot}from'react-dom/client';
 ${domain}
 const Icon=()=> <svg data-fixture-icon/>;const Star=Icon,Bell=Icon,TrendingUp=Icon,Receipt=Icon,Download=Icon;
 const AccountGreeting=({name,companyName})=><p>{name} {companyName}</p>;
 const EmployeeHomeStatCard=({label,value,tone})=><p data-tone={tone}>{label} {value}</p>;
 const EmployeeHomeQuickRow=({label,value,tone,secondary})=><p data-tone={tone}>{label} {value} {secondary}</p>;
 ${originalPersonalHomeComponent.replace('function EmployeePersonalHomeView(','function OriginalPersonalHomeView(')}
 ${nodes.map(n=>source.slice(n.start,n.end)).join('\n')}
 window.renderFixture=async(position,date,hasAttendance)=>{
  const employee={id:'employee-a',companyId:'company-a',name:'Synthetic employee',position,basicSalary:6200000,startDate:'2025-01-01',salaryDaysMode:'actual_calendar_days'};
  const input={employee,employees:[employee],currentCompany:{name:'Synthetic company'},date,attendance:hasAttendance?{[date+'_employee-a']:{id:'attendance-a',empId:employee.id,date,status:'present',checkIn:new Date(date+'T01:00:00Z'),checkOut:new Date(date+'T10:00:00Z')}}:{},
   financials:[{id:'bonus',empId:employee.id,type:'bonus',date,amount:500000}],performance:{},customers:[],orders:[],payments:[],holidays:[],employeeReviews:[],advanceRequests:[],
   deliveryReports:Array.from({length:12},(_,i)=>({id:'report-'+i,empId:employee.id,date:date.slice(0,8)+String(i+1).padStart(2,'0'),collectedAmount:i*1234,deliveryExpenseAmount:i*25})),
   assets:Array.from({length:5},(_,i)=>({id:'asset-'+i,name:'Synthetic truck '+i,assignedEmployeeId:employee.id,status:'active'})),
   assetCostLogs:[],expenses:[{id:'expense',assetId:'asset-4',amount:1000000,date}],notificationUnreadCount:12};
  window.actions=[];input.setActiveTab=tab=>window.actions.push(tab);input.onOpenNotifications=()=>window.actions.push('notifications');
  const originalRoot=createRoot(document.getElementById('before')),newRoot=createRoot(document.getElementById('after'));
  originalRoot.render(<OriginalPersonalHomeView {...input}/>);newRoot.render(<EmployeePersonalHomeView {...input}/>);
  const deadline=performance.now()+5000;
  while(!document.querySelector('#before .hd-staff-greeting-surface')||!document.querySelector('#after .hd-staff-greeting-surface')){
   if(performance.now()>deadline)throw Error('Both actual React roots must commit before DOM parity comparison');await new Promise(r=>setTimeout(r,10));
  }
  const before=document.getElementById('before').innerHTML,after=document.getElementById('after').innerHTML,equal=before===after;
  const difference=equal?null:(()=>{let at=0;while(at<before.length&&before[at]===after[at])at++;return {at,before:before.slice(Math.max(0,at-80),at+200),after:after.slice(Math.max(0,at-80),at+200)}})();
  for(const button of document.querySelectorAll('#after button'))if(!/PDF/.test(button.textContent))button.click();
  const result={equal,difference,actions:window.actions.slice(),text:document.getElementById('after').textContent};originalRoot.unmount();newRoot.unmount();return result;
 };
 window.testCommit=async()=>{
  const model={version:1,monthKey:'2026-11',positionLabel:'Nhân viên',reviewStars:null,salary:{netSalary:123,workDays:1,salesRevenue:0,rows:[]},sales:{show:false,orderCount:0,customerCount:0},
   assets:{show:false,count:0,monthCost:0,latest:null,rows:[]},attendance:{status:'Chưa chấm',tone:'rose',shiftLabel:'Synthetic shift',in:{value:'-',source:'',tone:'bad'},out:{value:'-',source:'',tone:'warn'},lateMinutes:0,autoOvertimeMinutes:0},delivery:{income:0,expense:0,reportCount:0,rows:[]}};
  const publication={model},root=createRoot(document.getElementById('after'));let commits=0,connected=false;
  root.render(<EmployeePersonalHomeScreen model={model} employee={{name:'Synthetic'}} date="2026-11-02" publication={publication} onModelCommit={v=>{commits++;connected=v===publication&&!!document.querySelector('#after .hd-staff-greeting-surface')}}/>);
  await new Promise(r=>setTimeout(r,80));const result={commits,connected};root.unmount();return result;
 };`;
 const bundle=await build({stdin:{contents,loader:'jsx',resolveDir:path.resolve('src')},bundle:true,write:false,jsx:'automatic',format:'iife',define:{'process.env.NODE_ENV':'"production"'}});
 const browser=await chromium.launch(chromiumLaunchOptions());try{
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',route=>route.abort());
  await page.setContent('<div id="before"></div><div id="after"></div>');await page.addScriptTag({content:bundle.outputFiles[0].text});
  for(const role of ['Kinh doanh','Tài xế','Sản xuất','Nhân viên'])for(const date of ['2026-10-03','2026-11-01'])for(const attendance of [false,true]){
   const result=await page.evaluate(args=>window.renderFixture(...args),[role,date,attendance]);assert.equal(result.equal,true,role+'/'+date+'/'+attendance+' '+JSON.stringify(result.difference));
   for(const action of ['profile','employee_reviews','notifications','asset_management','company_attendance','payroll','delivery_reports'])assert(result.actions.includes(action),action);
   assert.match(result.text,/5 tài sản/,'bounded display rows preserve total asset count');
  }
  assert.deepEqual(await page.evaluate(()=>window.testCommit()),{commits:1,connected:true});assert.deepEqual(errors,[]);
 }finally{await browser.close()}
});
