import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
const load=async path=>{
 const {outputFiles}=await build({entryPoints:[fileURLToPath(new URL(path,import.meta.url))],bundle:true,write:false,format:'esm',platform:'node',define:{'import.meta.env':'{}'}});
 return import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].contents).toString('base64'));
};
const {renewOfflineGrant}=await load('../src/data/offlineGrantRenewal.js');
const {createOfflineSecureSessionStore}=await load('../src/data/offlineSecureSessionStore.js');
const {publicKey,privateKey}=generateKeyPairSync('rsa',{modulusLength:2048}),jwk=publicKey.export({format:'jwk'});
const expected={projectId:'demo-test',tenantId:'a',principalId:'u',permissionRevision:'r',deviceId:'d',sessionId:'s'};
const at=100000;
const grant=(change={})=>({...expected,issuedAtMs:at-1000,expiresAtMs:at+1000,capabilities:['customers.read'],...change});
const envelope=value=>{const message=Buffer.from(JSON.stringify({alg:'RS256',typ:'JWT'})).toString('base64url')+'.'+Buffer.from(JSON.stringify(value)).toString('base64url');return{scope:expected,issuedAtMs:value.issuedAtMs,signedGrant:message+'.'+sign('RSA-SHA256',Buffer.from(message),privateKey).toString('base64url')};};
function fixture(){let record={identity:expected,signedGrant:envelope(grant()).signedGrant,highWaterMs:at,databaseBinding:{id:'existing-encrypted-db'}};const store=createOfflineSecureSessionStore({key:'renew-test-'+Math.random(),read:async()=>record,write:async value=>{record=value;}});return{store,read:()=>record};}
const renew=(f,fresh,extra={})=>renewOfflineGrant({publicKey:jwk,secureStore:f.store,expected,currentGrant:grant(),fresh,maxLifetimeMs:60000,isCurrent:()=>true,now:()=>at,...extra});
test('signed same-authority renewal survives secure-store reload and retains database, owner and bounded old read lease revision',async()=>{
 const f=fixture(),before=f.read(),fresh=envelope(grant({issuedAtMs:at,expiresAtMs:at+10000}));
 const checked=await renew(f,fresh);assert.equal(checked.expiresAtMs,at+10000);assert.equal(f.read().signedGrant,fresh.signedGrant);assert.equal(f.read().databaseBinding,before.databaseBinding);assert.equal(f.store.revision(),0);assert.deepEqual(await f.store.readIdentity(),expected);
});
test('forged signature, changed rights/tenant, expiry and stale responses cannot extend access',async()=>{
 for(const [value,extra]of[
  [{...envelope(grant({expiresAtMs:at+10000})),signedGrant:envelope(grant()).signedGrant.slice(0,-9)+'invalidxx'},{}],
  [envelope(grant({capabilities:['customers.read','customers.update'],expiresAtMs:at+10000})),{}],
  [envelope(grant({tenantId:'b',expiresAtMs:at+10000})),{}],
  [envelope(grant({expiresAtMs:at-1})),{}],
  [envelope(grant({issuedAtMs:at-2000,expiresAtMs:at+10000})),{}],
  [envelope(grant({expiresAtMs:at+10000})),{isCurrent:()=>false}],
 ]){const f=fixture(),before=f.read();await assert.rejects(renew(f,value,extra));assert.equal(f.read(),before);}
});
test('logout queued during renewal is not undone and replacement-account data cannot be overwritten',async()=>{
 const f=fixture(),fresh=envelope(grant({issuedAtMs:at,expiresAtMs:at+10000}));
 const renewing=renew(f,fresh);const logout=f.store.revoke(expected);await renewing;await logout;assert.equal(f.read().revoked,true);
 const b={identity:{...expected,tenantId:'b'},signedGrant:'b',highWaterMs:at};await f.store.replace(b);await assert.rejects(renew(f,fresh));assert.equal(f.read(),b);
});
