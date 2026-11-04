import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parse} from '@babel/parser';
import {PERSONAL_HOME_COLLECTIONS,getForegroundReadCollections,areHomeSourcesCommitted} from '../src/services/homeDataContract.js';
const source=readFileSync('src/App.jsx','utf8'),tree=parse(source,{sourceType:'module',plugins:['jsx']});
test('personal Home contract covers the actual data props without warehouse/product company history',()=>{
 const view=tree.program.body.find(n=>n.type==='FunctionDeclaration'&&n.id.name==='EmployeePersonalHomeView');
 const props=view.params[0].properties.map(p=>p.key.name);
 const metadata=new Set(['computedHome','employee','currentCompany','date','setActiveTab','record','notificationUnreadCount','onOpenNotifications','showDeliveryReportHome']);
 const expected=props.filter(name=>!metadata.has(name)&&name!=='employees').map(name=>name==='advanceRequests'?'advances':name);
 assert.deepEqual([...PERSONAL_HOME_COLLECTIONS].sort(),expected.sort());
 for(const heavy of ['warehouseImports','warehouseDispatches','products','payrollPeriods'])assert(!PERSONAL_HOME_COLLECTIONS.includes(heavy));
 const byTab={home:Object.freeze(['company-report-source']),orders:Object.freeze(['orders'])};
 assert.equal(getForegroundReadCollections('home',{companyHome:false,byTab}),PERSONAL_HOME_COLLECTIONS);
 assert.equal(getForegroundReadCollections('home',{companyHome:true,byTab}),byTab.home);
 assert.equal(getForegroundReadCollections('orders',{companyHome:false,byTab}),byTab.orders);
 assert.deepEqual(getForegroundReadCollections('unknown',{companyHome:false,byTab}),[]);
 assert.match(source,/const canUseCompanyHomeDashboard = usesCompanyHomeDashboard\(employee,currentUser\)/);
 assert.match(source,/companyHome:usesCompanyHomeDashboard\(homeSourceEmployee,currentUser\)/);
});
test('empty datasets need real same-tenant source confirmations; the core identity gate remains required',()=>{
 const collections=PERSONAL_HOME_COLLECTIONS,state={tenantId:'company-a',collections:Object.fromEntries(['companies','employees',...collections].map(n=>[n,true]))};
 assert.equal(areHomeSourcesCommitted({tenantId:'company-a',state,collections}),true);
 assert.equal(areHomeSourcesCommitted({tenantId:'company-b',state,collections}),false);
 assert.equal(areHomeSourcesCommitted({tenantId:'',state,collections}),false);
 for(const name of ['companies','employees',...collections]){
  const pending={...state,collections:{...state.collections,[name]:false}};
  assert.equal(areHomeSourcesCommitted({tenantId:'company-a',state:pending,collections}),false,name);
 }
 assert.equal(areHomeSourcesCommitted({tenantId:'company-a',state:{...state,collections:{}},collections}),false);
});
