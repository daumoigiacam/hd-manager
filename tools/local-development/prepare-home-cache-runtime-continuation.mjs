import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {workspace} from './environment.mjs';
const root=path.join(workspace,'development/hd-manager/application/src/data');
const file=path.join(root,'bootstrapOfflineCustomer.js');
const backup=path.join(workspace,'.local-dev/source-backups/home-cache-dev35-continuation');await fs.mkdir(backup,{recursive:true});
let original=(await fs.readFile(file,'utf8')).replace(/\r\n/g,'\n');
if(original.includes('assembleOfflineCustomerRuntime'))throw Error('Continuation already applied');
await fs.writeFile(path.join(backup,'bootstrapOfflineCustomer.js'),original);
const boundary=' let releaseForegroundRead=()=>{};';
const start=original.indexOf(boundary);if(start<0)throw Error('Exact post-LOCAL_READY boundary required');
const end=original.lastIndexOf('\n}');
const body=original.slice(start,end);
const args=['database','session','readLease','fullAuthorize','verifiedGrant','appSession','expected','maxLifetimeMs','publicKey','secureStore','projectId','environment','digest','uuid','beforeReceiptCommit','launchCache','launchCacheAccess','loadHomeRepository','loadHomeSync','loadAttendanceProviders','transport','online','events','onPhase','deferNetwork','backgroundHomeSync'];
const declarations=["import {startupMark} from '../services/offlineStartupTrace.js';","import {createOfflineReadLease} from './offlineReadLease.js';","import {CUSTOMER_DIRECTORY_PAGE_SIZE} from './offlineCustomerQuery.js';","import {createBusinessSearchForegroundGate} from '../services/businessSearchForegroundGate.js';"];
const assembled=declarations.join('\n')+'\n// Exact existing Runtime assembly, loaded only after authenticated SQLite open.\nexport async function assembleOfflineCustomerRuntime({'+args.join(',')+'}){\n'+body+'\n}\n';
let bootstrap=original.slice(0,start);
for(const declaration of declarations.slice(2))bootstrap=bootstrap.replace(declaration+'\n','');
bootstrap+=` // Loading code cannot publish a Runtime or bypass the verified owner.
 let continuation;
 try{continuation=await import('./assembleOfflineCustomerRuntime.js');}
 catch(error){readLease?.close();session.close();await database.close();throw error;}
 return continuation.assembleOfflineCustomerRuntime({${args.join(',')}});
}
`;
await fs.writeFile(path.join(root,'assembleOfflineCustomerRuntime.js'),assembled);
await fs.writeFile(file,bootstrap);
const build=path.join(workspace,'tools/local-development/build-android.mjs');await fs.copyFile(build,path.join(backup,'build-android.mjs'));let buildSource=await fs.readFile(build,'utf8');if(!buildSource.includes('1.0.12-local-dev.35'))throw Error('Restore dev35 baseline first');await fs.writeFile(build,buildSource.replaceAll('1.0.12-local-dev.35','1.0.12-local-dev.37').replaceAll('26111145','26111147'));
const sha=x=>createHash('sha256').update(x).digest('hex');
const proof={at:new Date().toISOString(),version:'dev37',bodyBytes:Buffer.byteLength(body),originalBodySha256:sha(body),movedBodySha256:sha(assembled.slice(assembled.indexOf(boundary),assembled.lastIndexOf('\n}'))),arguments:args,newRuntimeOwner:false,originalBusinessBodyUnchanged:true,productionChanged:false};
if(proof.originalBodySha256!==proof.movedBodySha256)throw Error('Business body changed during move');
await fs.writeFile(path.join(workspace,'.local-dev/runtime/dev37-continuation-proof.json'),JSON.stringify(proof,null,2));console.log(JSON.stringify(proof));
