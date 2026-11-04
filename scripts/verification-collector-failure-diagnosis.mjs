import fs from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {connectAndroidWebView} from './helpers/android-webview-cdp.mjs';
import {findOwnedWebViewRendererPids} from './helpers/android-renderer-ownership.mjs';
const root='test-results/phase2-verification-20261102',pkg='com.hdmanager.caplab.diag',adb='D:/HD-DEV/android/sdk/platform-tools/adb.exe';
const result={at:new Date().toISOString(),scope:'Read-only diagnosis after collector aborted; no restart, GC or data clearing',commands:[]};
function command(...args){const start=performance.now();try{const output=execFileSync(adb,['-s','emulator-5554','shell',...args],{encoding:'utf8',windowsHide:true,timeout:8000});result.commands.push({args,ms:performance.now()-start,status:'OK'});return output}catch(error){result.commands.push({args,ms:performance.now()-start,error:error.message});return ''}}
let cdp;
try{
 const pidText=command('pidof',pkg).trim();result.nativePid=Number(pidText);
 if(!/^[1-9]\d*$/.test(pidText))throw Error('Fixture PID absent');
 result.renderers=findOwnedWebViewRendererPids(command('dumpsys','activity','services',pkg),pkg,result.nativePid);
 for(const pid of [result.nativePid,...result.renderers])command('dumpsys','meminfo',String(pid));
 cdp=await connectAndroidWebView({adb,serial:'emulator-5554',packageName:pkg,port:9243});const start=performance.now();
 result.page=await cdp.evaluate(`(()=>{const m=document.querySelector('main[data-hd-module]'),s=window.__hdVerification;return{module:m&&m.getAttribute('data-hd-module'),documentOrigin:performance.timeOrigin,fixture:s&&s.fixtureOnly,errors:s&&s.errors,rejections:s&&s.rejections}})()`);
 result.pageReadMs=performance.now()-start;result.heap=await cdp.send('Runtime.getHeapUsage');
}catch(error){result.error=error.message}
finally{cdp?.close();await fs.writeFile(`${root}/collector-failure-diagnosis.json`,JSON.stringify(result,null,2));console.log(JSON.stringify(result));}
