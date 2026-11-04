import fs from'node:fs/promises';import path from'node:path';import crypto from'node:crypto';
const base='test-results/phase2-verification-20261102',root='test-results/performance-upgrade-20261103/baseline-native-probe-v2',destination=path.resolve(root,'capacitor-project');
if(!destination.startsWith(path.resolve('test-results/performance-upgrade-20261103')+path.sep))throw Error('Outside fixture workspace');
await fs.mkdir(root,{recursive:true});await fs.cp(`${base}/capacitor-project`,destination,{recursive:true,filter:p=>!p.split(/[\\/]/).some(part=>part==='build'||part==='.gradle')});
const source=`${destination}/app/src/main/java/com/hdmanager/app/VerificationActivity.java`;await fs.copyFile('performance/phase2-verification/VerificationActivity.java',source);
for(const name of['CapacitorBenchmark','CapacitorBaselineProfile'])await fs.copyFile(`performance/phase2-verification/${name}.java`,`${destination}/macrobenchmark/src/main/java/com/hdmanager/caplab/benchmark/${name}.java`);
const publicRoot=`${destination}/app/src/main/assets/public`,htmlFile=`${publicRoot}/index.html`,html=await fs.readFile(htmlFile,'utf8'),fsSyncProbe=await fs.readFile('performance/phase2-verification/probe.js','utf8');let replaced=false;
const updated=html.replace(/<head><script>([\s\S]*?)<\/script>/,(_,script)=>{const start=script.indexOf('(function(){');if(start<0||!script.slice(start).includes('Verification probe requires isolated local origin'))throw Error('Unknown test-only inline script');replaced=true;return '<head><script>'+script.slice(0,start)+fsSyncProbe+'</script>'});
if(!replaced)throw Error('Probe script missing');await fs.writeFile(htmlFile,updated);
const identity=JSON.parse(await fs.readFile(`${base}/capacitor-build-identity.json`,'utf8')),hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
let unchanged=0;
for(const item of identity.files){const bytes=await fs.readFile(`${publicRoot}/${item.file}`);if(item.file==='index.html'){item.bytes=bytes.length;item.sha256=hash(bytes)}else{if(hash(bytes)!==item.sha256)throw Error('Baseline business asset modified: '+item.file);unchanged++}}
identity.at=new Date().toISOString();identity.harnessRevision='native-readiness-late-bridge-and-atomic-file-v2';identity.baselineOrigin=base;identity.unchangedNonHtmlAssets=unchanged;identity.qualifications=['Only test probe/native subclass/benchmark changed; baseline business JS/assets byte-identical to original measured baseline. No real app or Production deployment.'];
await fs.writeFile(`${root}/capacitor-build-identity.json`,JSON.stringify(identity,null,2));await fs.cp(`${base}/source-maps`,`${root}/source-maps`,{recursive:true});console.log(JSON.stringify({root,unchangedBusinessAssets:unchanged,probeSha256:hash(fsSyncProbe)}));
