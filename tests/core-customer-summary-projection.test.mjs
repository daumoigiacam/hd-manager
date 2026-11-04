import test from 'node:test';
import assert from 'node:assert/strict';
import { readApplicationSource } from '../scripts/helpers/application-source.cjs';
import { appFunction } from './helpers/app-source-function.mjs';
import baseline from './fixtures/customer-summary.baseline.mjs';
import { createProjectionCache, runCooperativeProjection } from '../src/services/cooperativeProjection.js';

const scope='CustomerCRMView',memo={scope,memoCallback:true};
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value)}return value};
function fixture(){
  const customers=Array.from({length:1001},(_,i)=>({id:'c'+i,name:'Synthetic '+i,empId:'employee-'+i%3,allowedDriverIds:['driver-a'],purchaseReconciliationEnabled:i%2===0}));
  const ledgers=Object.fromEntries(customers.map((customer,index)=>[customer.id,{totalRevenue:index+.1,totalPaid:index/2+.2,currentDebt:index/3,
    orders:[{id:'opening',date:'2026-10-01',isOpeningDebt:true,outstandingAmount:1},{id:'older',date:'2026-10-02',outstandingAmount:.3},{id:'recent',date:'2026-10-20',outstandingAmount:0}],
    payments:[{id:'pay-old',date:'2026-10-02'},{id:'pay-new',date:'2026-10-21'}],purchaseImports:[],hasPurchaseReconciliation:index%3===0,creditBalance:.4,purchaseDebt:.6}]));
  const employees=[{id:'employee-0',name:'Synthetic manager 0'},{id:'employee-1',name:'Synthetic manager 1'},{id:'driver-a',name:'Synthetic driver',delivery:true}];
  const bindings={customerLedgerIndex:freeze(ledgers),orders:[],payments:[],safeCustomerWarehouseImports:[],expenses:[],
    currentCompany:{id:'tenant-a'},customerPointLookup:new Map(),employees,
    buildCustomerReconciledLedger:()=>{throw Error('Must use the complete shared ledger')},
    calculateCustomerLoyaltySummary:({ledger})=>({currentPoints:Math.floor(ledger.totalPaid),eligibleAmount:ledger.totalPaid,redeemValue:3}),
    buildCustomerDebtLimitStatus:(_customer,ledger)=>({exceeded:ledger.currentDebt>100}),parseLooseMoneyValue:Number,
    getCustomerHonorific:customer=>customer.id.endsWith('0')?'Chị':'',getCustomerPlainName:customer=>customer.name,
    getCustomerDisplayName:customer=>customer.name,isEmployeeDeliveryParticipant:employee=>employee.delivery===true};
  const current=appFunction('buildCustomerSummary',bindings,memo);
  const old=new Function(...Object.keys(bindings),'return '+baseline.toString())(...Object.values(bindings));
  return {customers:freeze(customers),bindings,current,old};
}

test('cooperative directory preparation matches the frozen complete financial/history/loyalty summary for every customer',async()=>{
  const {customers,current,old}=fixture();
  const prepare=appFunction('prepareCustomerSummaries',{activeCustomers:customers,buildCustomerSummary:current,customerSummaryAttempt:0},memo);
  let turns=0;
  const result=await runCooperativeProjection(prepare,{yieldTask:async()=>{turns++},now:()=>0,budgetMs:4,maxOperations:11});
  assert.deepEqual(result,customers.map(old));assert.equal(result.length,1001);assert(turns>90);
  assert.equal(result[0].orders[0].id,'recent');assert.equal(result[0].payments[0].id,'pay-new');
  const aborted=new AbortController();let count=0;
  await assert.rejects(runCooperativeProjection(prepare,{signal:aborted.signal,yieldTask:async()=>{if(++count===3)aborted.abort()},maxOperations:5}),error=>error.name==='AbortError');
});

test('complete summary cache reuses only exact source identities and verified access scope',()=>{
  const {customers,bindings}=fixture();
  const cache=createProjectionCache(),values={privacyScope:'verified-a',customers,orders:[],payments:[],warehouseImports:[],expenses:[],customerPoints:[],employees:bindings.employees,
    customerLedgerIndex:bindings.customerLedgerIndex,currentCompany:bindings.currentCompany,customerSummaryScope:'actor-a:permission-v1',EMPTY_MAIN_LEDGER:Object.freeze({}),customerDirectorySummaryCache:cache};
  const entry=options=>appFunction('customerSummaryEntry',{...values,...options},memo)();
  const first=entry();first.complete=true;first.value=['synthetic-completed'];assert.equal(entry(),first);
  assert.notEqual(entry({customerSummaryScope:'actor-b:permission-v1'}),first);
  assert.notEqual(entry({customerSummaryScope:'actor-a:permission-v2'}),first);
  assert.notEqual(entry({payments:[{id:'new-payment'}]}),first);
  assert.notEqual(entry({customerLedgerIndex:{...values.customerLedgerIndex}}),first);
  assert.equal(entry({privacyScope:null}),null,'unverified standalone context cannot share directory cache');
});

test('retained readonly directory drops deleted/out-of-scope rows immediately and selected detail rebuilds from current allowed data',()=>{
  const old=[{id:'a',value:'old'},{id:'removed',value:'old'}],EMPTY_CUSTOMER_SUMMARIES=Object.freeze([]);
  const values={customerSummaryReady:false,customerSummaryProjection:{pending:true,error:null},completedCustomerSummaries:{current:{scope:'actor-a',value:old}},
    customerSummaryScope:'actor-a',activeCustomerIdSet:new Set(['a']),EMPTY_CUSTOMER_SUMMARIES};
  const summaries=options=>appFunction('customerSummaries',{...values,...options},memo)();
  assert.deepEqual(summaries(),[old[0]]);
  assert.equal(summaries({customerSummaryScope:'actor-b'}),EMPTY_CUSTOMER_SUMMARIES);
  assert.equal(summaries({customerSummaryProjection:{error:Error('failed')}}),EMPTY_CUSTOMER_SUMMARIES);
  const activeCustomers=[{id:'a',value:'new'}],details={selectedCustomerId:'a',activeCustomers,customerSummaryReady:false,customerSummaries:old,
    buildCustomerSummary:customer=>({...customer,builtFromCurrent:true})};
  const selected=options=>appFunction('selectedCustomerLive',{...details,...options},memo)();
  assert.deepEqual(selected(),{id:'a',value:'new',builtFromCurrent:true});
  assert.equal(selected({selectedCustomerId:'removed'}),null);
  const source=readApplicationSource();
  assert(source.includes('<CustomerCRMView key={dashboardPrivacyScope} privacyScope={dashboardPrivacyScope}'));
  assert(source.includes('aria-busy={customerSummaryProjection.pending}'));
  assert(source.includes('if (!customerDirectoryAvailable) return'));
});
