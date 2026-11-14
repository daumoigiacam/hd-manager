// Strict transactional DAO and token doubles for adapter unit tests only.
// Not Firebase Emulator, HTTPS, APK or Production acceptance evidence.
import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync} from 'node:crypto';
import {createTrustedOfflineApi} from '../../functions/offlineTrustedApi.cjs';
import projector from '../../functions/generated/offlineOriginalDomain.cjs';
import {createOfflineServerEnvironment} from '../../functions/offlineServerEnvironment.cjs';
import {HOME_PERMISSION_MAPPING} from '../../functions/offlineHomeFeed.mjs';
import {createTrustedReadApi,trustedReadCapabilities} from '../../functions/offlineTrustedReadApi.mjs';
import {createTrustedBusinessCommands,trustedBusinessCapabilities} from '../../functions/offlineTrustedCommands.mjs';
import identity from '../../functions/identityCenter.js';
import {bindTestEnvelopes} from './trusted-api-envelope.cjs';
import {createRequire} from 'node:module';
const {FieldValue,FieldPath}=createRequire(new URL('../../functions/package.json',import.meta.url))('firebase-admin/firestore');
export const digest=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
export function trustedCommandFixture({native=false}={}){
 const projectId='hd-trusted-command-contract',appId='hd-trusted-command-contract',root=`artifacts/${appId}/public/data/`,rows=new Map(),tokens={},writes=[];
 let failWrite=null,autoId=0,beforeWrite=null;
 const doc=path=>({path,id:path.split('/').at(-1),get:async()=>snapshot(path),collection:name=>query(path+'/'+name)});
 const snapshot=path=>({...doc(path),exists:rows.has(path),data:()=>structuredClone(rows.get(path))});
 const query=(path,filters=[],orders=[],max=Infinity,after=[])=>({path,filters,orders,max,after,doc:id=>doc(path+'/'+(id||'unit-auto-'+(++autoId))),where:(...f)=>query(path,[...filters,f],orders,max,after),orderBy:(...o)=>query(path,filters,[...orders,o],max,after),limit:n=>query(path,filters,orders,n,after),startAfter:(...a)=>query(path,filters,orders,max,a)});
 const merge=(a,b)=>Object.fromEntries([...new Set([...Object.keys(a||{}),...Object.keys(b)])].map(k=>[k,b[k]===undefined?a[k]:b[k]&&Object.getPrototypeOf(b[k])===Object.prototype?merge(a?.[k],b[k]):b[k]]));
 const db={projectId,doc,collection:path=>query(path),async runTransaction(work,options){
  if(!options?.readOnly&&beforeWrite){const callback=beforeWrite;beforeWrite=null;callback();}
  let writing=false;const pending=[];
  const result=await work({get:async ref=>{
   assert.equal(writing,false,'All authoritative reads precede business/receipt writes');
   if(!ref.filters)return snapshot(ref.path);
   let docs=[...rows.keys()].filter(p=>p.startsWith(ref.path+'/')&&!p.slice(ref.path.length+1).includes('/')).map(snapshot);
   const value=(s,key)=>key==='__name__'?s.id:s.data()[key];
   for(const [key,op,wanted]of ref.filters){assert.equal(typeof key,'string');docs=docs.filter(s=>{const v=value(s,key);if(op==='==')return v===wanted;if(op==='in')return wanted.includes(v);if(op==='array-contains')return Array.isArray(v)&&v.includes(wanted);if(op==='>')return v>wanted;if(op==='>=')return v>=wanted;if(op==='<')return v<wanted;if(op==='<=')return v<=wanted;throw Error('Unsupported query operator '+op);});}
   docs.sort((a,b)=>{for(const [key,dir]of ref.orders){const x=value(a,key),y=value(b,key);if(x!==y)return (x>y?1:-1)*(dir==='desc'?-1:1);}return 0;});
   if(ref.after.length){const i=docs.findIndex(d=>ref.orders.every(([key],n)=>value(d,key)===(ref.after[n]?.id||ref.after[n])));docs=docs.slice(i+1);}
   docs=docs.slice(0,ref.max);return {docs,size:docs.length,empty:!docs.length};
  },set(ref,body,options){writing=true;if(failWrite&&ref.path.includes(failWrite))throw Error('Injected transaction failure');pending.push([ref.path,structuredClone(body),options]);},delete(ref){writing=true;pending.push([ref.path,null]);}});
  for(const [path,body,options]of pending){if(body===null)rows.delete(path);else rows.set(path,options?.merge?merge(rows.get(path),body):body);writes.push(path);}return result;
 }};
 function account(token,tenant,employee,profile={}){
  const identityId='employee_'+employee;tokens[token]={uid:'identity_'+identityId,identityId,companyId:tenant,appUserId:employee,accountType:'employee',aud:projectId,iss:'https://securetoken.google.com/'+projectId,exp:Math.floor(Date.now()/1000)+3600};
  rows.set('identity_accounts/'+identityId,{status:'active',accountType:'employee',companyId:tenant,appUserId:employee});
  if(!rows.has(root+'companies/'+tenant))rows.set(root+'companies/'+tenant,{name:'Unit contract '+tenant,productGroups:['Gà','Vịt'],autoReconcileByOrderCode:false});
  rows.set(root+'employees/'+employee,{companyId:tenant,name:employee,position:'Chủ doanh nghiệp',role:'super_admin',...profile});
 }
 account('a','tenant-a','employee-a');account('b','tenant-b','employee-b');
 const auth={app:{options:{projectId}},async verifyIdToken(token,revoked){assert.equal(revoked,true);if(!tokens[token])throw Object.assign(Error('Invalid fixture token'),{code:'auth/invalid-id-token'});return tokens[token];}};
 const {publicKey,privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
 const environment=createOfflineServerEnvironment({db,auth,projectId,appId,environment:'development',appOrigin:'https://unit-contract.example.com',publicKey:{...publicKey.export({format:'jwk'}),alg:'RS256'}});
 const identityCenter=native?identity.createIdentityCenter({db,admin:{auth:()=>auth,firestore:{FieldValue,FieldPath}},getAppId:()=>appId}):undefined;
 const api=createTrustedOfflineApi({environment,projector,mapping:HOME_PERMISSION_MAPPING,getSigningKey:async()=>privateKey.export({format:'pem',type:'pkcs8'}),createHomeFeed:async()=>{throw Error('Home watcher outside this unit contract');},createReadSources:createTrustedReadApi,deriveReadCapabilities:trustedReadCapabilities,createCommands:createTrustedBusinessCommands,deriveBusinessCapabilities:trustedBusinessCapabilities,identityCenter});
 const envelope=bindTestEnvelopes(api);
 return {db,root,rows,writes,tokens,environment,auth,configuration:{projectId,appId,environment:'development',appOrigin:environment.appOrigin,publicKey:environment.publicKey},getSigningKey:async()=>privateKey.export({format:'pem',type:'pkcs8'}),account,beforeWrite:fn=>{beforeWrite=fn;},failWrite:x=>{failWrite=x;},call:(action,body={},token='a')=>envelope.handle({action,body,token}),raw:(action,body={},token='a')=>envelope.raw({action,body,token}),close:()=>api.close(),seed:(source,id,body)=>rows.set(root+source+'/'+id,structuredClone(body))};
}
export function command(id,kind,entityId,payload,baseRevision=0){return {commandId:id,idempotencyKey:id,kind,entityId,payload,baseRevision,payloadDigest:digest(payload)};}
