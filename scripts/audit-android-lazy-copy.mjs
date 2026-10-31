import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import {build} from 'esbuild';
import {connectAndroidWebView} from './helpers/android-webview-cdp.mjs';
const output=process.env.HD_LAZY_COPY_OUTPUT;
assert.ok(output,'Set HD_LAZY_COPY_OUTPUT');
const files=['src/utils/cooperativeCollectionIdentity.js','src/services/firestoreWorkerValues.js','tests/fixtures/cooperative-identity-copy.baseline.mjs','tests/fixtures/firestore-worker-copy.baseline.mjs'];
const bundle=await build({stdin:{resolveDir:process.cwd(),contents:`
import{retainCollectionRecordIdentityAsync as previousAsync}from'./tests/fixtures/cooperative-identity-copy.baseline.mjs';
import{retainCollectionRecordIdentityAsync as currentAsync}from'./src/utils/cooperativeCollectionIdentity.js';
import{retainFirestoreWorkerValue as previousWorker}from'./tests/fixtures/firestore-worker-copy.baseline.mjs';
import{retainFirestoreWorkerValue as currentWorker}from'./src/services/firestoreWorkerValues.js';
export{previousAsync,currentAsync,previousWorker,currentWorker};
`},bundle:true,write:false,format:'iife',globalName:'CopyLab',target:'chrome74'});
const c=await connectAndroidWebView({adb:'D:/HD-DEV/android/sdk/platform-tools/adb.exe',serial:'emulator-5554',packageName:'com.hdmanager.app.acceptance',enableRuntime:false});
const runs=[];
try{
  for(const family of ['Async','Worker'])for(const changed of [false,true])for(const version of ['previous','current','current','previous']){
    await c.evaluate(`(function(){${bundle.outputFiles[0].text}
      var a=Array.from({length:1200},function(_,id){var row={id:'fixture-'+id,items:Array.from({length:8},function(_,j){return{amount:125000,quantity:j/10,label:'Vịt 🦆',detail:{n:j}}})};for(var i=0;i<40;i++)row['fixtureField'+i]=id+i;return row});
      var b=JSON.parse(JSON.stringify(a));if(${changed})b[b.length-1].fixtureField39=-1;
      window.__hdLazyCopyLab={a:a,b:b,methods:CopyLab};
    })()`);
    const row=await c.evaluate(`(async function(){var lab=window.__hdLazyCopyLab,start=performance.now(),result=await lab.methods[${JSON.stringify(version+family)}](lab.a,lab.b);
      return{family:${JSON.stringify(family)},changed:${changed},version:${JSON.stringify(version)},elapsedMs:performance.now()-start,sameRoot:result===lab.a,rows:result.length,
        firstRowShared:result[0]===lab.a[0],lastItemsShared:result[result.length-1].items===lab.a[lab.a.length-1].items,lastValue:result[result.length-1].fixtureField39};})()`);
    assert.equal(row.sameRoot,!changed);assert.equal(row.rows,1200);assert.equal(row.firstRowShared,true);assert.equal(row.lastItemsShared,true);assert.equal(row.lastValue,changed?-1:1238);
    runs.push(row);await c.evaluate('delete window.__hdLazyCopyLab');
  }
  await fs.mkdir(output,{recursive:true});
  const sources=Object.fromEntries(await Promise.all(files.map(async file=>[file,crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex')])));
  const result={at:new Date(),runs,sources,fixture:{rows:1200,itemsPerRow:8,extraPrimitiveFieldsPerRow:40},scope:'ABBA pure helper diagnostic on actual Android10/WebView74 with synthetic records only. Working-tree functions injected separately; installed APK unchanged. App background work may overlap. Full/partial identity and end value checked; not RAM savings, login/navigation latency, INP, p95 or performance acceptance.'};
  await fs.writeFile(output+'/result.json',JSON.stringify(result,null,2));console.log(JSON.stringify(runs));
}finally{try{await c.evaluate('delete window.__hdLazyCopyLab')}catch{/* lost renderer */}c.close()}
