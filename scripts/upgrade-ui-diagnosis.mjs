import fs from 'node:fs/promises';
import {connectAndroidWebView} from './helpers/android-webview-cdp.mjs';
const c=await connectAndroidWebView({adb:'D:/HD-DEV/android/sdk/platform-tools/adb.exe',serial:'emulator-5554',packageName:'com.hdmanager.caplab.diag',port:9254});
try{
 const value=await c.evaluate(`(()=>{if(!window.__hdVerification.fixtureOnly)throw Error('Not fixture');var m=document.querySelector('main[data-hd-module]');return{at:performance.now(),module:m.getAttribute('data-hd-module'),activePending:window.__hdModulePending(m),allBusy:m.querySelectorAll('[aria-busy=true]').length,inputs:Array.from(document.querySelectorAll('input')).filter(e=>e.getClientRects().length).map(e=>({placeholder:e.placeholder,value:e.value})),names:Array.from(m.querySelectorAll('.hd-product-list__name')).map(e=>e.textContent.trim()),errors:window.__hdVerification.errors,rejections:window.__hdVerification.rejections}})()`);
 await fs.writeFile('test-results/performance-upgrade-20261103/search-ui-diagnosis.json',JSON.stringify(value,null,2));console.log(JSON.stringify(value));
}finally{c.close()}
