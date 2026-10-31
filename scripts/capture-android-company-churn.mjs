import { writeFile } from 'node:fs/promises';
import { connectAndroidWebView } from './helpers/android-webview-cdp.mjs';
const output = process.env.HD_COMPANY_CHURN_OUTPUT;
if (!output) throw Error('Set HD_COMPANY_CHURN_OUTPUT');
const cdp = await connectAndroidWebView({ adb: 'D:/HD-DEV/android/sdk/platform-tools/adb.exe', serial: 'emulator-5554', packageName: 'com.hdmanager.app.acceptance', enableRuntime: false });
try {
  const result = await cdp.evaluate(`(async function(){
    function company(){
      var main=document.querySelector('main[data-hd-module]');if(!main)return null;
      var key=Object.keys(main).find(function(k){return k.indexOf('__reactFiber$')===0});
      var root=main[key];while(root && root.return)root=root.return;
      if(root && root.stateNode && root.stateNode.current)root=root.stateNode.current;
      var pending=[root],seen=new Set();
      while(pending.length && seen.size<20000){var f=pending.pop();if(!f || seen.has(f))continue;seen.add(f);
        var p=f.memoizedProps;if(p && typeof p==='object' && p.currentCompany && typeof p.activeTab==='string' && typeof p.setActiveTab==='function')return p.currentCompany;
        if(f.child)pending.push(f.child);if(f.sibling)pending.push(f.sibling);
      }return null;
    }
    var before=company(),started=Date.now();if(!before)return {available:false};
    await new Promise(function(resolve){setTimeout(resolve,24000)});
    var after=company();if(!after)return {available:false,sessionMissing:true};
    var keys=Array.from(new Set(Object.keys(before).concat(Object.keys(after))));
    var skipped=0,changes=[];
    keys.forEach(function(key){
      if(/password|secret|token|credential|api.?key|auth|otp/i.test(key)){skipped++;return;}
      if(before[key]!==after[key])changes.push({key:key,beforeType:typeof before[key],afterType:typeof after[key]});
    });
    return {available:true,started:started,ended:Date.now(),referenceChanged:before!==after,changedFields:changes,skippedSensitiveKeys:skipped};
  })()`);
  await writeFile(output, JSON.stringify({ result,
    scope: '24-second private in-page comparison; only changed field names/types and booleans returned. Sensitive-named keys are skipped before reading values. No company identifiers, field values, credentials or document contents exported. React internals may be unavailable.' }, null, 2));
  console.log(JSON.stringify(result));
} finally { cdp.close(); }
