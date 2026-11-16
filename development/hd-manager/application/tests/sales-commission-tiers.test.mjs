import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {normalizeSalesCommissionTiers,commissionTiersFromDraft,commissionTiersToDraft,salesCommissionBreakdown,preserveCommissionPolicyFields,MAX_COMMISSION_TIERS} from '../src/utils/salesCommissionTiers.js';
import {buildEmployeePayrollPolicyUpdate,applyEmployeePayrollPolicyForMonth,captureEmployeePayrollPolicy} from '../src/utils/payrollPolicyHistory.js';
import {createPayrollEmployeeSnapshot} from '../src/utils/payrollPeriodLock.js';
const tier={minExcessRevenue:500_000_000,rate:0.02},employee={id:'sales-test',companyId:'tenant-test',position:'Kinh doanh',startDate:'2026-01-01',basicSalary:5000000,commissionRate:0.015,targetRevenue:500_000_000};
const round=value=>Math.round(value*100)/100;
const source=fs.readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
const domain=fs.readFileSync(new URL('../src/features/payroll/payrollOriginalDomain.js',import.meta.url),'utf8');
const actual=text=>{const raw=text.match(/const calculateDirectSalesCommission = ([\s\S]*?\n});/);assert(raw);return Function('roundMoneyValue','calculateCommission','salesCommissionBreakdown','return ('+raw[1]+')')(round,(revenue,target,rate)=>Math.max(0,(revenue||0)-(target||0))*(rate||0),salesCommissionBreakdown)};
const calculators=[actual(source),actual(domain)];

