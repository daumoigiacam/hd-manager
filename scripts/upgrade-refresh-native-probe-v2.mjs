import fs from'node:fs/promises';import crypto from'node:crypto';import{parse}from'@babel/parser';
const root='test-results/performance-upgrade-20261103',probe=await fs.readFile('performance/phase2-verification/probe.js','utf8'),replacement=probe.trim(),receipts=[];
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
for(const cohort of['baseline-native-v3','after-memo-native-v3']){
 const base=`${root}/${cohort}`;try{await fs.access(`${base}/capacitor-project/app/build/outputs/apk/release/app-release.apk`);throw Error('Do not rewrite a built cohort')}catch(e){if(e.code!=='ENOENT')throw e}
 const file=`${base}/capacitor-project/app/src/main/assets/public/index.html`,before=await fs.readFile(file,'utf8'),edits=[];
 for(const match of before.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)){
  if(!match[1].includes('window.__hdVerification'))continue;const ast=parse(match[1],{sourceType:'module'}),offset=match.index+match[0].indexOf('>')+1;
  for(const n of ast.program.body)if(n.type==='ExpressionStatement'&&n.expression.type==='CallExpression'&&n.expression.callee.type==='FunctionExpression'&&match[1].slice(n.start,n.end).includes('window.__hdVerification'))edits.push({start:offset+n.start,end:offset+n.end,original:match[1].slice(n.start,n.end)});
 }
 if(edits.length!==1)throw Error('Probe IIFE boundary changed');const e=edits[0],after=before.slice(0,e.start)+replacement+before.slice(e.end);
 await fs.writeFile(`${root}/checkpoints/measurement-probe-v2/${cohort}-before-probe.js`,e.original);await fs.writeFile(`${root}/checkpoints/measurement-probe-v2/${cohort}-before-index.html`,before);
 const identityFile=`${base}/capacitor-build-identity.json`,id=JSON.parse(await fs.readFile(identityFile,'utf8')),entry=id.files.find(r=>r.file==='index.html');if(entry.sha256!==hash(before))throw Error('Index provenance differs');
 await fs.writeFile(file,after);entry.bytes=Buffer.byteLength(after);entry.sha256=hash(after);id.derivedNativeHarness.loginClockRevision='trusted-intent-v2';id.derivedNativeHarness.sourceProbeSha256=hash(probe);await fs.writeFile(identityFile,JSON.stringify(id,null,2));receipts.push({cohort,beforeSha256:hash(before),afterSha256:hash(after),sourceProbeSha256:hash(probe)});
}
await fs.writeFile(`${root}/measurement-probe-v2-receipts.json`,JSON.stringify({at:new Date().toISOString(),receipts},null,2));console.log(JSON.stringify(receipts));
