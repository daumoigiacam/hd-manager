import fs from'node:fs/promises';import crypto from'node:crypto';import{parse}from'@babel/parser';
import{readModuleSourceReadiness}from'./helpers/module-source-readiness.mjs';
const root='test-results/performance-upgrade-20261103',checkpoint=`${root}/checkpoints/measurement-reader-v2`;await fs.mkdir(checkpoint,{recursive:true});
const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex'),replacement=readModuleSourceReadiness.toString(),receipts=[];
for(const cohort of['baseline-native-v3','after-memo-native-v3']){
 const base=`${root}/${cohort}`;try{await fs.access(`${base}/capacitor-project/app/build/outputs/apk/release/app-release.apk`);throw Error('Do not rewrite a built/measured cohort')}catch(e){if(e.code!=='ENOENT')throw e}
 const file=`${base}/capacitor-project/app/src/main/assets/public/index.html`,before=await fs.readFile(file,'utf8'),edits=[];
 for(const match of before.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)){
  const body=match[1];if(!body.includes('window.__hdSourceContract'))continue;const offset=match.index+match[0].indexOf('>')+1,ast=parse(body,{sourceType:'module'});
  function visit(n){if(!n||typeof n!=='object')return;if(n.type==='AssignmentExpression'&&n.left.type==='MemberExpression'&&n.left.object.name==='window'&&n.left.property.name==='__hdSourceContract'){
   if(n.right.type!=='FunctionExpression')throw Error('Unexpected measurement function shape');const original=body.slice(n.right.start,n.right.end);if(original===replacement)throw Error('Cohort already refreshed');edits.push({start:offset+n.right.start,end:offset+n.right.end,original});return}
   for(const v of Object.values(n))if(Array.isArray(v))v.forEach(visit);else if(v&&typeof v==='object')visit(v)}visit(ast);
 }
 if(edits.length!==1)throw Error('Measurement assignment count changed');const edit=edits[0],after=before.slice(0,edit.start)+replacement+before.slice(edit.end);
 await fs.writeFile(`${checkpoint}/${cohort}-before-function.js`,edit.original);await fs.writeFile(`${checkpoint}/${cohort}-before-index.html`,before);
 const identityFile=`${base}/capacitor-build-identity.json`,identity=JSON.parse(await fs.readFile(identityFile,'utf8')),entry=identity.files.find(r=>r.file==='index.html');if(entry.sha256!==digest(before))throw Error('Pre-refresh identity mismatch');
 await fs.writeFile(file,after);entry.bytes=Buffer.byteLength(after);entry.sha256=digest(after);
 identity.derivedNativeHarness.webAssetsByteIdentical=identity.files.length-1;identity.derivedNativeHarness.changedMeasurementAssets=['index.html'];identity.derivedNativeHarness.sourceReadinessRevision='current-root-v2';identity.derivedNativeHarness.sourceReadinessFunctionSha256=digest(replacement);
 identity.derivedNativeHarness.qualification='Original business JS/CSS and assets preserved byte-for-byte except index.html measurement function; native failure capture is test-only. V1 readiness timing is invalidated; remeasure with current committed root.';
 await fs.writeFile(identityFile,JSON.stringify(identity,null,2));receipts.push({cohort,changedAsset:'index.html',beforeSha256:digest(before),afterSha256:digest(after),beforeFunctionSha256:digest(edit.original),afterFunctionSha256:digest(replacement),unchangedOtherAssets:identity.files.length-1});
}
await fs.writeFile(`${root}/measurement-reader-v2-receipts.json`,JSON.stringify({at:new Date().toISOString(),source:'scripts/helpers/module-source-readiness.mjs',receipts},null,2));console.log(JSON.stringify(receipts));
