import fs from'node:fs/promises';import assert from'node:assert/strict';import crypto from'node:crypto';import{connectAndroidWebView}from'./helpers/android-webview-cdp.mjs';
const candidate=process.argv[2]||'after-native-probe';if(!/^after-[a-z0-9-]+$/.test(candidate))throw Error('Invalid candidate');
const root='test-results/performance-upgrade-20261103',identity=JSON.parse(await fs.readFile(`${root}/${candidate}/capacitor-build-identity.json`)),asset=identity.files.find(f=>/^assets\/shareCanvas\.worker-.*\.js$/.test(f.file));if(!asset)throw Error('Actual emitted classic worker missing');
const c=await connectAndroidWebView({adb:'D:/HD-DEV/android/sdk/platform-tools/adb.exe',serial:'emulator-5554',packageName:'com.hdmanager.caplab.diag',port:9255});
const report={at:new Date().toISOString(),candidate,asset,conditions:'Actual emitted canvas worker in Android10/WebView74, in-memory synthetic rectangles and UTF-8; not a recipient send or full multi-page business share benchmark.',productionRequests:0};
try{
 const apkPath=c.shell('shell','pm','path','com.hdmanager.caplab.diag').replace(/^package:/,'');if(!apkPath.startsWith('/data/app/')||!apkPath.includes('com.hdmanager.caplab.diag')||!apkPath.endsWith('/base.apk'))throw Error('Unexpected fixture APK path');
 report.apkSha256=c.shell('shell','sha256sum',apkPath).split(/\s+/)[0];assert.equal(report.apkSha256,crypto.createHash('sha256').update(await fs.readFile(`${root}/${candidate}/capacitor-project/app/build/outputs/apk/diagnostic/app-diagnostic.apk`)).digest('hex'));
 report.capabilities=await c.evaluate("({offscreen:typeof OffscreenCanvas,blobArrayBuffer:typeof Blob.prototype.arrayBuffer,blobText:typeof Blob.prototype.text})");
 assert.equal(report.capabilities.blobArrayBuffer,'function');assert.equal(report.capabilities.blobText,'function');
 report.result=await c.evaluate(`new Promise(function(resolve,reject){
  var worker=new Worker('/${asset.file}'),timer=setTimeout(function(){worker.terminate();reject(Error('Native canvas worker timeout'))},10000);
  function fail(error){clearTimeout(timer);worker.terminate();reject(error)}
  worker.onerror=function(){fail(Error('Classic canvas worker failed'))};
  worker.onmessage=function(event){var data=event.data;if(data.error){fail(Error(data.error));return}
   var blob=data.blob;blob.arrayBuffer().then(function(buffer){return new Blob(['Tiếng Việt ✓']).text().then(function(text){
    var url=URL.createObjectURL(blob),image=new Image();image.onerror=function(){URL.revokeObjectURL(url);fail(Error('PNG decode failed'))};image.onload=function(){try{var canvas=document.createElement('canvas');canvas.width=32;canvas.height=32;var ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);var a=Array.from(ctx.getImageData(1,1,1,1).data),b=Array.from(ctx.getImageData(20,20,1,1).data);canvas.width=0;canvas.height=0;clearTimeout(timer);URL.revokeObjectURL(url);worker.terminate();resolve({size:blob.size,magic:Array.from(new Uint8Array(buffer).slice(0,8)),text:text,pixels:[a,b]})}catch(error){URL.revokeObjectURL(url);fail(error)}};image.src=url;
   })}).catch(fail)
  };
  worker.postMessage({id:1,width:32,height:32,commands:[['set','fillStyle','#ff0000'],['call','fillRect',[0,0,32,32]],['set','fillStyle','#00ff00'],['call','fillRect',[16,16,16,16]]],options:{type:'image/png'}});
 })`);
 assert.deepEqual(report.result.magic,[137,80,78,71,13,10,26,10]);assert.equal(report.result.text,'Tiếng Việt ✓');assert.deepEqual(report.result.pixels,[[255,0,0,255],[0,255,0,255]]);report.status='NATIVE_CLASSIC_WORKER_BLOB_COMPATIBILITY_PASS';
}catch(error){report.status='FAILED';report.error=error.message;process.exitCode=1}
finally{c.close();report.endedAt=new Date().toISOString();await fs.writeFile(`${root}/android-share-compat-${candidate}.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report))}
