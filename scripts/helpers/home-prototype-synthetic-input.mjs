import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import {extractEmployeeHomeDomain} from './employee-home-domain-extraction.mjs';
import {COMPANY_HOME_PRIMARY_COLLECTIONS} from '../../src/services/homeDataContract.js';
import {assertVerificationFixtureReady} from './verification-fixture-preflight.mjs';

// Prototype only. Fixed loopback endpoint and demo project; never accepts an
// environment-selected project, production credentials or business export.
const base='http://127.0.0.1:8185/v1/projects/demo-hdm-perf-verification/databases/(default)/documents';
async function request(action,body){
 const response=await fetch(base+action,{method:'POST',headers:{Authorization:'Bearer owner','Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(30000)});
 if(!response.ok)throw Error('Fictional source request failed: '+response.status+' '+await response.text());
 return response.json();
}
function value(field){
 if('stringValue'in field)return field.stringValue;
 if('integerValue'in field)return Number(field.integerValue);
 if('doubleValue'in field)return field.doubleValue;
 if('booleanValue'in field)return field.booleanValue;
 if('nullValue'in field)return null;
 if('timestampValue'in field)return field.timestampValue;
 if('arrayValue'in field)return(field.arrayValue.values||[]).map(value);
 if('mapValue'in field)return Object.fromEntries(Object.entries(field.mapValue.fields||{}).map(([k,v])=>[k,value(v)]));
 throw Error('Unsupported fictional field type');
}
export async function loadSyntheticHomeInput(outputDirectory){
 const fixture=await assertVerificationFixtureReady();
 const started=performance.now(),transaction=(await request(':beginTransaction',{options:{readOnly:{}}})).transaction;
 if(!transaction)throw Error('Consistent source transaction missing');
 const data={},sourceMetadata={};
 try{
  // All source queries share one read-only transaction. A source mutation must
  // not create a mixed financial snapshot during the prototype build.
  for(const collection of ['companies','employees',...COMPANY_HOME_PRIMARY_COLLECTIONS]){
   const records=await request('/artifacts/verification-fixture/public/data:runQuery',{transaction,structuredQuery:{from:[{collectionId:collection}],where:{fieldFilter:{field:{fieldPath:collection==='companies'?'id':'companyId'},op:'EQUAL',value:{stringValue:'phase2-fictional'}}},orderBy:[{field:{fieldPath:'__name__'},direction:'ASCENDING'}]}});
   data[collection]=records.filter(row=>row.document).map(row=>({...Object.fromEntries(Object.entries(row.document.fields||{}).map(([k,v])=>[k,value(v)])),id:row.document.name.split('/').at(-1)}));
   sourceMetadata[collection]={count:data[collection].length,readTimes:[...new Set(records.map(row=>row.readTime).filter(Boolean))]};
  }
 }finally{await request(':rollback',{transaction})}
 const sourceReadMs=performance.now()-started;
 if(data.orders.length!==2000||data.customers.length!==1000||data.payments.length!==2000||data.companies.length!==1)throw Error('Unexpected fictional workload');
 const source=await fs.readFile('src/App.jsx','utf8');
 const extracted=extractEmployeeHomeDomain(source,path.resolve('src'),['buildDashboardPayrollCostSteps','buildCustomerReconciledLedgerMap','isCashflowOfficial','resolveCashflowDateKey']);
 const bundled=await build({stdin:{contents:extracted,resolveDir:path.resolve('src')},bundle:true,write:false,platform:'node',format:'esm',target:'node22'});
 await fs.mkdir(outputDirectory,{recursive:true});
 const moduleFile=path.resolve(outputDirectory,'existing-home-domain.mjs');await fs.writeFile(moduleFile,bundled.outputFiles[0].text);
 const domain=await import('file:///'+moduleFile.replaceAll('\\','/'));
 const now=new Date(),company=data.companies[0],expenses=data.expenses.filter(domain.isCashflowOfficial),payments=data.payments.filter(domain.isCashflowOfficial);
 // Match the existing Root attendance binding, which revives these two ISO
 // fields to Date before salary calculation. Raw REST strings are not the
 // application's salary input contract and must not be benchmarked as parity.
 const attendance=Object.fromEntries(data.attendance.map(row=>[row.id,{...row,checkIn:row.checkIn?new Date(row.checkIn):null,checkOut:row.checkOut?new Date(row.checkOut):null}]));
 const input={...data,now,company,expenses,payments,attendance,performance:Object.fromEntries(data.performance.map(row=>[row.id,row])),lockedPayroll:{},attendanceLoaded:true,complaintsLoaded:true};
 const buildStart=performance.now(),steps=domain.buildDashboardPayrollCostSteps(input);let payroll;
 for(;;){const row=steps.next();if(row.done){payroll=row.value;break}}
 const ledger=domain.buildCustomerReconciledLedgerMap(input.customers,input.orders,payments,input.warehouseImports,expenses);
 input.payrollCosts=payroll;
 input.debtLedger=input.customers.filter(c=>!c.isArchived).map(c=>({id:c.id,name:c.name,debt:ledger[c.id]?.currentDebt||0}));
 input.cashExpenseRecords=expenses.map(row=>({...row,date:domain.resolveCashflowDateKey(row)}));
 if(data.payrollPeriods.some(period=>['locked','finalized','closed'].includes(period.status)))throw Error('Locked payroll snapshots require their own complete reader; refuse fabricated zero fallback');
 return{input,sourceMetadata,sourceReadMs,domainComputeMs:performance.now()-buildStart,fixture,sourceRevision:createHash('sha256').update(JSON.stringify(data)).digest('hex'),domainSourceSha256:createHash('sha256').update(extracted).digest('hex')};
}
