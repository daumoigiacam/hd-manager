import fs from 'node:fs/promises';
import {connectAndroidWebView} from './helpers/android-webview-cdp.mjs';
const output=process.env.HD_NATIVE_HEALTH_OUTPUT;
if(!output)throw Error('Set HD_NATIVE_HEALTH_OUTPUT');
const c=await connectAndroidWebView({adb:'D:/HD-DEV/android/sdk/platform-tools/adb.exe',serial:'emulator-5554',packageName:'com.hdmanager.app.acceptance',enableRuntime:false});
try{
 const initial=await c.evaluate('window.__hdArmedLogin && {origin:performance.timeOrigin,submitAt:window.__hdArmedLogin.state.submitAt}');
 if(!initial || initial.submitAt!==null)throw Error('Arm a fresh login observer first');
 await fs.mkdir(output,{recursive:true});
 await fs.writeFile(output+'/armed.json',JSON.stringify({at:new Date(),origin:initial.origin,
 scope:'CDP polls only the diagnostic login-submit flag while waiting; closes before native PID/RSS sampling. No typed values, auth session, documents or network data read.'},null,2));
 console.log(JSON.stringify({armed:true,origin:initial.origin}));
 const deadline=Date.now()+7200000;
 let submitted;
 while(Date.now()<deadline){
  submitted=await c.evaluate('(function(){var p=window.__hdArmedLogin;return p && {origin:performance.timeOrigin,submitAt:p.state.submitAt,endReason:p.state.endReason}})()');
  if(!submitted || submitted.origin!==initial.origin || submitted.endReason)throw Error('Armed login observation expired or page changed');
  if(submitted.submitAt!==null)break;
  await new Promise(resolve=>setTimeout(resolve,250));
 }
 if(!submitted || submitted.submitAt===null)throw Error('Native health login arm expired');
 await fs.writeFile(output+'/submitted.json',JSON.stringify(submitted));
}finally{c.close()}
await import('./capture-android-native-health.mjs');
