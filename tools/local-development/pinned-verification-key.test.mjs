import test from 'node:test';import assert from 'node:assert/strict';import {webcrypto,generateKeyPairSync,sign} from 'node:crypto';
import {importPinnedVerificationKey} from '../../development/hd-manager/application/src/data/pinnedVerificationKey.js';
const pair=()=>generateKeyPairSync('rsa',{modulusLength:2048});
test('same public key reused, signatures still independently checked; different key never reused',async()=>{
 const a=pair(),b=pair(),jwk=a.publicKey.export({format:'jwk'}),other=b.publicKey.export({format:'jwk'});let imports=0,verifications=0;
 const crypto={subtle:{importKey(...args){imports++;return webcrypto.subtle.importKey(...args);},verify(...args){verifications++;return webcrypto.subtle.verify(...args);}}};
 const keys=await Promise.all([1,2,3].map(()=>importPinnedVerificationKey(jwk,crypto)));assert.equal(imports,1);assert.equal(keys[0],keys[2]);
 for(let i=0;i<3;i++){const data=Buffer.from('independent-payload-'+i),signature=sign('RSA-SHA256',data,a.privateKey);assert.equal(await crypto.subtle.verify('RSASSA-PKCS1-v1_5',keys[i],signature,data),true);assert.equal(await crypto.subtle.verify('RSASSA-PKCS1-v1_5',keys[i],signature,Buffer.from('tampered-'+i)),false);}
 assert.equal(verifications,6);const keyB=await importPinnedVerificationKey(other,crypto);assert.equal(imports,2);assert.notEqual(keyB,keys[0]);
 const data=Buffer.from('cross-key');assert.equal(await crypto.subtle.verify('RSASSA-PKCS1-v1_5',keyB,sign('RSA-SHA256',data,a.privateKey),data),false);
});
test('failed imports are retryable; crypto-provider identity is isolated',async()=>{
 const a=pair(),jwk=a.publicKey.export({format:'jwk'});let count=0;const provider={subtle:{importKey(...args){count++;return count===1?Promise.reject(Error('controlled import failure')):webcrypto.subtle.importKey(...args);}}};
 await assert.rejects(importPinnedVerificationKey(jwk,provider),/controlled/);const key=await importPinnedVerificationKey(jwk,provider);assert.equal(count,2);assert.equal(await importPinnedVerificationKey(jwk,provider),key);const independent={subtle:{importKey:(...args)=>webcrypto.subtle.importKey(...args)}};assert.notEqual(await importPinnedVerificationKey(jwk,independent),key);
});
