import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import {unzipSync} from 'fflate';
import {loadNativeListenerReleasePatch} from './native-listener-release-patch.mjs';
import {verifyNativePilotWebBoundary} from './helpers/native-pilot-source-boundary.mjs';
const root='test-results/performance-upgrade-20261103',cohort='after-native-listener-release';
const base=JSON.parse(await fs.readFile(`${root}/after-listener-scope/source-inputs.json`));
const current=JSON.parse(await fs.readFile(`${root}/${cohort}/source-inputs.json`));
if(JSON.stringify(base.files)!==JSON.stringify(current.files))throw Error('App source drift; do not attribute this comparison to the native bridge alone');
const baseIdentity=JSON.parse(await fs.readFile(`${root}/after-listener-scope/capacitor-build-identity.json`));
const currentIdentity=JSON.parse(await fs.readFile(`${root}/${cohort}/capacitor-build-identity.json`));
const version=async name=>JSON.parse(await fs.readFile(`${root}/${name}/capacitor-project/app/src/main/assets/public/version.json`));
const webBoundary=verifyNativePilotWebBoundary(baseIdentity,currentIdentity,await version('after-listener-scope'),await version(cohort));
const patch=await loadNativeListenerReleasePatch(process.cwd()),files=[];
for(const variant of ['release','diagnostic']){
 const file=`${root}/${cohort}/capacitor-project/app/build/outputs/apk/${variant}/app-${variant}.apk`,bytes=await fs.readFile(file);
 const entries=unzipSync(bytes,{filter:entry=>entry.name==='assets/native-bridge.js'||entry.name.startsWith('assets/public/')&&!entry.name.endsWith('/')});
 const nativeBridge=entries['assets/native-bridge.js'];
 if(!nativeBridge||crypto.createHash('sha256').update(nativeBridge).digest('hex')!==patch.sha256)throw Error('Packaged native bridge is missing or not the reviewed patch');
 if(Object.keys(entries).filter(name=>name.startsWith('assets/public/')).length!==currentIdentity.files.length)throw Error('Packaged public asset count differs from build receipt');
 for(const row of currentIdentity.files){const data=entries['assets/public/'+row.file];if(!data||data.length!==row.bytes||crypto.createHash('sha256').update(data).digest('hex')!==row.sha256)throw Error('Packaged web asset differs from build receipt: '+row.file)}
 files.push({file,variant,bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),nativeBridgeBytes:nativeBridge.length,nativeBridgeSha256:patch.sha256});
}
const result={at:new Date().toISOString(),status:'PACKAGED_ASSET_AND_SOURCE_BOUNDARY_VERIFIED_NOT_ANDROID_ACCEPTANCE',cohort,files,
 sourceControl:{sameAppInputs:true,webBoundary,files:current.files.length,baseline:'after-listener-scope',sourceManifest:root+'/'+cohort+'/source-inputs.json'},
 baseSha256:patch.baseSha256,patchedSha256:patch.sha256,nativeBridgeByteDelta:Buffer.byteLength(patch.code)-Buffer.byteLength(await fs.readFile('node_modules/@capacitor/android/capacitor/src/main/assets/native-bridge.js')),
 productionProjectModified:false,nodeModulesModified:false,rollback:'Do not enable QA pilot flag; use unchanged native bridge asset. Production app Gradle and SDK files were never patched.'};
await fs.writeFile(`${root}/native-listener-release-apk-proof.json`,JSON.stringify(result,null,2));
console.log(JSON.stringify(result));
