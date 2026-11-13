import fs from 'node:fs/promises';
import {resolveOfflineRuntimeEnvironment} from '../development/hd-manager/application/src/config/offlineRuntimeEnvironment.js';
const readiness=JSON.parse(await fs.readFile('owner-readiness/production-readiness.json','utf8'));
const p=resolveOfflineRuntimeEnvironment(readiness.productionConfiguration);
if(p.environment!=='production'||!process.env.GITHUB_ENV||! /^[a-f0-9]{40}$/.test(process.env.EXPECTED_SOURCE||''))throw Error('VERIFIED_PRODUCTION_CONFIGURATION_REQUIRED');
const entries={VITE_DATA_MODE:'cloud',VITE_FIREBASE_PROJECT_ID:p.projectId,VITE_HD_APP_ID:p.appId,VITE_FIREBASE_EMULATORS:'false',VITE_FIRESTORE_READ_WORKER:'true',VITE_IDENTITY_AUTH_REGION:'',
 VITE_OFFLINE_RUNTIME:'trusted-v1',VITE_OFFLINE_ENVIRONMENT:'production',VITE_OFFLINE_API_BASE_URL:p.apiBaseUrl,
 VITE_OFFLINE_APP_ORIGIN:p.appOrigin,VITE_OFFLINE_VERIFYING_JWK:JSON.stringify(p.publicKey),VITE_OFFLINE_MAX_MS:String(p.maxOfflineMs),VITE_NATIVE_MINIMAL_ENTRY:'true',VITE_OFFLINE_CUSTOMER_PILOT:'false',VITE_HD_BUILD_ID:process.env.EXPECTED_SOURCE};
for(const[k,v]of Object.entries(entries)){if(typeof v!=='string'||/[\r\n]/.test(v))throw Error('INVALID_BUILD_ENVIRONMENT');await fs.appendFile(process.env.GITHUB_ENV,k+'='+v+'\n');}
console.log(JSON.stringify({status:'PRODUCTION_BUILD_CONFIGURATION_PREPARED',project:p.projectId,appId:p.appId,apiBaseUrl:p.apiBaseUrl,privateKeyIncluded:false}));
