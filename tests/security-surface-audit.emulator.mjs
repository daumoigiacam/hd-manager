import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDocFromServer as getDoc } from 'firebase/firestore';
import {createHash} from 'node:crypto';

const projectId=process.env.HD_SYSTEM_LAB_PROJECT;
if(!projectId?.startsWith('demo-')||process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:9295')throw Error('Local demo emulator is mandatory.');
const deployed=process.env.HD_SECURITY_RULES_VARIANT==='deployed-snapshot';
if(process.env.HD_SECURITY_RULES_VARIANT&&!deployed)throw Error('Unsupported rules audit variant.');
const output='test-results/full-system-transformation-20261101/'+(deployed?'security-surface-deployed':'security-surface'),appId='synthetic-security';
const rules=await readFile(deployed?'test-results/full-system-transformation-20261101/deployed-rules/firestore.rules':'firestore.rules','utf8');
const rulesSha256=createHash('sha256').update(rules).digest('hex');
if(deployed){
 const metadata=JSON.parse(await readFile('test-results/full-system-transformation-20261101/deployed-rules/result.json','utf8'));
 if(metadata.project!=='hd-manager-c5839'||metadata.status!=='DEPLOYED_RULES_SOURCE_READ'||metadata.deployedSha256!==rulesSha256)throw Error('Unverified deployed rules snapshot.');
}
const environment=await initializeTestEnvironment({projectId,firestore:{host:'127.0.0.1',port:9295,rules}});
const root=`artifacts/${appId}/public/data`,findings=[];
let facts;
const attempt=async run=>{try{await run();return {allowed:true}}catch(error){return {allowed:false,code:error.code||error.name}}};
try {
  await environment.withSecurityRulesDisabled(async context=>{
    const db=context.firestore();
    await setDoc(doc(db,`${root}/companies/synthetic-a`),{companyId:'synthetic-a',rolePermissions:{sales:{finance:false}},
      employeeRolePermissions:{'synthetic-sales':{finance:false}}});
    await setDoc(doc(db,`${root}/employees/synthetic-sales`),{companyId:'synthetic-a',position:'Nhân viên kinh doanh',role:'employee'});
    await setDoc(doc(db,`${root}/expenses/synthetic-expense`),{companyId:'synthetic-a',amount:1000,type:'Synthetic security fixture'});
    await setDoc(doc(db,`${root}/expenses/foreign-expense`),{companyId:'synthetic-b',amount:1});
  });
  const claims={identityId:'synthetic-identity',appUserId:'synthetic-sales',companyId:'synthetic-a',accountType:'employee',role:'employee'};
  const sales=environment.authenticatedContext('synthetic-sales',claims).firestore();
  facts={explicitCompanyFinanceModuleGrant:false,explicitEmployeeFinanceModuleGrant:false,
    sameTenantExpenseRead:await attempt(()=>getDoc(doc(sales,`${root}/expenses/synthetic-expense`))),
    sameTenantExpenseCreate:await attempt(()=>setDoc(doc(sales,`${root}/expenses/synthetic-create`),{companyId:'synthetic-a',amount:1,type:'Synthetic fixture'})),
    foreignExpenseRead:await attempt(()=>getDoc(doc(sales,`${root}/expenses/foreign-expense`))),
    anonymousExpenseRead:await attempt(()=>getDoc(doc(environment.unauthenticatedContext().firestore(),`${root}/expenses/synthetic-expense`))),
  };
  assert.equal(facts.foreignExpenseRead.allowed,false);assert.equal(facts.anonymousExpenseRead.allowed,false);
  await environment.withSecurityRulesDisabled(context=>setDoc(doc(context.firestore(),`${root}/companies/synthetic-a`),{
    companyId:'synthetic-a',rolePermissions:{sales:{finance:true}},employeeRolePermissions:{'synthetic-sales':{finance:true}},
  }));
  facts.financeGrantedExpenseRead=await attempt(()=>getDoc(doc(sales,`${root}/expenses/synthetic-expense`)));
  facts.financeGrantedExpenseCreate=await attempt(()=>setDoc(doc(sales,`${root}/expenses/synthetic-positive-create`),{companyId:'synthetic-a',amount:1,type:'Synthetic positive control'}));
  facts.positiveControlSatisfied=facts.financeGrantedExpenseRead.allowed&&facts.financeGrantedExpenseCreate.allowed;
  if(facts.sameTenantExpenseRead.allowed||facts.sameTenantExpenseCreate.allowed)findings.push({id:'GENERIC_EMPLOYEE_FINANCE_GRANT_NOT_ENFORCED',severity:'HIGH',
    detail:`${deployed?'Downloaded deployed':'Current repository'} Firestore rules permit a generic same-tenant employee expense operation despite explicit company/employee finance module grants=false in the synthetic fixture. Client module visibility alone is not backend authorization.`,
    remediation:'Define collection/action/scope access contracts and align bounded queries/read models with rules, then verify all role CRUD before any approved deployment. Do not guess new business permissions or mutate real accounts.'});
} finally {
  await environment.cleanup();await mkdir(output,{recursive:true});
  await writeFile(output+'/result.json',JSON.stringify({at:new Date().toISOString(),productionTraffic:false,rulesSha256,environment:deployed?'ISOLATED_DOWNLOADED_DEPLOYED_RULES':'ISOLATED_CURRENT_REPOSITORY_RULES',
    status:findings.length?'OPEN_SECURITY_FINDING':facts?.positiveControlSatisfied?'NO_FINDING_IN_THIS_NARROW_PROBE':'INCONCLUSIVE_FIXTURE_SCOPE',facts,findings,
    scope:'Synthetic records and claims on demo emulator only. Downloaded deployed variant verifies the source hash; neither variant is a real-account exploit test or complete penetration test. Positive control must allow before denial can be treated as a valid narrow result. No production accounts, permissions or records changed.'},null,2));
}
console.log(JSON.stringify({securitySurfaceAuditCompleted:true,openFindings:findings.length,productionTraffic:false}));
