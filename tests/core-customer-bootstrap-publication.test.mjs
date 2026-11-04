import {bindScopedReadPublication} from '../src/services/scopedReadPublication.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parse} from '@babel/parser';
import {CUSTOMER_BOOTSTRAP_COMMIT_COLLECTIONS as names,prepareCustomerBootstrapPublication as prepare,isCustomerBootstrapCommitted as committed} from '../src/services/customerBootstrapPublication.js';
const scope={companyId:'company-a',customerId:'customer-a'};
const payload=()=>({company:{id:scope.companyId},customer:{id:scope.customerId,companyId:scope.companyId},products:[],rewardCatalog:[],promotions:[],customerAccount:{customerId:scope.customerId}});
test('actual customer catalogue reader and bootstrap publisher use the identical authenticated session scope',()=>{
 const source=readFileSync('src/App.jsx','utf8'),tree=parse(source,{sourceType:'module',plugins:['jsx']}),nodes={};
 function visit(n){if(!n||typeof n!=='object')return;if(n.type==='VariableDeclarator'&&['customerCatalogScope','bootstrapScope'].includes(n.id.name))nodes[n.id.name]=n.init;
  for(const [key,value]of Object.entries(n)){if(['loc','extra','comments'].includes(key))continue;if(Array.isArray(value))value.forEach(visit);else if(value?.type)visit(value);}}
 visit(tree);assert(nodes.customerCatalogScope);assert(nodes.bootstrapScope);
 const evaluate=(name,session)=>new Function('dataSessionId','firebaseUser','currentUser','tenantCompanyId','sessionCustomerId',`return (${source.slice(nodes[name].start,nodes[name].end)})`)(session,{uid:'u'},{accountType:'customer',companyId:'tenant',customerId:'customer'},'tenant','customer');
 for(const session of ['epoch-1','epoch-2'])assert.equal(evaluate('bootstrapScope',session),evaluate('customerCatalogScope',session));
 assert.notEqual(evaluate('bootstrapScope','epoch-1'),evaluate('customerCatalogScope','epoch-2'));
});
test('empty public catalogues are valid, but ready requires every exact committed reference',()=>{
 const expected=prepare(payload(),scope),states={...expected};
 assert.equal(committed(expected,states),true);
 for(const name of names){assert.equal(committed(expected,{...states,[name]:[]}),false,name);}
 assert.equal(committed(null,states),false);
 assert.equal(prepare({...payload(),customerAccount:null},scope).customer_accounts.length,0);
});
test('foreign identity, malformed or incomplete responses never yield a publishable catalogue',()=>{
 for(const value of [null,{}, {...payload(),company:{id:'foreign'}},
  {...payload(),customer:{id:'foreign',companyId:scope.companyId}},
  {...payload(),customer:{id:scope.customerId,companyId:'foreign'}},
  {...payload(),customerAccount:{customerId:'foreign'}},
  ...['products','rewardCatalog','promotions'].map(key=>({...payload(),[key]:null}))]){
  assert.throws(()=>prepare(value,scope),/đúng|đầy đủ/);
 }
 assert.throws(()=>prepare(payload(),{...scope,companyId:''}));
});
test('App publishes only validated references, replaces private company data, and ignores cancelled sessions',()=>{
 const source=readFileSync('src/App.jsx','utf8'),tree=parse(source,{sourceType:'module',plugins:['jsx']});let node;
 function visit(n){if(!n||typeof n!=='object')return;if(n.type==='VariableDeclarator'&&n.id.name==='applyCustomerBootstrap')node=n.init;
  for(const [key,v]of Object.entries(n)){if(['loc','extra','comments'].includes(key))continue;if(Array.isArray(v))v.forEach(visit);else if(v?.type)visit(v);}}
 visit(tree);assert(node);const events=[],refs={},witness={begin:name=>{events.push(['begin',name]);return 1},expectCommit:(name,generation,value)=>{refs[name]=value;events.push(['expect',name])},publicationScheduled:()=>events.push(['scheduled'])};
 let cancelled=false;const gate={current:null};
 const env={isReadAccessCurrent:()=>!cancelled,bindScopedReadPublication,get cancelled(){return cancelled},tenantCompanyId:scope.companyId,sessionCustomerId:scope.customerId,
  prepareCustomerBootstrapPublication:prepare,CUSTOMER_BOOTSTRAP_COMMIT_COLLECTIONS:names,customerBootstrapCommitRef:gate,
  bootstrapScope:'test-scope',publicationWitness:witness,setCustomerCatalogState:value=>events.push(['status',value]),setCurrentCompany:update=>events.push(['company',typeof update==='function'?update(undefined):update])};
 for(const [key,name]of Object.entries({setRawCompanies:'companies',setRawProducts:'products',setRawRewardCatalog:'reward_catalog',setRawPromotions:'promotions',setRawCustomers:'customers',setRawCustomerAccounts:'customer_accounts'}))env[key]=update=>events.push(['set',name,typeof update==='function'?update(undefined):update]);
 const make=()=>new Function(...Object.keys(env),`return (${source.slice(node.start,node.end)})`)(...Object.values(env));
 assert.throws(()=>make()({...payload(),products:null}));assert.equal(events.length,0);
 const response=payload();assert.equal(make()(response),true);assert.equal(events.some(e=>e[0]==='status'),false,'receipt is not a React commit');
 assert.equal(events.find(e=>e[0]==='company')[1],response.company,'replace; do not merge previous employee-only settings');
 for(const name of names){assert.equal(events.find(e=>e[0]==='set'&&e[1]===name)[2],refs[name]);}
 gate.current.complete();assert.equal(events.at(-1)[1].status,'ready');
 cancelled=true;const count=events.length;assert.equal(make()(response),false);assert.equal(events.length,count);
});
