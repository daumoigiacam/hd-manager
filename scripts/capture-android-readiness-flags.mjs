import { writeFile } from 'node:fs/promises';
import { connectAndroidWebView } from './helpers/android-webview-cdp.mjs';
const output = process.env.HD_READINESS_OUTPUT;
if (!output) throw Error('Set HD_READINESS_OUTPUT to a local JSON file');
const cdp = await connectAndroidWebView({ adb: 'D:/HD-DEV/android/sdk/platform-tools/adb.exe', serial: 'emulator-5554', packageName: 'com.hdmanager.app.acceptance', enableRuntime: false });
try {
  const flags = await cdp.evaluate(`(function(){
    var main=document.querySelector('main[data-hd-module]');if(!main)return {available:false};
    var key=Object.keys(main).find(function(k){return k.indexOf('__reactFiber$')===0});
    var fiber=main[key],found=[];
    for(var depth=0;fiber && depth<80;depth++,fiber=fiber.return){
      [fiber,fiber.alternate].forEach(function(branch,branchIndex){
        var hook=branch && branch.memoizedState;
        for(var i=0;hook && i<1000;i++,hook=hook.next){
          var value=hook.memoizedState;
          if(!value || typeof value!=='object' || !Object.prototype.hasOwnProperty.call(value,'tenantId') || !value.collections || typeof value.collections!=='object')continue;
          var result={};Object.keys(value.collections).forEach(function(name){
            if(/^[A-Za-z_]+$/.test(name) && typeof value.collections[name]==='boolean')result[name]=value.collections[name];
          });
          found.push({branch:branchIndex===0?'host-fiber':'alternate',collections:result});
        }
      });
    }
    return {available:found.length>0,module:main.getAttribute('data-hd-module'),states:found,timeOrigin:performance.timeOrigin};
  })()`);
  await writeFile(output, JSON.stringify({ at: Date.now(), flags,
    scope: 'Diagnostic React hook metadata only: collection names and boolean flags. No tenant ID value, credentials, document contents or other hook values serialized. React internals may be unavailable/stale; these flags are not derived-model readiness, paint, or proof of the latest server revision.' }, null, 2));
  console.log(JSON.stringify(flags));
} finally { cdp.close(); }
