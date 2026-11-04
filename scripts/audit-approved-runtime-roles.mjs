import fs from 'node:fs/promises';
import {connectAndroidWebView} from './helpers/android-webview-cdp.mjs';
const output=process.env.HD_SYSTEM_AUDIT_OUTPUT||'test-results/full-system-transformation-20261101';
const adb=process.env.HD_ADB||'D:/HD-DEV/android/sdk/platform-tools/adb.exe';
const c=await connectAndroidWebView({adb,serial:'emulator-5554',packageName:'com.hdmanager.app.acceptance',enableRuntime:false});
try{
 const result=await c.evaluate(`(function(){
 var main=document.querySelector('main[data-hd-module]'),key=main&&Object.keys(main).find(function(k){return k.indexOf('__reactFiber$')===0}),fiber=key&&main[key],props=null;
 for(var f=fiber,d=0;f&&d<100;f=f.return,d++){var p=f.memoizedProps;if(p&&p.currentUser&&p.currentCompany&&Array.isArray(p.employees)){props=p;break}}
 if(!props)return {found:false,loginVisible:!!document.querySelector('input[type="tel"]')};
 var standard=['owner','business_owner','company_owner','super_admin','admin','manager','employee','customer','sales','accountant','accounting','purchasing','warehouse','driver','delivery','production','staff'];
 function role(value){var s=String(value||'').trim().toLowerCase();return !s?'UNSET':standard.indexOf(s)>=0?s:'OTHER_CUSTOM'}
 function group(value){var s=String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').toLowerCase();
 if(/ke toan|account/.test(s))return 'accounting';if(/tai xe|lai xe|driver/.test(s))return 'driver';if(/giao hang|delivery/.test(s))return 'delivery';
 if(/kinh doanh|ban hang|sales/.test(s))return 'sales';if(/mua hang|purchas/.test(s))return 'purchasing';if(/kho|warehouse/.test(s))return 'warehouse';
 if(/giam doc|chu so huu|chu doanh nghiep|owner|quan tri|admin|manager/.test(s))return 'management';return 'OTHER_OR_UNSET'}
 var companyId=props.currentCompany.id||props.currentUser.companyId,counts={},scoped=0,foreign=0,unscoped=0,archived=0,directory=null;
 for(var ancestor=fiber,depth=0;ancestor&&depth<100;ancestor=ancestor.return,depth++){
  for(var hook=ancestor.memoizedState,index=0;hook&&index<1000;hook=hook.next,index++){
   var state=hook.memoizedState,value=state&&state.current;
   if(value&&Array.isArray(value.employees)&&Array.isArray(value.companies)
     &&Object.prototype.hasOwnProperty.call(value,'warehouseStockCounts')&&Object.prototype.hasOwnProperty.call(value,'pricingScenarios'))directory=value.employees;
  }
 }
 var observed=directory||props.employees;
 observed.forEach(function(employee){if(!employee.companyId){unscoped++;return;}if(employee.companyId!==companyId){foreign++;return;}scoped++;if(employee.isArchived)archived++;
 var key=role(employee.role)+'|'+group(employee.position||employee.department);counts[key]=(counts[key]||0)+1;});
 return {found:true,currentAccount:{accountType:role(props.currentUser.accountType),role:role(props.currentUser.role)},
 directoryCoverage:directory?'COMMITTED_EMPLOYEE_DIRECTORY':'VISIBLE_PROPS_SUBSET',authAccountCoverage:'NOT_AUTH_IDENTITY_DIRECTORY',
 directoryServerConfirmed:!!(props.serverConfirmedCollectionState&&props.serverConfirmedCollectionState.tenantId===companyId&&props.serverConfirmedCollectionState.collections.employees===true),
 visibleEmployeeRecordsObserved:props.employees.length,employeeRecordsObserved:observed.length,scopedEmployeeRecords:scoped,foreignRecordsOmitted:foreign,unscopedRecordsOmitted:unscoped,archivedRecords:archived,
 roleDistribution:Object.keys(counts).sort().map(function(key){var parts=key.split('|');return {role:parts[0],positionGroup:parts[1],count:counts[key]}}),module:main.getAttribute('data-hd-module')};
 })()`);
 const device={android:c.shell('shell','getprop','ro.build.version.release'),api:c.shell('shell','getprop','ro.build.version.sdk'),abi:c.shell('shell','getprop','ro.product.cpu.abi'),cpuCount:Number(c.shell('shell','getconf','_NPROCESSORS_ONLN')),
  memoryTotalKb:Number(/MemTotal:\s*(\d+)/.exec(c.shell('shell','cat','/proc/meminfo'))?.[1])||null};
 const report={at:new Date(),device,result,scope:'Read-only aggregate role inventory of the already-approved, authenticated Acceptance app memory. A matched raw-state commit ref is distinguished from the filtered visible employee props; neither is an Auth/Identity account listing or proof those directory rows have active login accounts. No login of other accounts, password/PIN/role changes, record IDs, names, phone numbers, tokens or document values exported. Unknown/custom role strings are grouped, not invented. Missing company records are omitted from tenant counts. This inventory is not proof that other role logins/CRUD were tested.'};
 await fs.mkdir(output,{recursive:true});await fs.writeFile(output+'/approved-runtime-roles.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{c.close()}
