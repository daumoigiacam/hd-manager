import {mkdir,writeFile} from 'node:fs/promises';
import {connectAndroidWebView} from './helpers/android-webview-cdp.mjs';
const output=process.env.HD_MODULE_IDENTITY_OUTPUT||'test-results/android10-module-projection-cache-20261102/input-identity-diagnostic';
const c=await connectAndroidWebView({adb:'D:/HD-DEV/android/sdk/platform-tools/adb.exe',serial:'emulator-5554',packageName:'com.hdmanager.app.acceptance',enableRuntime:false});
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const rows=[];
try{
 await c.evaluate(`window.__hdModuleSourceIdentity={ids:new WeakMap(),next:1};true`);
 const touch=async(label,bottom)=>{
  const pos=await c.evaluate(`(function(){var root=document.querySelector(${JSON.stringify(bottom?'[data-hd-navigation="bottom"]':'main')});var b=root&&Array.from(root.querySelectorAll('button')).find(function(b){return (b.getAttribute('aria-label')||b.innerText).trim()===${JSON.stringify(label)}});if(!b||!document.hasFocus()||document.visibilityState!=='visible')throw Error('Focused navigation required');b.scrollIntoView({block:'center'});var r=b.getBoundingClientRect();return {x:(r.x+r.width/2)*devicePixelRatio,y:(r.y+r.height/2)*devicePixelRatio}})()`);
  c.shell('shell','input','tap',String(Math.round(pos.x)),String(Math.round(pos.y)));
 };
 for(const route of ['orders','home','orders','payroll','home','payroll','orders']){
  const label=route==='home'?'Trang chủ':route==='orders'?'Đơn hàng':'Bảng lương';
  const bottom=await c.evaluate(`Array.from(document.querySelectorAll('[data-hd-navigation="bottom"] button')).some(function(b){return (b.getAttribute('aria-label')||b.innerText).trim()===${JSON.stringify(label)}})`);
  if(!bottom){await touch('Thêm',true);await sleep(250)}
  await touch(label,bottom);
  await sleep(2500);
  rows.push(await c.evaluate(`(function(){var main=document.querySelector('main[data-hd-module]');if(!main||main.getAttribute('data-hd-module')!==${JSON.stringify(route)})throw Error('Unexpected active module');var key=Object.keys(main).find(function(k){return k.indexOf('__reactFiber$')===0}),start=main[key],stack=[start],mainProps=null,viewProps=null,s=window.__hdModuleSourceIdentity;
   function identity(value){if(!value||typeof value!=='object')return value==null?'missing':typeof value;if(!s.ids.has(value))s.ids.set(value,s.next++);return s.ids.get(value)}
   for(var parent=start,depth=0;parent&&depth<100;parent=parent.return,depth++){var p=parent.memoizedProps;if(p&&p.homeReadinessCollections&&p.employee){mainProps=p;break}}
   for(var visited=0;stack.length&&visited++<15000;){var f=stack.pop(),p=f.memoizedProps;if(p&&(${JSON.stringify(route)}==='orders'?Object.prototype.hasOwnProperty.call(p,'canCreateManualOrder'):Object.prototype.hasOwnProperty.call(p,'selectedPayrollEmployeeId'))){viewProps=p;break}if(f.sibling&&f!==start)stack.push(f.sibling);if(f.child)stack.push(f.child)}
   var names=['employee','currentEmployee','currentCompany','employees','customers','orders','payments','products','warehouseDispatches','deliveryReports','zaloSendQueue','customerLedgerMap','attendance','performance','financials','holidays','customerComplaints','employeeReviews','payrollDebtCarryovers','payrollPeriods'];
   function collect(p){if(!p)return null;var result={};names.forEach(function(n){result[n]=identity(p[n])});return result}
   return {route:${JSON.stringify(route)},atEpochMs:Date.now(),root:collect(mainProps),view:collect(viewProps)};
  })()`));
 }
}finally{try{await c.evaluate('delete window.__hdModuleSourceIdentity;true')}catch{}c.close()}
await mkdir(output,{recursive:true});await writeFile(output+'/result.json',JSON.stringify({at:new Date(),rows,
 scope:'Diagnostic weak reference numbers only. No document fields, account identifiers, credentials or financial values exported. Navigation/diagnostic overhead is not a performance acceptance sample.'},null,2));
console.log(JSON.stringify(rows));
