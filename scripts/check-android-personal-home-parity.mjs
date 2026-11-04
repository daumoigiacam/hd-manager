import {readFile,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import {extractEmployeeHomeDomain} from './helpers/employee-home-domain-extraction.mjs';
import {connectAndroidWebView} from './helpers/android-webview-cdp.mjs';
const output=process.env.HD_HOME_PARITY_OUTPUT;
if(!output?.startsWith('test-results/'))throw Error('Local evidence output required.');
const source=await readFile('src/App.jsx','utf8');
const domain=extractEmployeeHomeDomain(source,path.resolve('src'),[
 'buildSalaryDetails','buildEmployeeReviewSummary','preparePersonalHomeProjectionInput','isCashflowOfficial'
]);
const bundle=await build({stdin:{contents:domain,resolveDir:path.resolve('src')},bundle:true,write:false,
 format:'iife',globalName:'homeParityDomain',platform:'browser',target:'es2018'});
const c=await connectAndroidWebView({adb:'D:/HD-DEV/android/sdk/platform-tools/adb.exe',serial:'emulator-5554',packageName:'com.hdmanager.app.acceptance',enableRuntime:false});
let result;
try{
 const button=await c.evaluate(`(function(){var b=Array.from(document.querySelectorAll('[data-hd-navigation="bottom"] button')).find(function(b){return (b.getAttribute('aria-label')||b.innerText).trim()==='Trang chủ'});if(!b)throw Error('Home navigation unavailable');var r=b.getBoundingClientRect();return {x:(r.x+r.width/2)*devicePixelRatio,y:(r.y+r.height/2)*devicePixelRatio}})()`);
 c.shell('shell','input','tap',String(Math.round(button.x)),String(Math.round(button.y)));
 const deadline=Date.now()+30000;
 while(!await c.evaluate('Boolean(document.querySelector("main[data-hd-module=home] .hd-staff-greeting-surface"))')){
  if(Date.now()>deadline)throw Error('Complete personal Home did not become available');
  await new Promise(resolve=>setTimeout(resolve,250));
 }
 result=await c.evaluate(`(function(){
  ${bundle.outputFiles[0].text}
  var main=document.querySelector('main[data-hd-module="home"]');
  if(!main)throw Error('Home must be open');
  var key=Object.keys(main).find(function(k){return k.indexOf('__reactFiber$')===0}),fiber=main[key],props;
  for(var depth=0;fiber&&depth<100;depth++,fiber=fiber.return){
   if(fiber.memoizedProps&&fiber.memoizedProps.homeReadinessCollections&&fiber.memoizedProps.employee){props=fiber.memoizedProps;break}
  }
  if(!props)throw Error('Real employee Home props unavailable');
  var required=['companies','employees'].concat(props.homeReadinessCollections),confirmed=props.serverConfirmedCollectionState;
  if(!confirmed||confirmed.tenantId!==props.currentUser.companyId||!required.every(function(n){return confirmed.collections[n]===true}))throw Error('Complete server-confirmed Home inputs required');
  var input={employee:props.employee,monthKey:String(props.date).slice(0,7)};
  ['employees','attendance','financials','performance','customers','orders','payments','holidays','employeeReviews','deliveryReports'].forEach(function(n){input[n]=props[n]});
  input.payments=input.payments.filter(homeParityDomain.isCashflowOfficial);
  function calculate(i){return {details:homeParityDomain.buildSalaryDetails(i.employee.id,i.employees,i.attendance,i.financials,i.performance,i.customers,i.orders,i.payments,i.holidays,i.monthKey),
   reviewSummary:homeParityDomain.buildEmployeeReviewSummary(i.employee,{attendance:i.attendance,orders:i.orders,deliveryReports:i.deliveryReports,reviews:i.employeeReviews,monthKey:i.monthKey})}}
  var selection=homeParityDomain.preparePersonalHomeProjectionInput(input),step;
  do{step=selection.next()}while(!step.done);
  var selected=step.value,before=JSON.stringify(calculate(input)),after=JSON.stringify(calculate(selected));
  return {equal:before===after,inputCounts:{orders:input.orders.length,payments:input.payments.length},
   selectedCounts:{orders:selected.orders.length,payments:selected.payments.length},comparedCharacters:before.length,
   completeInputContract:required,scope:'Read-only diagnostic calculation on current approved employee session. No document values, employee/account identifiers, credentials or financial amounts returned. Synchronous diagnostic overhead; not a speed benchmark.'};
 })()`);
}finally{c.close()}
await mkdir(output,{recursive:true});
await writeFile(output+'/result.json',JSON.stringify({at:new Date(),sourceSha256:createHash('sha256').update(source).digest('hex'),...result},null,2));
console.log(JSON.stringify(result));
if(!result?.equal)throw Error('Original/selected financial projection parity failed.');
