import schema from '../../performance/offline-first/schema-v1.sql?raw';
import {assertOfflineRuntimeEnvironment} from '../config/offlineRuntimeEnvironment.js';
import {createWebEncryptedVault} from './webEncryptedVault.js';
import {openWebOfflineDatabase} from './webOfflineDatabase.js';
import {createOfflineSecureSessionStore} from './offlineSecureSessionStore.js';
import {createOfflineCustomerAuthorizer} from './offlineCustomerGrant.js';
import {assertOfflineDatabaseBinding} from './offlineDatabaseBinding.js';

export async function createWebCustomerPlatform({projectId,publicKey,environment}) {
  assertOfflineRuntimeEnvironment(environment,projectId);
  if(!globalThis.isSecureContext || location.origin!==environment.appOrigin)throw Error('Offline Web cần đúng secure origin đã cấu hình (HTTPS, hoặc loopback riêng cho Local).');
  const key='offline-customer-session:'+projectId,listeners=new Set();
  const vault=await createWebEncryptedVault({onChange:name=>{if(name===key)for(const listener of listeners)listener();}});
  const digest=async text=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),n=>n.toString(16).padStart(2,'0')).join('');
  const base=createOfflineSecureSessionStore({key,read:()=>vault.readJSON(key),write:value=>vault.writeJSON(key,value)});
  const locked=(method,...args)=>vault.exclusive(key,()=>base[method](...args));
  const secureStore=Object.freeze({...base,withRecord:(...a)=>locked('withRecord',...a),replace:(...a)=>locked('replace',...a),revoke:(...a)=>locked('revoke',...a),advanceHighWater:(...a)=>locked('advanceHighWater',...a),attachDatabaseBinding:(...a)=>locked('attachDatabaseBinding',...a)});
  return Object.freeze({secureStore,digest,
    subscribeIdentityChanges(listener){listeners.add(listener);return()=>listeners.delete(listener);},
    async discardPreparedDatabase(){},
    async installOnlineGrant({grant,verifiedUid}){
      if(grant?.scope?.principalId!==verifiedUid||grant.scope.projectId!==projectId)throw Error('Online browser identity mismatch');
      const candidate={identity:grant.scope,signedGrant:grant.signedGrant,highWaterMs:grant.issuedAtMs,revoked:false};
      const verify=await createOfflineCustomerAuthorizer({publicKey,expected:grant.scope,maxLifetimeMs:environment.maxOfflineMs,clockSkewMs:5000,secureStore:{load:async()=>candidate,advanceHighWater:async()=>{}}});
      await verify({scope:grant.scope,kind:'app.session'});
      const binding=await vault.readJSON('binding:'+await digest(JSON.stringify([projectId,grant.scope.tenantId,verifiedUid])));
      assertOfflineDatabaseBinding(binding,grant.scope);
      if(binding)candidate.databaseBinding=binding;
      await secureStore.replace(candidate);
    },
    async openDatabase(identity,isCurrent,verifiedBinding){
      const bindingKey='binding:'+await digest(JSON.stringify([projectId,identity.tenantId,identity.principalId]));
      const binding=verifiedBinding||await vault.readJSON(bindingKey);
      assertOfflineDatabaseBinding(binding,identity);
      const databaseName='hd_offline_'+await digest(JSON.stringify([projectId,identity.tenantId,identity.principalId,identity.permissionRevision]));
      if(binding&&binding.databaseName!==databaseName)throw Error('Browser database binding mismatch');
      const db=await openWebOfflineDatabase({databaseName,schema,isCurrent});
      try{
        const locator=binding||{version:1,projectId,tenantId:identity.tenantId,principalId:identity.principalId,permissionRevision:identity.permissionRevision,databaseName};
        if(!binding)await vault.writeJSON(bindingKey,locator);
        if(!verifiedBinding)await secureStore.attachDatabaseBinding(identity,locator);
        if(!isCurrent())throw Error('Browser session changed during database restore');
        return db;
      }catch(error){await db.close();throw error;}
    },
    async storageStatus(){return {persistent:await navigator.storage?.persisted?.()||false,estimate:await navigator.storage?.estimate?.()};},
    async requestPersistentStorage(){return await navigator.storage?.persist?.()||false;},
    dispose(){listeners.clear();vault.close();},
  });
}