test('the selected highest tier applies to the whole excess, not progressively or to all revenue',()=>{
 for(const calc of calculators){
  const configured={...employee,commissionTiers:[tier]};
  assert.equal(calc(configured,600_000_000),1_500_000);
  assert.equal(calc(configured,1_000_000_000),10_000_000);
  assert.equal(calc(configured,1_100_000_000),12_000_000);
  assert.equal(calc(configured,500_000_000),0);assert.equal(calc(configured,499_000_000),0);
  assert.equal(calc(configured,999_999_999),round(499_999_999*0.015));
  assert.equal(calc({...configured,commissionTiers:[tier,{minExcessRevenue:700_000_000,rate:0.03}]},1_300_000_000),24_000_000);
 }
});
test('legacy employees retain exactly the old commission result and zero base can start earning at a configured tier',()=>{
 for(let n=0;n<1000;n++)for(const calc of calculators){const e={...employee,targetRevenue:n*100000,commissionRate:(n%17)/1000},revenue=n*100111+0.25;assert.equal(calc(e,revenue),round(Math.max(0,revenue-e.targetRevenue)*e.commissionRate));assert.equal(calc({...e,commissionTiers:[]},revenue),calc(e,revenue));}
 assert.equal(calculators[0]({...employee,commissionRate:0,commissionTiers:[tier]},1e9),10e6);
});
test('draft percent is converted once, ordered thresholds are canonical and caller arrays are never changed',()=>{
 const input=[{minExcessRevenue:700000000,ratePercent:'2,5'},{minExcessRevenue:500000000,ratePercent:'2'}];
 const before=JSON.stringify(input),normalized=commissionTiersFromDraft(input,0.015);assert.equal(JSON.stringify(input),before);
 assert.deepEqual(normalized,[tier,{minExcessRevenue:700000000,rate:0.025}]);
 assert.deepEqual(commissionTiersFromDraft(commissionTiersToDraft(normalized),0.015),normalized);
 assert.equal(salesCommissionBreakdown(1e9,500e6,0.015,normalized).matchedThreshold,500e6);
});
test('invalid or ambiguous thresholds/rates fail validation before a payroll write',()=>{
 for(const tiers of [[tier,tier],[{...tier,minExcessRevenue:0}],[{...tier,minExcessRevenue:-1}],[{...tier,minExcessRevenue:0.5}],[{...tier,minExcessRevenue:Number.MAX_SAFE_INTEGER+1}],[{...tier,rate:1.01}],[{...tier,rate:NaN}],[{...tier,rate:0.01}],[tier,{minExcessRevenue:700e6,rate:0.019}],Array.from({length:MAX_COMMISSION_TIERS+1},(_,n)=>({minExcessRevenue:n+1,rate:0.02}))])assert.throws(()=>normalizeSalesCommissionTiers(tiers,0.015));
 for(const text of ['','2x','Infinity','-1'])assert.throws(()=>commissionTiersFromDraft([{minExcessRevenue:500e6,ratePercent:text}],0.015));
});
test('a new effective policy never backfills tiers into a legacy month, and locked snapshots retain their original arrays and amounts',()=>{
 const seeded={...employee,...buildEmployeePayrollPolicyUpdate({employee:null,nextEmployee:employee,effectiveFrom:'2026-01-01',changedAt:'2026-01-01T00:00:00Z'})};
 const next={...seeded,commissionTiers:[{...tier}]};Object.assign(next,buildEmployeePayrollPolicyUpdate({employee:seeded,nextEmployee:next,effectiveFrom:'2026-11-01',changedAt:'2026-11-01T00:00:00Z'}));
 const october=applyEmployeePayrollPolicyForMonth(next,'2026-10'),november=applyEmployeePayrollPolicyForMonth(next,'2026-11');
 assert.deepEqual(october.commissionTiers,[]);assert.equal(calculators[0](october,1e9),7_500_000);assert.equal(calculators[0](november,1e9),10_000_000);
 const snapshot=createPayrollEmployeeSnapshot({companyId:'tenant-test',monthKey:'2026-11',employee:november,salaryDetails:{monthKey:'2026-11',workDays:30,baseSalaryCalc:5000000,commission:10000000,grossSalary:15000000,netSalary:15000000,endingDebt:0},lockedAt:'2026-12-01T00:00:00Z',lockedByEmployeeId:'owner-test'});
 const before=JSON.stringify(snapshot);november.commissionTiers[0].rate=0.05;next.commissionTiers[0].rate=0.06;
 assert.equal(JSON.stringify(snapshot),before);assert.equal(snapshot.salaryDetails.commission,10_000_000);assert.equal(snapshot.policySnapshot.values.commissionTiers[0].rate,0.02);
 assert(!Object.hasOwn(captureEmployeePayrollPolicy(employee),'commissionTiers'));
});
test('an editor without salary rights preserves policy fields and their absence exactly',()=>{
 const attempted={name:'Updated contact',commissionTiers:[tier],commissionRate:0.99,payrollPolicies:[{bad:true}],salaryPolicyHistory:[]};
 const protectedPayload=preserveCommissionPolicyFields(attempted,employee);assert.equal(protectedPayload.name,'Updated contact');assert.equal(protectedPayload.commissionRate,0.015);assert(!Object.hasOwn(protectedPayload,'commissionTiers'));assert(!Object.hasOwn(protectedPayload,'payrollPolicies'));
 const configured={...employee,commissionTiers:[tier]};assert.strictEqual(preserveCommissionPolicyFields({},configured).commissionTiers,configured.commissionTiers);
});
test('the actual editor validates before saving, uses existing salary permission and effective-date history, and both calculators share one helper',()=>{
 const editor=fs.readFileSync(new URL('../src/features/legacy/EmployeeView.jsx',import.meta.url),'utf8');
 assert.match(editor,/CommissionTierEditor[\s\S]*?disabled=\{!canManageSalaryPolicy\}/);assert.match(editor,/commissionTiersFromDraft\(empData.commissionTiers/);
 assert(editor.indexOf('commissionTiersFromDraft(empData.commissionTiers')<editor.indexOf('const result = editingEmp ? await onEditEmployee'));
 assert.match(editor,/preserveCommissionPolicyFields\(pData,editingEmp\)/);assert.match(editor,/effectiveFrom: empData.salaryPolicyEffectiveFrom/);
 for(const text of[source,domain])assert.match(text,/import \{salesCommissionBreakdown\} from .*salesCommissionTiers.js/);
});

test('the actual form submit persists canonical tiers and policy history, rejects invalid drafts and preserves a protected policy',async()=>{
 const editor=fs.readFileSync(new URL('../src/features/legacy/EmployeeView.jsx',import.meta.url),'utf8');
 const declaration=editor.slice(editor.indexOf('  const handleSubmit = '),editor.indexOf('  const handleUseCurrentAttendanceLocation = '));
 const body=declaration.replace(/^\s*const handleSubmit = /,'').trim().replace(/;$/,'');
 const submit=async(rows,allowed=true)=>{
  let saved=null;const messages=[];
  const dependencies={editingEmp:employee,canEditEmployee:true,canCreateEmployee:true,
   empData:{...employee,name:'Commission configuration test',commissionRate:'1.5',commissionTiers:rows,salaryPolicyEffectiveFrom:'2026-11-01',secondaryPositions:[]},
   normalizeEmployeePosition:value=>value,normalizeEmployeePositionList:value=>value||[],isOwnerPosition:()=>false,
   isSalesPosition:value=>value==='Kinh doanh',isSalesCollaboratorPosition:()=>false,canEditEmployeeSalaryPolicy:allowed,
   commissionTiersFromDraft,parseCommissionPercentInput:value=>Number(String(value).replace(',','.'))/100,setEmployeeStatus:value=>messages.push(value),
   normalizeEmployeeRoleSalaryComponents:value=>value||[],normalizeAttendanceFixedLocation:()=>null,parseCustomerLocationInput:()=>null,isVpsMode:false,
   getPositionShiftDefaults:()=>({shiftName:'Test shift',shiftStart:'08:00',shiftEnd:'17:00'}),normalizeTimeInputValue:value=>value,
   companyDepartmentById:new Map(),normalizeLatePenaltyTiers:()=>[],isOvernightShiftRange:()=>false,parseMinutesInput:()=>0,
   DEFAULT_ATTENDANCE_LOCATION_RADIUS_METERS:100,normalizeEmployeeDocuments:()=>[],canEditEmployeeShiftPolicy:true,canAssignSalesLeader:true,
   canEditEmployeeLatePenaltyPolicy:true,canEditEmployeeEarlyOvertimePolicy:true,buildEmployeePayrollPolicyUpdate,currentEmployee:{id:'owner-test'},
   preserveCommissionPolicyFields,employeeSaveInFlightRef:{current:false},setIsSavingEmployee:()=>{},employeeCreateRequestIdRef:{current:'test-only'},
   onEditEmployee:async(id,payload)=>{assert.equal(id,employee.id);saved=payload;return{success:true}},onAddEmployee:()=>{throw Error('Unexpected create')},
   setShowForm:()=>{},getFriendlyFirebaseErrorMessage:error=>error.message};
  await Function(...Object.keys(dependencies),'return ('+body+')')(...Object.values(dependencies))({preventDefault(){}});
  return {saved,messages};
 };
 const valid=await submit([{minExcessRevenue:'500000000',ratePercent:'2'}]);
 assert.deepEqual(valid.saved?.commissionTiers,[tier]);
 assert.deepEqual(applyEmployeePayrollPolicyForMonth(valid.saved,'2026-11').commissionTiers,[tier]);
 assert.deepEqual(applyEmployeePayrollPolicyForMonth(valid.saved,'2026-10').commissionTiers,[]);
 const invalid=await submit([{minExcessRevenue:'500000000',ratePercent:'2'},{minExcessRevenue:'500000000',ratePercent:'3'}]);
 assert.equal(invalid.saved,null);assert.match(invalid.messages.join(' '),/trùng/);
 const contactOnly=await submit([{minExcessRevenue:'500000000',ratePercent:'99'}],false);
 assert(contactOnly.saved);assert.equal(contactOnly.saved.commissionRate,employee.commissionRate);
 assert(!Object.hasOwn(contactOnly.saved,'commissionTiers'));assert(!Object.hasOwn(contactOnly.saved,'payrollPolicies'));
});
