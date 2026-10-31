import fs from 'node:fs/promises';
import {connectAndroidWebView} from './helpers/android-webview-cdp.mjs';
const output=process.env.HD_DASHBOARD_COUNTS_OUTPUT;if(!output)throw Error('Set HD_DASHBOARD_COUNTS_OUTPUT');
const c=await connectAndroidWebView({adb:'D:/HD-DEV/android/sdk/platform-tools/adb.exe',serial:'emulator-5554',packageName:'com.hdmanager.app.acceptance',enableRuntime:false});
try{
 const result=await c.evaluate(`(function(){
  var main=document.querySelector('main[data-hd-module]');if(!main)return {available:false};
  var key=Object.keys(main).find(function(k){return k.indexOf('__reactFiber$')===0}),root=main[key];
  while(root && root.return)root=root.return;
  if(root && root.stateNode && root.stateNode.current)root=root.stateNode.current;
  var queue=[root],seen=new Set(),out=[];
  var names=['orders','warehouseDispatches','warehouseImports','attendance','customers','employees','payments','expenses','financials','products','deliveryReports','employeeReviews'];
  while(queue.length && seen.size<20000){var f=queue.pop();if(!f||seen.has(f))continue;seen.add(f);
   var p=f.memoizedProps,s=f.memoizedState,d=s&&s.memoizedState;
   if(p && d && typeof p==='object' && typeof d==='object' && Object.prototype.hasOwnProperty.call(p,'isActive') && Object.prototype.hasOwnProperty.call(d,'dashboardCache')){
    var counts={};names.forEach(function(name){var value=p[name];counts[name]=Array.isArray(value)?value.length:value && typeof value==='object'?Object.keys(value).length:null});out.push(counts);
   }
   if(f.child)queue.push(f.child);if(f.sibling)queue.push(f.sibling);
  }
  return {origin:performance.timeOrigin,module:main.getAttribute('data-hd-module'),counts:out};
 })()`);
 await fs.writeFile(output,JSON.stringify({at:new Date(),result,scope:'React diagnostic, fixed collection names and lengths only. No IDs, document values, company/employee names, credentials or network data; not performance or full-server readiness.'},null,2));
 console.log(JSON.stringify(result));
}finally{c.close()}
