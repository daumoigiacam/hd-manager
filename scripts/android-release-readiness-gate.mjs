import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
const fail=code=>{throw Error(code);};
export async function verifyAndroidReadiness(report,{expectedSource,readFile=fs.readFile}={}){
  if(!/^[a-f0-9]{40}$/.test(expectedSource||'')||report.sourceCommit!==expectedSource||report.status!=='READY')fail('EXACT_COMMIT_READINESS_REQUIRED');
  const p=report.environment;
  if(!p||p.projectId?.startsWith('demo-')||p.projectId==='hd-manager-c5839'||p.mock===true||p.localhost===true||p.firebaseAuthVerified!==true)fail('REAL_NONPRODUCTION_FIREBASE_EVIDENCE_REQUIRED');
  const urls=[p.appOrigin,p.apiBaseUrl].map(x=>new URL(x));
  if(urls.some(u=>u.protocol!=='https:'||u.username||u.password||u.hostname==='localhost'||/^[\d.]+$/.test(u.hostname)||u.hostname.endsWith('.localhost')))fail('REAL_HTTPS_EVIDENCE_REQUIRED');
  for(const name of ['session','snapshot','offlineRead','offlineWrite','offlineReload','outboxPayloadRestored','reconnect','idempotency','tenantIsolation','financialReconciliation','inventoryReconciliation'])if(report.tests?.[name]?.status!=='PASS')fail('READINESS_TEST_MISSING_'+name);
  const sourceRoot='development/hd-manager/application';
  if(report.sourceRoot!==sourceRoot)fail('CANONICAL_SOURCE_ROOT_REQUIRED');
  const requiredFiles=[...['package.json','package-lock.json','vite.config.js','src/main.jsx','src/config/offlineRuntimeEnvironment.js','src/config/offlineRuntimeBuildConfig.js','src/data/webOfflinePlatform.js','src/data/webOfflineDatabase.js','src/data/webOfflineSqlWorker.js','src/data/webEncryptedVault.js','src/services/useNativeOfflineWorkspace.js','src/services/webOfflineShell.js'].map(file=>sourceRoot+'/'+file),'functions/offlineTrustedBackend.mjs','functions/offlineTrustedApi.cjs','functions/offlineTrustedActor.cjs','functions/offlineTrustedHttp.cjs','functions/offlineTrustedReadApi.mjs','functions/offlineScopedBusinessSource.mjs','functions/offlineServerEnvironment.cjs','android/app/build.gradle','capacitor.config.json'];
  if(!Array.isArray(report.files)||!requiredFiles.every(file=>report.files.some(f=>f.file===file))||new Set(report.files.map(f=>f.file)).size!==report.files.length)fail('SOURCE_INVENTORY_REQUIRED');
  for(const row of report.files){if(!/^(src|functions|scripts|android|development\/hd-manager\/application)\/[A-Za-z0-9_./-]+$|^(package(-lock)?\.json|vite\.config\.js|capacitor\.config\.json)$/.test(row.file)||row.file.split('/').includes('..')||! /^[a-f0-9]{64}$/.test(row.sha256))fail('INVALID_SOURCE_INVENTORY');if(createHash('sha256').update(await readFile(row.file)).digest('hex')!==row.sha256)fail('READINESS_SOURCE_DRIFT');}
  return true;
}
if(process.argv[1]?.endsWith('android-release-readiness-gate.mjs')){
  const report=JSON.parse(await fs.readFile('owner-readiness/production-readiness.json','utf8'));
  await verifyAndroidReadiness(report,{expectedSource:process.env.EXPECTED_SOURCE});
  if(!/^\d+$/.test(process.env.HD_READINESS_RUN_ID||'')||!process.env.GH_TOKEN)fail('READINESS_PROVENANCE_REQUIRED');
  const repo=process.env.GITHUB_REPOSITORY;if(!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo||''))fail('GITHUB_REPOSITORY_REQUIRED');
  const r=await fetch(`https://api.github.com/repos/${repo}/actions/runs/${process.env.HD_READINESS_RUN_ID}`,{headers:{authorization:'Bearer '+process.env.GH_TOKEN,accept:'application/vnd.github+json'},signal:AbortSignal.timeout(15000)});
  if(!r.ok)fail('READINESS_RUN_UNAVAILABLE');const run=await r.json();if(run.head_sha!==process.env.EXPECTED_SOURCE||run.conclusion!=='success'||run.head_repository?.full_name!==repo)fail('READINESS_RUN_PROVENANCE_MISMATCH');
  console.log(JSON.stringify({status:'READINESS_SOURCE_AND_RUN_VERIFIED',source:process.env.EXPECTED_SOURCE}));
}
