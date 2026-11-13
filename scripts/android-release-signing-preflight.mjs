import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const required=process.argv.includes('--require-secrets'),metadataOnly=process.argv.includes('--metadata-only');
const store=process.env.HD_RELEASE_STORE_FILE||'C:/Users/daumo/hdmanager-upload-key.jks';
const alias=process.env.HD_RELEASE_KEY_ALIAS||'hdmanager-upload';
const expected='d5d616282282ea86ac1a99247b785fdedec9b93a399a6e3f03037693b236a43d';
const result={at:new Date().toISOString(),alias,officialKeystoreSha256:expected,passwordPrinted:false,newKeyCreated:false};
try{
  if(alias!=='hdmanager-upload')throw Error('OFFICIAL_ALIAS_MUST_NOT_CHANGE');
  const bytes=await fs.readFile(store);result.actualKeystoreSha256=createHash('sha256').update(bytes).digest('hex');
  if(result.actualKeystoreSha256!==expected)throw Error('OFFICIAL_KEYSTORE_BYTES_MISMATCH');
  result.missing=['HD_RELEASE_STORE_PASSWORD','HD_RELEASE_KEY_PASSWORD'].filter(k=>!process.env[k]);
  if(required&&result.missing.length)throw Error('OFFICIAL_SIGNING_SECRETS_MISSING');
  const java=process.env.JAVA_HOME?path.join(process.env.JAVA_HOME,'bin',process.platform==='win32'?'java.exe':'java'):'java';
  const env={...process.env};if(metadataOnly){delete env.HD_RELEASE_STORE_PASSWORD;delete env.HD_RELEASE_KEY_PASSWORD;}
  const output=execFileSync(java,['scripts/android/HdSigningMetadata.java',store,alias],{encoding:'utf8',env,stdio:['ignore','pipe','pipe'],timeout:30000,windowsHide:true});
  result.metadata=JSON.parse(output.trim());
  // Public certificate read from the preserved 1.0.7 Production APK. A
  // different key cannot safely update that installation, even if it signs.
  result.upgradeBaselineCertificateSha256='d5c0d0187e27d7909b9024e83287c7a2d3823252dd66a5617351a737261ccb35';
  if(result.metadata.privateKeyVerified&&result.metadata.certificateSha256!==result.upgradeBaselineCertificateSha256)throw Error('OFFICIAL_KEY_CANNOT_UPDATE_PRESERVED_PRODUCTION_APK');
  result.status=result.metadata.privateKeyVerified?'SIGNING_READY':'BLOCKED_OFFICIAL_SIGNING_SECRETS_MISSING';
  if(required&&result.status!=='SIGNING_READY')throw Error('PRIVATE_KEY_SIGNING_NOT_VERIFIED');
}catch(error){result.status='BLOCKED';result.code=/^[A-Z_]+$/.test(error.message)?error.message:'SIGNING_INSPECTION_FAILED';process.exitCode=required?1:0;}
if(process.env.HD_SIGNING_REPORT_FILE)await fs.writeFile(process.env.HD_SIGNING_REPORT_FILE,JSON.stringify(result,null,2));
console.log(JSON.stringify(result));
