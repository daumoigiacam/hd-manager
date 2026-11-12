import {importPinnedVerificationKey} from './pinnedVerificationKey.js';
import {restoreOfflineAppSession} from './offlineAppSession.js';
import {currentSearchTrace,searchMark} from './crmSearchTrace.js';
import {startupSpan} from '../services/offlineStartupTrace.js';
const capabilities={
 'attendancePeriod.assignWorkRole':'attendancePeriod.assignWorkRole','attendancePeriod.read':'attendancePeriod.read','attendancePeriod.readAll':'attendancePeriod.readAll','attendancePeriod.employeeConfirm':'attendancePeriod.employeeConfirm','attendancePeriod.managerConfirm':'attendancePeriod.managerConfirm',
 'salarySettlement.read':'salarySettlement.read','salarySettlement.pay':'salarySettlement.pay','salarySettlement.acknowledge':'salarySettlement.acknowledge','salarySettlement.reconcile':'salarySettlement.reconcile',
 'attendanceRequest.create':'attendanceRequest.create','attendanceRequest.read':'attendanceRequest.read','attendanceRequest.approve':'attendanceRequest.approve','attendanceRequest.reject':'attendanceRequest.reject',
 'salaryAdvance.create':'salaryAdvance.create','salaryAdvance.approve':'salaryAdvance.approve','salaryAdvance.reject':'salaryAdvance.reject','salaryAdvance.archive':'salaryAdvance.archive',
 'employeeProfile.create':'employeeProfile.create','employeeProfile.update':'employeeProfile.update','employeeProfile.archive':'employeeProfile.archive',
 'attendance.check_in':'attendance.check_in',
 'attendance.check_out':'attendance.check_out',
 'payroll.lock':'payroll.lock',
 'payroll.adjust':'payroll.adjust',
 'deliveryReport.create':'deliveryReports.create',
 'deliveryReport.update':'deliveryReports.update',
 'deliveryReport.archive':'deliveryReports.archive',
 'order.read':'orders.read',
 'order.create':'orders.create',
 'order.update':'orders.update',
 'order.archive':'orders.archive',
 'stockCount.create':'stockCounts.create',
 'stockCount.update':'stockCounts.update',
 'stockCount.archive':'stockCounts.archive',
 'warehouseImport.create':'warehouseImports.create',
 'warehouseImport.update':'warehouseImports.update',
 'warehouseImport.archive':'warehouseImports.archive',
 'warehouseDispatch.create':'warehouseDispatches.create',
 'warehouseDispatch.update':'warehouseDispatches.update',
 'warehouseDispatch.archive':'warehouseDispatches.archive',
 'home.read':'home.read',
 'customer.history.read':'customers.history.read',
 'customer.read':'customers.read',
 'customer.create':'customers.create',
 'customer.update':'customers.update',
 'customer.archive':'customers.archive',
};
// Pin the public key in the Development build. The private key stays server-side.
// Native secure storage owns signedGrant and highWaterMs; neither is a password.
export async function createOfflineCustomerAuthorizer({publicKey,crypto=globalThis.crypto,secureStore,expected,now=Date.now,maxLifetimeMs=86400000,clockSkewMs=0}){
 if(!Number.isInteger(clockSkewMs)||clockSkewMs<0||clockSkewMs>5000)throw new Error('Invalid offline clock skew policy');
 const imported=startupSpan('grant.import-key');
 const reuse=import.meta.env?.MODE==='emulator'&&import.meta.env?.VITE_NATIVE_VERIFY_KEY_REUSE==='true';
 const key=await (reuse?importPinnedVerificationKey(publicKey,crypto):crypto.subtle.importKey('jwk',publicKey,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']));imported();
 const decode=s=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
 let tail=Promise.resolve();
 return function authorize({scope,kind}){
  const task=tail.then(async()=>{
   const traceId=currentSearchTrace();
   if(scope.principalId!==expected.principalId||scope.tenantId!==expected.tenantId||scope.permissionRevision!==expected.permissionRevision||scope.sessionId!==expected.sessionId)throw new Error('Offline grant scope mismatch');
   const secureRead=startupSpan('grant.secure-read');
   const verify=async(stored,advance)=>{
   secureRead();
   searchMark(traceId,'grant-store-read-end');
   if(!stored?.signedGrant||stored.revoked)throw new Error('Offline grant unavailable');
   const parts=stored.signedGrant.split('.');if(parts.length!==3)throw new Error('Invalid offline grant');
   const parse=s=>JSON.parse(new TextDecoder().decode(decode(s)));
   const header=parse(parts[0]);if(header.alg!=='RS256'||header.typ!=='JWT')throw new Error('Invalid grant algorithm');
   searchMark(traceId,'grant-signature-start');
   const signature=startupSpan('grant.signature');
   if(!await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,decode(parts[2]),new TextEncoder().encode(parts[0]+'.'+parts[1])))throw new Error('Offline grant signature rejected');
   signature();
   searchMark(traceId,'grant-signature-end');
   const decoded=startupSpan('grant.decode-payload');
   const grant=parse(parts[1]),at=now();decoded({encodedCharacters:parts[1].length});
   const identityChecked=startupSpan('permission.identity-validation');
   try{if(Object.entries(expected).some(([k,v])=>{const tenant=k==='tenantId'?startupSpan('permission.tenant-validation'):null;try{return grant[k]!==v;}finally{tenant?.();}}))throw new Error('Offline grant identity mismatch');}finally{identityChecked();}
   const lifetimeChecked=startupSpan('permission.session-validity');
   try{if(!Number.isSafeInteger(grant.issuedAtMs)||!Number.isSafeInteger(grant.expiresAtMs)||grant.expiresAtMs<=grant.issuedAtMs||grant.expiresAtMs-grant.issuedAtMs>maxLifetimeMs)throw new Error('Invalid offline lifetime');
   if(at+clockSkewMs<grant.issuedAtMs||!Number.isFinite(stored.highWaterMs)||at+clockSkewMs<stored.highWaterMs||at>=grant.expiresAtMs)throw new Error('Offline grant expired or clock rolled back');
   }finally{lifetimeChecked();}
   const capabilityChecked=startupSpan('permission.capability-validation');
   try{if(kind==='app.session'){
    // Signature, all six identity fields, time/rollback and durable ownership
    // checks remain the same. This grants shell access, never module access.
    if(grant.appSession){restoreOfflineAppSession(grant,scope);}
    else if(!Array.isArray(grant.capabilities)||!grant.capabilities.includes('customers.read'))throw Error('Signed Core App session required');
   }else if(!capabilities[kind]||!Array.isArray(grant.capabilities)||!grant.capabilities.includes(capabilities[kind]))throw new Error('Offline capability denied');
   }finally{capabilityChecked();}
   // Recheck native login ownership before persisting the clock watermark.
   searchMark(traceId,'grant-watermark-start');
   const watermark=startupSpan('grant.watermark');
   await advance(stored.signedGrant,at);watermark();
   searchMark(traceId,'grant-watermark-end');
   if(now()>=grant.expiresAtMs)throw new Error('Offline grant expired during verification');
   return grant;
   };
   searchMark(traceId,'grant-store-read-start');
   if(secureStore.withRecord)return secureStore.withRecord(verify);
   return verify(await secureStore.load(),(grant,at)=>secureStore.advanceHighWater(grant,at));
  });
  tail=task.catch(()=>{});return task;
 };
}
