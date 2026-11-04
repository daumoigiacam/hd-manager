import fs from'node:fs/promises';import path from'node:path';import crypto from'node:crypto';
const root=path.resolve('test-results/performance-upgrade-20261103'),pairs=[['baseline-native-v3','baseline-native-v4'],['after-reopen-cache','after-reopen-native-v4']];
const hash=async file=>crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex');
for(const[source,target]of pairs){
 const from=path.join(root,source),to=path.join(root,target);if(!to.startsWith(root+path.sep))throw Error('Unsafe destination');await fs.mkdir(to);
 const native=path.join(to,'capacitor-project'),original=path.join(from,'capacitor-project');
 await fs.cp(original,native,{recursive:true,force:false,errorOnExist:true,filter:file=>!path.relative(original,file).split(path.sep).some(part=>['build','.gradle','.kotlin'].includes(part))});
 await fs.copyFile('performance/phase2-verification/VerificationActivity.java',path.join(native,'app/src/main/java/com/hdmanager/app/VerificationActivity.java'));
 await fs.copyFile('performance/phase2-verification/CapacitorBenchmark.java',path.join(native,'macrobenchmark/src/main/java/com/hdmanager/caplab/benchmark/CapacitorBenchmark.java'));
 const identity=JSON.parse(await fs.readFile(path.join(from,'capacitor-build-identity.json'),'utf8'));
 for(const row of identity.files)if(await hash(path.join(original,'app/src/main/assets/public',row.file))!==row.sha256||await hash(path.join(native,'app/src/main/assets/public',row.file))!==row.sha256)throw Error('Web asset parity failed: '+row.file);
 const prior=identity.derivedNativeHarness;
 identity.derivedNativeHarness={...prior,version:4,at:new Date().toISOString(),originalBuild:source,webAssetsByteIdentical:identity.files.length,nativeVerificationSourceSha256:await hash('performance/phase2-verification/VerificationActivity.java'),macroSourceSha256:await hash('performance/phase2-verification/CapacitorBenchmark.java'),nativeDrawWitness:'actual decor onDraw after source/commit and two JS animation frames; unchanged content, no fake badge',qualification:'Only isolated native verification and Macrobenchmark code changed; all business web assets and production MainActivity remain byte-identical to the named original build.'};
 await fs.writeFile(path.join(to,'capacitor-build-identity.json'),JSON.stringify(identity,null,2));console.log(JSON.stringify({source,target,identicalWebAssets:identity.files.length}));
}
