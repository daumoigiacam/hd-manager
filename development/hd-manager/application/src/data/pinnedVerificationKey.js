// Only a pinned PUBLIC CryptoKey is reused. Never store claims/grants or a
// successful authorization result. Every call retains full signature/policy checks.
const providers=new WeakMap();
export function importPinnedVerificationKey(publicKey,crypto=globalThis.crypto){
 const provider=crypto.subtle;let keys=providers.get(provider);if(!keys){keys=new Map();providers.set(provider,keys);}
 const serialized=JSON.stringify(publicKey);
 if(keys.has(serialized))return keys.get(serialized);
 const pending=provider.importKey('jwk',JSON.parse(serialized),{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
 keys.set(serialized,pending);if(keys.size>4)keys.delete(keys.keys().next().value);
 void pending.catch(()=>{if(keys.get(serialized)===pending)keys.delete(serialized);});return pending;
}
