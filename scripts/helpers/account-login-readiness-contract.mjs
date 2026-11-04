import {parse} from '@babel/parser';
import {PERSONAL_HOME_COLLECTIONS} from '../../src/services/homeDataContract.js';
import {CUSTOMER_BOOTSTRAP_COMMIT_COLLECTIONS} from '../../src/services/customerBootstrapPublication.js';

export function resolveAccountLoginReadinessContract(source,account) {
 if(!['employee','customer'].includes(account))throw new TypeError('Unknown login account kind.');
 const tree=parse(source,{sourceType:'module',plugins:['jsx']});
 const declarations=new Map();
 function visit(node){
  if(!node||typeof node!=='object')return;
  if(node.type==='VariableDeclarator'&&node.id?.type==='Identifier')declarations.set(node.id.name,node.init);
  for(const [key,value]of Object.entries(node)){
   if(['loc','comments','extra','tokens'].includes(key))continue;
   if(Array.isArray(value))value.forEach(visit);else if(value?.type)visit(value);
  }
 }
 visit(tree);
 const foreground=declarations.get('FOREGROUND_REALTIME_COLLECTIONS_BY_TAB')?.arguments?.[0];
 const route=foreground?.properties.find(p=>(p.key.name||p.key.value)===(account==='customer'?'customer_home':'home'));
 if(route?.value.type!=='ArrayExpression'||route.value.elements.some(n=>n.type!=='StringLiteral'))throw Error('Dynamic/unrecognized foreground source plan.');
 const requested=route.value.elements.map(n=>n.value);
 if(account==='employee'){
  const personal=source.includes('companyHome:usesCompanyHomeDashboard(homeSourceEmployee,currentUser)')
   &&source.includes("getForegroundReadCollections('home',{")&&source.includes('homeReadinessCollections={homeReadinessCollections}');
  const required=personal?[...new Set(['companies','employees',...PERSONAL_HOME_COLLECTIONS])]:requested;
  return {requested,required,excluded:[],origin:personal?'actual-personal-Home-input-contract':'legacy-company-Home-input-contract'};
 }
 const owned=declarations.get('customerOwnedCollections')?.arguments?.[0];
 if(owned?.type!=='ArrayExpression'||owned.elements.some(n=>n.type!=='StringLiteral'))throw Error('Dynamic/unrecognized customer-owned source plan.');
 const ownedNames=new Set(owned.elements.map(n=>n.value));
 const baseline=declarations.get('baselineRealtimeCollectionNames')?.consequent;
 if(baseline?.type!=='ArrayExpression'||baseline.elements.some(n=>n.type!=='StringLiteral'))throw Error('Unrecognized customer baseline sources.');
 const baselineNames=baseline.elements.map(n=>n.value);
 const bootstrap=declarations.get('applyCustomerBootstrap');let published=[];
 function findPublished(node){
  if(!node||typeof node!=='object')return;
  if(node.type==='CallExpression'&&node.callee?.type==='MemberExpression'&&node.callee.property.name==='forEach'
    &&node.arguments[0]?.name==='markCollectionServerConfirmed'&&node.callee.object.type==='ArrayExpression'){
   if(node.callee.object.elements.some(n=>n.type!=='StringLiteral'))throw Error('Dynamic bootstrap witness plan.');
   published=node.callee.object.elements.map(n=>n.value);
  }
  if(node.type==='CallExpression'&&node.callee?.type==='MemberExpression'&&node.callee.property.name==='forEach'
    &&node.callee.object.name==='CUSTOMER_BOOTSTRAP_COMMIT_COLLECTIONS'){
   if(!source.includes('publicationWitness.expectCommit(name,generation,expected[name])')
      ||!source.includes('isCustomerBootstrapCommitted(bootstrap.expected,committed)'))throw Error('Unrecognized customer bootstrap commit boundary.');
   published=[...CUSTOMER_BOOTSTRAP_COMMIT_COLLECTIONS];
  }
  for(const [key,value]of Object.entries(node)){
   if(['loc','comments','extra','tokens'].includes(key))continue;
   if(Array.isArray(value))value.forEach(findPublished);else if(value?.type)findPublished(value);
  }
 }
 findPublished(bootstrap);
 if(!published.includes('companies')||!published.includes('products'))throw Error('Unrecognized customer bootstrap witnesses.');
 const supported=new Set([...ownedNames,...published]);
 return {requested,required:[...new Set([...published,...baselineNames,...requested.filter(name=>supported.has(name))])],
  excluded:requested.filter(name=>!supported.has(name)).map(collection=>({collection,reason:'No customer-owned listener or customer bootstrap publication in current App. Not a request to read private employee configuration.'}))};
}
