import {readdir,readFile,mkdir,writeFile} from 'node:fs/promises';import path from 'node:path';
import {createHash} from 'node:crypto';import {connectAndroidWebView} from './helpers/android-webview-cdp.mjs';
const candidate=process.env.HD_ACCEPTANCE_CANDIDATE_OUTPUT;
if(!candidate?.startsWith('test-results/'))throw Error('Verified Acceptance candidate required.');
const assets=path.join(candidate,'public/assets'),files=await readdir(assets),pdf=files.filter(n=>/^vendor-export-.*\.js$/.test(n));
if(pdf.length!==1)throw Error('Unambiguous emitted PDF export chunk required.');
const bytes=await readFile(path.join(assets,pdf[0])),digest=createHash('sha256').update(bytes).digest('hex');
const c=await connectAndroidWebView({adb:'D:/HD-DEV/android/sdk/platform-tools/adb.exe',serial:'emulator-5554',packageName:'com.hdmanager.app.acceptance',enableRuntime:false});let result;
try{
 result=await c.evaluate(`(async function(){
  var url=location.origin+'/assets/'+${JSON.stringify(pdf[0])},response=await fetch(url,{cache:'no-store'});if(!response.ok)throw Error('Export asset unavailable');
  var content=await response.arrayBuffer(),hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',content))).map(function(b){return b.toString(16).padStart(2,'0')}).join('');
  if(hash!==${JSON.stringify(digest)})throw Error('Installed export chunk mismatch');
  var library=await import(url),values=Object.values(library),Pdf,image;
  for(var value of values){
   if(typeof value==='function'&&value.API&&typeof value.version==='string')Pdf=value;
   if(value&&typeof value==='object'){
    if(typeof value.jsPDF==='function')Pdf=value.jsPDF;
    if(typeof value.toPng==='function')image=value;
   }
  }
  if(!Pdf)throw Error('Built jsPDF constructor unavailable');
  var doc=new Pdf({orientation:'portrait',unit:'mm',format:'a4'});doc.text('Synthetic local export smoke test',12,20);
  var binary=new Uint8Array(doc.output('arraybuffer')),signature=String.fromCharCode.apply(null,binary.slice(0,5));
  if(signature!=='%PDF-'||binary.byteLength<100)throw Error('Invalid synthetic PDF');
  var rasterOk=null,node;
  if(image){try{node=document.createElement('div');node.textContent='Synthetic export';node.style.cssText='position:fixed;left:0;top:0;width:64px;height:32px;background:white;color:black;font:12px sans-serif';document.body.appendChild(node);
   var png=await image.toPng(node,{pixelRatio:1,backgroundColor:'#ffffff'});rasterOk=png.indexOf('data:image/png;base64,')===0;
  }finally{if(node)node.remove()}}
  return {assetMatched:true,pdfValid:true,pdfBytes:binary.byteLength,rasterValid:rasterOk,
   scope:'Synthetic data only, manual lazy import on the actual APK, no file save/download/share, no business records read. Diagnostic, not a latency benchmark.'};
 })()`);
}finally{c.close()}
await mkdir(candidate+'/lazy-export-smoke',{recursive:true});await writeFile(candidate+'/lazy-export-smoke/result.json',JSON.stringify({at:new Date(),asset:pdf[0],sha256:digest,...result},null,2));
console.log(JSON.stringify(result));if(!result?.pdfValid||result.rasterValid===false)throw Error('Lazy export smoke failed');
