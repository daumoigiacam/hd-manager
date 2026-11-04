import {readFile,mkdir,writeFile} from 'node:fs/promises';import path from 'node:path';import {createHash} from 'node:crypto';import {build} from 'esbuild';
import {extractEmployeeHomeScreenModel} from './helpers/employee-home-model-extraction.mjs';import {connectAndroidWebView} from './helpers/android-webview-cdp.mjs';
const candidate=process.env.HD_ACCEPTANCE_CANDIDATE_OUTPUT;if(!candidate)throw Error('Verified candidate required');
const output=path.join(candidate,'compact-model-client-input-parity'),source=await readFile('src/App.jsx','utf8');
const roots=['withSalesRevenueIndex','calculateMonthRevenue','isCashflowOfficial','resolveAttendanceAnomalyForDate','formatCurrency','formatNumber',
 'parseLooseMoneyValue','getAssetDisplayLabel','getAssetStatusLabel','formatShiftRangeLabel','formatAttendanceMomentForWorkDate','getAttendanceCompactSource'];
const extracted=extractEmployeeHomeScreenModel(source,path.resolve('src'),roots);
const bundle=await build({stdin:{contents:extracted.code+`\nimport {buildEmployeeHomeSnapshotInput} from './services/employeeHomeSnapshotInput.js';import {buildEmployeeHomeScreenDto} from './services/employeeHomeScreenDto.js';
 export {buildEmployeeHomeSnapshotInput,buildEmployeeHomeScreenDto};`,resolveDir:path.resolve('src')},bundle:true,write:false,platform:'browser',format:'iife',globalName:'homeReadModelDomain',target:'chrome74'});
const c=await connectAndroidWebView({adb:'D:/HD-DEV/android/sdk/platform-tools/adb.exe',serial:'emulator-5554',packageName:'com.hdmanager.app.acceptance',enableRuntime:false});let result;
try{
 const button=await c.evaluate(`(function(){var b=Array.from(document.querySelectorAll('[data-hd-navigation="bottom"] button')).find(function(b){return (b.getAttribute('aria-label')||b.innerText).trim()==='Trang chủ'});if(!b||!document.hasFocus()||document.visibilityState!=='visible')throw Error('Focused Home navigation required');b.scrollIntoView({block:'center'});var r=b.getBoundingClientRect();return {x:(r.x+r.width/2)*devicePixelRatio,y:(r.y+r.height/2)*devicePixelRatio}})()`);
 c.shell('shell','input','tap',String(Math.round(button.x)),String(Math.round(button.y)));
 const deadline=Date.now()+60000;
 while(!await c.evaluate(`(function(){var m=document.querySelector('main[data-hd-module="home"]');return !!m&&!!m.querySelector('.hd-staff-greeting-surface')&&!m.querySelector('[data-hd-module-loading],[data-hd-report-refreshing],[aria-busy="true"]')})()`)){
  if(Date.now()>deadline)throw Error('Complete personal Home did not become available');await new Promise(resolve=>setTimeout(resolve,250));
 }
 result=await c.evaluate(`(function(){
  ${bundle.outputFiles[0].text}
  var domain=homeReadModelDomain,m=document.querySelector('main[data-hd-module="home"]'),key=Object.keys(m).find(function(k){return k.indexOf('__reactFiber$')===0}),fiber=m[key],p;
  for(var depth=0;fiber&&depth<100;depth++,fiber=fiber.return){var props=fiber.memoizedProps;if(props&&props.homeReadinessCollections&&props.employee){p=props;break}}
  if(!p||p.currentUser.accountType!=='employee'||p.currentUser.id!==p.employee.id||p.employee.companyId!==p.currentUser.companyId)throw Error('Approved own-employee scope required');
  var required=['companies','employees'].concat(p.homeReadinessCollections),flags=p.serverConfirmedCollectionState;
  if(p.homeReadinessCollections.length!==13||flags.tenantId!==p.currentUser.companyId||!required.every(function(n){return flags.collections[n]===true}))throw Error('Complete personal Home source contract required');
  var input={employee:p.employee,date:p.date,record:p.currentAttendanceAlert&&p.currentAttendanceAlert.record};
  ['employees','customers','orders','payments','expenses','financials','attendance','performance','employeeReviews','deliveryReports','holidays','assets','assetCostLogs','advanceRequests'].forEach(function(n){input[n]=p[n]});
  input.payments=input.payments.filter(domain.isCashflowOfficial);input.expenses=input.expenses.filter(domain.isCashflowOfficial);
  var scope={companyId:p.currentUser.companyId,employeeId:p.employee.id,date:p.date};
  var snapshot={company:{documentId:scope.companyId,data:p.currentCompany},employee:{documentId:scope.employeeId,data:p.employee},sources:{},counts:{}};
  ['employees','customers','orders','payments','expenses','financials','employeeReviews','deliveryReports','holidays','assets','assetCostLogs','advances'].forEach(function(n){var rows=n==='advances'?p.advanceRequests:p[n];snapshot.sources[n]=rows.map(function(row){return {documentId:row.id,data:row}})});
  snapshot.sources.attendance=Object.keys(p.attendance).map(function(id){return {documentId:id,data:p.attendance[id]}});
  // Root has already overlaid employee revenue. Preserve stored month rows and
  // every original field; derived employee-only rows have no companyId and are
  // correctly rebuilt by the original aggregation in the private adapter.
  snapshot.sources.performance=Object.keys(p.performance).filter(function(id){return p.performance[id].companyId===scope.companyId}).map(function(id){return {documentId:id,data:p.performance[id]}});
  Object.keys(snapshot.sources).forEach(function(n){snapshot.counts[n]=snapshot.sources[n].length});
  var rebuilt=domain.buildEmployeeHomeSnapshotInput(snapshot,scope,domain);
  var expected=domain.buildEmployeeHomeScreenDto(domain.buildEmployeeHomeScreenModel(input),input,domain);
  var actual=domain.buildEmployeeHomeScreenDto(domain.buildEmployeeHomeScreenModel(rebuilt),rebuilt,domain);
  var salaryLabel=Array.from(m.querySelectorAll('.hd-staff-greeting-surface p')).find(function(n){return n.textContent.trim()==='Thực lĩnh'});
  var workLabel=Array.from(m.querySelectorAll('.hd-staff-greeting-surface p')).find(function(n){return n.textContent.trim()==='Công tháng'});
  return {equal:JSON.stringify(actual)===JSON.stringify(expected),salaryDisplayMatches:!!salaryLabel&&salaryLabel.nextElementSibling.textContent.trim()===domain.formatCurrency(actual.salary.netSalary)+' đ',
   workDaysDisplayMatches:!!workLabel&&workLabel.nextElementSibling.textContent.trim()===domain.formatNumber(actual.salary.workDays),
   inputCounts:snapshot.counts,displayCharacters:JSON.stringify(actual).length,
   scope:'Synchronous read-only diagnostic on the approved employee session. Reconstructs a private snapshot from already-filtered current Main props (performance revenue was already overlaid), not raw Admin Firestore pages. Compares adapter/model display fields and actual salary/workday DOM. No identifiers, records, credentials or money values exported. Not backend read parity, deployed API validation or a speed benchmark.'};
 })()`);
}finally{c.close()}
await mkdir(output,{recursive:true});await writeFile(output+'/result.json',JSON.stringify({at:new Date(),sourceSha256:createHash('sha256').update(source).digest('hex'),...result},null,2));
console.log(JSON.stringify(result));if(!result?.equal||!result.salaryDisplayMatches||!result.workDaysDisplayMatches)throw Error('Compact model client-input/DOM parity failed');
