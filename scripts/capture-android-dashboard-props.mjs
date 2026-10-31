import { writeFile } from 'node:fs/promises';
import { connectAndroidWebView } from './helpers/android-webview-cdp.mjs';
const output = process.env.HD_DASHBOARD_PROPS_OUTPUT;
if (!output) throw Error('Set HD_DASHBOARD_PROPS_OUTPUT');
const cdp = await connectAndroidWebView({ adb: 'D:/HD-DEV/android/sdk/platform-tools/adb.exe', serial: 'emulator-5554', packageName: 'com.hdmanager.app.acceptance', enableRuntime: false });
try {
  const result = await cdp.evaluate(`(function(){
    var main=document.querySelector('main[data-hd-module]');if(!main)return {available:false};
    var k=Object.keys(main).find(function(k){return k.indexOf('__reactFiber$')===0});
    var root=main[k];while(root && root.return)root=root.return;
    if(root && root.stateNode && root.stateNode.current)root=root.stateNode.current;
    var pending=[root],seen=new Set(),out=[];
    while(pending.length && seen.size<20000){
      var f=pending.pop();if(!f || seen.has(f))continue;seen.add(f);
      var p=f.memoizedProps,h=f.memoizedState,d=h && h.memoizedState;
      if(p && d && typeof p==='object' && typeof d==='object'
        && Object.prototype.hasOwnProperty.call(p,'isActive') && Object.prototype.hasOwnProperty.call(d,'dashboardCache')){
        out.push({active:!!p.isActive,companySame:p.company===d.company,employeeSame:p.employee===d.employee,
          differences:Object.keys(p).filter(function(k){return k!=='isActive' && p[k]!==d[k]})
            .map(function(k){return {key:k,type:typeof p[k]}})});
      }
      if(f.child)pending.push(f.child);if(f.sibling)pending.push(f.sibling);
    }return {module:main.getAttribute('data-hd-module'),components:out};
  })()`);
  await writeFile(output, JSON.stringify({ at: Date.now(), result,
    scope: 'Diagnostic React internals. Only report prop names/types and identity-comparison booleans, no values or other hook data serialized; not a readiness or timing gate.' }, null, 2));
  console.log(JSON.stringify(result));
} finally { cdp.close(); }
