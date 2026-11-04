import fs from'node:fs/promises';import path from'node:path';import{build}from'esbuild';import{execFileSync}from'node:child_process';
import{connectAndroidWebView}from'./helpers/android-webview-cdp.mjs';import{makeFixture}from'../performance/phase2/synthetic-fixture.mjs';
import{assertNoActiveUpgradeSoak}from'./helpers/upgrade-observation-barrier.mjs';
const root='test-results/performance-upgrade-20261103';await assertNoActiveUpgradeSoak();
const c=await connectAndroidWebView({adb:'D:/HD-DEV/android/sdk/platform-tools/adb.exe',serial:'emulator-5554',packageName:'com.hdmanager.caplab.diag',port:9239});
const report={at:new Date().toISOString(),conditions:'Native WebView 74 search algorithm A/B only. Loaded fictional rows, same 2ms/512-operation budget, original exact scorer; no sampler or forced GC. This is not end-to-end UI/search latency acceptance.',runs:[]};
try{
 if(!await c.evaluate('Boolean(window.__hdVerification&&window.__hdVerification.fixtureOnly)'))throw Error('Fixture guard');
 await c.send('Performance.enable');
 for(const variant of['before','after']){
  const contents=await fs.readFile(variant==='before'?`${root}/checkpoints/search-dense-postings/searchEngine.js`:'src/services/searchEngine.js','utf8');
  const bundled=await build({stdin:{contents,resolveDir:path.resolve('src/services'),loader:'js'},bundle:true,write:false,format:'iife',globalName:`__searchAlgorithm_${variant}`,target:'chrome74'});
  await c.evaluate(bundled.outputFiles[0].text);
 }
 const rows=Object.entries(makeFixture('manager',1000).data.products).sort(([a],[b])=>Buffer.compare(Buffer.from(a),Buffer.from(b))).map(([,r])=>r);
 await c.evaluate(`window.__searchAlgorithmRows=${JSON.stringify(rows)};window.__searchAlgorithmIndices={before:__searchAlgorithm_before.createSearchRecordIndex(__searchAlgorithmRows,__searchAlgorithm_before.getProductSearchFields),after:__searchAlgorithm_after.createSearchRecordIndex(__searchAlgorithmRows,__searchAlgorithm_after.getProductSearchFields)}`);
 for(const variant of['before','after','after','before','before','after','after','before'])for(const query of['s','synthetic product','Synthetic Product 900']){
  const row=await c.evaluate(`(async function(){var index=window.__searchAlgorithmIndices[${JSON.stringify(variant)}],query=${JSON.stringify(query)},clocks=0,yields=0;var expected=window.__searchAlgorithmIndices.before.search(query).map(function(r){return r.id}),started=performance.now();var found=await index.searchAsync(query,{budgetMs:2,maxOperations:512,now:function(){clocks++;return performance.now()}});var ms=performance.now()-started;return{variant:${JSON.stringify(variant)},query:query,ms:ms,clockCalls:clocks,count:found.length,exact:JSON.stringify(expected)===JSON.stringify(found.map(function(r){return r.id}))}})()`);
  if(!row.exact)throw Error('Algorithm changed full ranked answer');report.runs.push(row);
 }
 report.status='ALGORITHM_MEASURED_NOT_UI_ACCEPTANCE';
}catch(error){report.status='FAILED';report.error=error.message;process.exitCode=1}finally{
 try{await c.evaluate('window.__searchAlgorithmIndices=null;window.__searchAlgorithmRows=null;window.__searchAlgorithm_before=null;window.__searchAlgorithm_after=null')}catch{}
 report.endedAt=new Date().toISOString();await fs.writeFile(`${root}/native-search-algorithm-ab.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report));c.close();
}
