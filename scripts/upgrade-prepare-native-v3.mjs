import fs from'node:fs/promises';import path from'node:path';import crypto from'node:crypto';
const root=path.resolve('test-results/performance-upgrade-20261103'),pairs=[['baseline-native-probe-v2','baseline-native-v3'],['after-memo-search','after-memo-native-v3']];
const hash=async file=>crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex');
for(const[source,target]of pairs){
 const from=path.join(root,source),to=path.join(root,target);if(!to.startsWith(root+path.sep))throw Error('Unsafe generated destination');
 await fs.mkdir(to); // No overwrite of a prior measured cohort.
 const native=path.join(to,'capacitor-project'),sourceNative=path.join(from,'capacitor-project');
 await fs.cp(sourceNative,native,{recursive:true,force:false,errorOnExist:true,filter:file=>!path.relative(sourceNative,file).split(path.sep).some(part=>['build','.gradle','.kotlin'].includes(part))});
 await fs.copyFile('performance/phase2-verification/VerificationActivity.java',path.join(native,'app/src/main/java/com/hdmanager/app/VerificationActivity.java'));
 await fs.copyFile('performance/phase2-verification/CapacitorBenchmark.java',path.join(native,'macrobenchmark/src/main/java/com/hdmanager/caplab/benchmark/CapacitorBenchmark.java'));
 const identity=JSON.parse(await fs.readFile(path.join(from,'capacitor-build-identity.json'),'utf8'));
 for(const row of identity.files){const sourceFile=path.join(sourceNative,'app/src/main/assets/public',row.file),targetFile=path.join(native,'app/src/main/assets/public',row.file);if(await hash(sourceFile)!==row.sha256||await hash(targetFile)!==row.sha256)throw Error('Business web asset parity failed: '+row.file)}
 identity.derivedNativeHarness={at:new Date().toISOString(),version:3,originalBuild:source,webAssetsByteIdentical:identity.files.length,nativeVerificationSourceSha256:await hash('performance/phase2-verification/VerificationActivity.java'),macroSourceSha256:await hash('performance/phase2-verification/CapacitorBenchmark.java'),qualification:'Only the isolated native measurement subclass and test harness were refreshed. App/MainActivity/business JS/assets remain the named original build. No build, APK installation or device operation performed by this preparation script.'};
 await fs.writeFile(path.join(to,'capacitor-build-identity.json'),JSON.stringify(identity,null,2));console.log(JSON.stringify({source,target,identicalWebAssets:identity.files.length}));
}
