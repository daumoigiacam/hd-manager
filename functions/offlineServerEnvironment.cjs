const trusted=new WeakSet();
function createOfflineServerEnvironment({projectId,appId,environment,appOrigin,publicKey,maxOfflineMs=3600000,db,auth}){
 const fail=()=>{throw Error('Invalid trusted Offline server environment');};
 if(!/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(projectId||'')||projectId.startsWith('demo-')||!/^[A-Za-z0-9_-]{1,160}$/.test(appId||'')||!['development','production','isolated-qa'].includes(environment))fail();
 let url;try{url=new URL(appOrigin);}catch{fail();}
 if(url.protocol!=='https:'||url.origin!==appOrigin||url.username||url.password||url.hostname==='localhost'||url.hostname.endsWith('.localhost')||/^[\d.]+$/.test(url.hostname))fail();
 if(process.env.FIRESTORE_EMULATOR_HOST||process.env.FIREBASE_AUTH_EMULATOR_HOST||db?.projectId!==projectId||auth?.app?.options?.projectId!==projectId)fail();
 if((environment==='development'&&projectId==='hd-manager-c5839')||(environment==='production'&&(projectId!=='hd-manager-c5839'||appId!=='hd-manager-production'||appOrigin!=='https://app.hdconnect.net')))fail();
 // Explicit Owner authorization, 2026-11-14. This is a QA namespace in the
 // existing Firebase project, never an alias for the live application's data.
 if(environment==='isolated-qa'&&(projectId!=='hd-manager-c5839'||appId!=='hd-manager-release-qa-20261114'||appOrigin==='https://app.hdconnect.net'))fail();
 if(!Number.isSafeInteger(maxOfflineMs)||maxOfflineMs<60000||maxOfflineMs>86400000||publicKey?.kty!=='RSA'||publicKey.e!=='AQAB'||publicKey.alg!=='RS256'||typeof publicKey.n!=='string'||!/^[A-Za-z0-9_-]{342,}$/.test(publicKey.n)||['d','p','q','dp','dq','qi','oth'].some(k=>Object.hasOwn(publicKey,k)))fail();
 const value=Object.freeze({projectId,appId,environment,appOrigin,maxOfflineMs,publicKey:Object.freeze({...publicKey}),db,auth});trusted.add(value);return value;
}
function isTrustedOfflineServerEnvironment(value,projectId,appId,db){return trusted.has(value)&&value.projectId===projectId&&value.appId===appId&&value.db===db&&db?.projectId===projectId;}
module.exports={createOfflineServerEnvironment,isTrustedOfflineServerEnvironment};
