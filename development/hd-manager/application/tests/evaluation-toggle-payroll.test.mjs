import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parse} from '@babel/parser';
import {projectEvaluationSummaryToPayroll,applyEvaluationBonusToSalaryDetails} from '../src/utils/payrollEvaluationBonus.js';
import {payrollCalculationInput,payrollRows,PAYROLL_INPUT_SOURCES} from '../src/features/payroll/offlinePayrollProtocol.js';
import {createPayrollEmployeeSnapshot,mapPayrollSnapshotsToRows} from '../src/utils/payrollPeriodLock.js';
import projector from '../../../../functions/generated/offlineOriginalDomain.cjs';

export function fixture(enabled=true,tenant='qa-a') {
 const sources=Object.fromEntries(PAYROLL_INPUT_SOURCES.map(key=>[key,[]]));
 sources.companies=[{id:tenant,companyId:tenant,employeeReviewsEnabled:enabled}];
 sources.employees=['one','two'].map(id=>({id,companyId:tenant,name:'QA '+id,position:'Kế toán & nhân sự',basicSalary:6000000}));
 sources.attendance=sources.employees.flatMap(emp=>['2026-10-16','2026-11-16'].map(date=>({id:date+'_'+emp.id,companyId:tenant,empId:emp.id,date,status:'present',lateMinutes:0})));
 return sources;
}
const rows=(sources,month='2026-11')=>payrollRows(payrollCalculationInput(sources,sources.companies[0].id,month));

test('disabled company ignores a complete evaluation before adding it to salary',()=>{
 const summary={employeeId:'one',monthKey:'2026-11',system:{workDays:1},stars:4};
 const base={grossSalary:6000000,netSalary:5000000,commission:1000000};
 const original=structuredClone({summary,base});
 const enabled=projectEvaluationSummaryToPayroll(summary,{employeeId:'one',monthKey:'2026-11'});
 const disabled=projectEvaluationSummaryToPayroll(summary,{employeeId:'one',monthKey:'2026-11',company:{employeeReviewsEnabled:false}});
 assert.equal(enabled.bonus,800000);assert.equal(disabled.status,'disabled');assert.equal(disabled.hasEvaluation,false);
 const salary=applyEvaluationBonusToSalaryDetails(base,disabled);
 assert.equal(salary.evaluationBonus,0);assert.equal(salary.grossSalary,6000000);assert.equal(salary.netSalary,5000000);assert.equal(salary.commission,1000000);
 assert.deepEqual({summary,base},original);
});

test('actual payroll projection removes exactly 800,000 VND per employee and month; reenabling adds it once',()=>{
 for(const month of ['2026-10','2026-11']){
  const enabled=fixture(true),disabled=fixture(false),before=structuredClone(disabled);
  const on=rows(enabled,month),off=rows(disabled,month),again=rows(enabled,month);
  for(let index=0;index<2;index++){
   assert.equal(on[index].details.evaluationBonus,800000);assert.equal(off[index].details.evaluationBonus,0);
   assert.equal(on[index].details.grossSalary-off[index].details.grossSalary,800000);
   assert.equal(on[index].details.netSalary-off[index].details.netSalary,800000);
   assert.equal(off[index].details.evaluationResult.status,'disabled');
   for(const key of ['baseSalaryCalc','commission','totalBonus','totalAdvance','badDebt'])assert.equal(off[index].details[key],on[index].details[key],key);
  }
  assert.deepEqual(again,on);assert.deepEqual(disabled,before);
 }
});

test('company settings are scoped by tenant and do not affect another company payroll',()=>{
 const a=fixture(false,'qa-a'),b=fixture(true,'qa-b');
 assert.equal(rows(a)[0].details.evaluationBonus,0);assert.equal(rows(b)[0].details.evaluationBonus,800000);
 assert.throws(()=>payrollCalculationInput(a,'qa-b','2026-11'));
});

test('negative salary updates ending debt by the removed bonus without changing advances or deductions',()=>{
 const enabled=fixture(true);enabled.financials=[{id:'qa-advance',companyId:'qa-a',empId:'one',type:'advance',amount:2000000,date:'2026-11-16'}];
 const disabled=structuredClone(enabled);disabled.companies[0].employeeReviewsEnabled=false;
 const on=rows(enabled)[0].details,off=rows(disabled)[0].details;
 assert.equal(on.endingDebt,1000000);assert.equal(off.endingDebt,1800000);
 assert.equal(off.netSalary,0);assert.equal(off.deductionTotal,on.deductionTotal);assert.equal(off.totalAdvance,on.totalAdvance);
});

test('locked snapshot remains financially identical after evaluation is disabled',()=>{
 const enabled=rows(fixture(true))[0];
 const snapshot=createPayrollEmployeeSnapshot({companyId:'qa-a',monthKey:'2026-11',employee:enabled.emp,salaryDetails:enabled.details,lockedAt:'2026-11-30T17:00:00Z',lockedByEmployeeId:'owner'});
 const original=structuredClone(snapshot);
 rows(fixture(false));
 const stored=mapPayrollSnapshotsToRows([snapshot])[0];
 assert.equal(stored.details.evaluationBonus,800000);assert.equal(stored.details.netSalary,enabled.details.netSalary);
 assert.deepEqual(snapshot,original);
});

test('Web and native payroll execute the same canonical company-aware projection',()=>{
 const source=name=>fs.readFileSync(new URL(name,import.meta.url),'utf8');
 const declaration=text=>{const tree=parse(text,{sourceType:'module',plugins:['jsx']});for(const node of tree.program.body)if(node.type==='VariableDeclaration')for(const d of node.declarations)if(d.id.name==='buildPayrollViewProjectionSteps')return text.slice(d.init.start,d.init.end).replaceAll('\r\n','\n');throw Error('Missing live projection');};
 assert.equal(declaration(source('../src/App.jsx')),declaration(source('../src/features/payroll/payrollOriginalDomain.js')));
});

test('canonical server Home payroll costs agree with disabled client payroll',()=>{
 const project=enabled=>{const data=fixture(enabled);const sources=Object.fromEntries(projector.HOME_FEED_SOURCES.map(key=>[key,data[key]||[]]));return projector.projectCompanyHome({sources,tenantId:'qa-a',asOfDay:'2026-11-16'});};
 const on=project(true),off=project(false);
 assert.equal(on.snapshot.finance.expenseToday-off.snapshot.finance.expenseToday,1600000);
 assert.equal(off.snapshot.finance.profitToday-on.snapshot.finance.profitToday,1600000);
});
