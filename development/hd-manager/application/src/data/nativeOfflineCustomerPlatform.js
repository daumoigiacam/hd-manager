import {createNativeHomeLaunchCache} from './nativeHomeLaunchCache.js';
import {CapacitorSQLite,SQLiteConnection,SQLiteDBConnection} from '@capacitor-community/sqlite';
import {NativeBiometric} from '@capgo/capacitor-native-biometric';
import {Capacitor} from '@capacitor/core';
import {createOfflineCustomerAuthorizer} from './offlineCustomerGrant.js';
import {openNativeOfflineDatabase} from './nativeOfflineDatabase.js';
import schema from '../../performance/offline-first/schema-v1.sql?raw';
import {createOfflineSecureSessionStore} from './offlineSecureSessionStore.js';
import {assertOfflineDatabaseBinding} from './offlineDatabaseBinding.js';
import {startupMark,startupSpan} from '../services/offlineStartupTrace.js';
import {assertOfflineProject} from '../config/offlineRuntimeEnvironment.js';
export async function createNativeCustomerPlatform({projectId,publicKey,environment}){
 assertOfflineProject(projectId,environment);
 if(Capacitor.getPlatform()!=='android')throw new Error('Native customer platform requires Android');
 const key='offline-customer-session:'+projectId;
 async function readEncrypted(storageKey){try{return JSON.parse((await NativeBiometric.getData({key:storageKey})).value);}catch(error){if(error?.message==='No data found')return null;throw error;}}
 const load=()=>readEncrypted(key);
 const save=value=>NativeBiometric.setData({key,value:JSON.stringify(value),accessControl:0,durable:true});
 const reservations=new WeakMap();
 const reserveNative=import.meta.env.VITE_NATIVE_SECURE_RESERVATION==='true';
 let preparedDatabase=null;
 const loadReserved=async({bootstrap=false}={})=>{
  try{
   if(bootstrap&&preparedDatabase)throw Error('A verified prepared database is still awaiting adoption');
   const prepareWorkspace=bootstrap&&import.meta.env.VITE_NATIVE_PREPARED_WORKSPACE==='true';
   const finish=startupSpan('native.session-reservation'+(prepareWorkspace?'-and-database':''));
   const packet=await NativeBiometric.getOfflineDataReserved({key,prepareWorkspace});
   finish({databaseIncluded:Boolean(packet.workspaceDatabase)});
   if(packet.workspaceDatabase)preparedDatabase=packet.workspaceDatabase;
   const record=JSON.parse(packet.value),until=packet.reservedUntilMs;
   if(!Number.isSafeInteger(until)||!Number.isSafeInteger(record.highWaterMs)||record.highWaterMs<until||!record.signedGrant)throw Error('Invalid durable native reservation');
   reservations.set(record,{until,signature:record.signedGrant});
   return record;
  }catch(error){if(error?.message==='No data found')return null;throw error;}
 };
 const secureStore=createOfflineSecureSessionStore({key,read:load,write:save,...(reserveNative?{
  readReserved:loadReserved,
  reservationUntil:record=>reservations.get(record)?.until,
  acceptReservation:(record,signature,at)=>{
   const proof=reservations.get(record);
   return Boolean(proof&&proof.signature===signature&&record.signedGrant===signature&&Number.isSafeInteger(at)&&at<=proof.until&&record.highWaterMs>=at);
  },
 }:{})});
 // Keep the SDK's single connection registry. Only its native create call is
 // enriched during a verified opening operation; no parallel manager/cache.
 const openStateEnabled=import.meta.env.VITE_NATIVE_OPEN_WITH_STATE==='true';
 let opening=null;
 const nativeTransport=new Proxy({}, {get(_target,method){
  if(method!=='createConnection')return CapacitorSQLite[method];
  return async options=>{
   const context=opening;
   if(!openStateEnabled||!context||options.database!==context.name)return CapacitorSQLite.createConnection(options);
   if(preparedDatabase?.databaseName===options.database){context.packet=preparedDatabase;preparedDatabase=null;return context.packet;}
   const packet=await CapacitorSQLite.createConnection({...options,includeWorkspaceState:true,workspaceScope:context.scope});
   if(!packet?.workspaceState)throw Error('Native create/open state protocol unavailable');
   context.packet=packet;return packet;
  };
 }});
 const sqlite=new SQLiteConnection(nativeTransport);
 const digest=async text=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),n=>n.toString(16).padStart(2,'0')).join('');
 const launchCache=import.meta.env.MODE==='emulator'&&import.meta.env.VITE_NATIVE_VERIFIED_LAUNCH_CACHE==='true'?createNativeHomeLaunchCache({readEncrypted,writeEncrypted:(key,value)=>NativeBiometric.setData({key,value,accessControl:0}),digest,secureStore}):null;
 return Object.freeze({secureStore,digest,launchCache,
  async discardPreparedDatabase(){const packet=preparedDatabase;preparedDatabase=null;if(packet)await CapacitorSQLite.closeConnection({database:packet.databaseName,readonly:false});},
  async installOnlineGrant({grant,verifiedUid}){
   if(grant.scope.principalId!==verifiedUid||grant.scope.projectId!==projectId)throw new Error('Online customer identity mismatch');
   const candidate={identity:grant.scope,signedGrant:grant.signedGrant,highWaterMs:grant.issuedAtMs,revoked:false};
   const authorize=await createOfflineCustomerAuthorizer({publicKey,expected:grant.scope,maxLifetimeMs:environment?.maxOfflineMs||86400000,clockSkewMs:5000,secureStore:{load:async()=>candidate,advanceHighWater:async()=>{}}});
   await authorize({scope:grant.scope,kind:'app.session'});
   // Reconcile a NEW online grant with the existing immutable account locator.
   // A changed permission revision still fails closed rather than opening an
   // empty database and hiding pending commands from the previous revision.
   const bindingKey='offline-customer-database:'+await digest(JSON.stringify([projectId,grant.scope.tenantId,grant.scope.principalId]));
   const binding=await readEncrypted(bindingKey);
   assertOfflineDatabaseBinding(binding,grant.scope);
   if(binding)candidate.databaseBinding=binding;
   await secureStore.replace(candidate);
  },
  async openDatabase(identity,isCurrent,verifiedDatabaseBinding){
   const [bindingHash,databaseHash]=await Promise.all([digest(JSON.stringify([projectId,identity.tenantId,identity.principalId])),digest(JSON.stringify([projectId,identity.tenantId,identity.principalId,identity.permissionRevision]))]);
   const bindingKey='offline-customer-database:'+bindingHash;
   // The hint comes only from the record read under the secure-store queue
   // whose grant was just verified. Validate its account, revision and hashed
   // location exactly as before. Legacy sessions read their original locator.
   const embedded=verifiedDatabaseBinding!==undefined&&verifiedDatabaseBinding!==null;
   const binding=embedded?verifiedDatabaseBinding:await readEncrypted(bindingKey);
   assertOfflineDatabaseBinding(binding,identity);
   startupMark('sqlite.binding-restored',{source:embedded?'encrypted-session':'legacy-encrypted-locator'});
   // An existing encrypted binding must use its existing key. Native open
   // rejects a missing key; never provision a replacement over saved data.
   if(!binding&&!(await sqlite.isSecretStored()).result){
    const secret=crypto.getRandomValues(new Uint8Array(32));
    try{await sqlite.setEncryptionSecret(Array.from(secret,n=>n.toString(16).padStart(2,'0')).join(''));}finally{secret.fill(0);}
   }
   const databaseName='hd_offline_'+databaseHash;
   if(binding&&binding.databaseName!==databaseName)throw new Error('Offline database binding location mismatch');
   if(opening)throw Error('A verified database opening is already active');
   const context={name:databaseName,scope:Object.freeze({...identity}),packet:null};opening=context;
   let database;
   try{database=await openNativeOfflineDatabase({sqlite,databaseName,schema,isCurrent,verifiedScope:identity,preparedBeforeCreate:Boolean(preparedDatabase),
    createIncludesOpen:openStateEnabled,
    openWithState:openStateEnabled?async name=>{
     if(context.packet){const result=context.packet;context.packet=null;return result;}
     return CapacitorSQLite.open({database:name,readonly:false,includeWorkspaceState:true,workspaceScope:context.scope});
    }:undefined,
    recoverConnection:async name=>{
    // Only the already verified, exact account database. After a WebView reload
    // native plugin state can outlive its JS owner. Do not open another database
    // or close a live connection belonging to any different principal.
    const orphan=new SQLiteDBConnection(name,false,CapacitorSQLite);
    const open=await CapacitorSQLite.isDBOpen({database:name,readonly:false});
    if(open.result){const active=await orphan.isTransactionActive();if(active.result)await orphan.rollbackTransaction();}
    return {connection:orphan,alreadyOpen:open.result};
   }});}finally{opening=null;}
   try{
    const confirmedBinding=binding||{version:1,projectId,tenantId:identity.tenantId,principalId:identity.principalId,permissionRevision:identity.permissionRevision,databaseName};
    if(!binding)await NativeBiometric.setData({key:bindingKey,value:JSON.stringify(confirmedBinding),accessControl:0,durable:true});
    // One-time upgrade of old session records, no database rewrite. A kill
    // before this commit retains the original locator and safely retries.
    if(!embedded)await secureStore.attachDatabaseBinding(identity,confirmedBinding);
    if(!isCurrent())throw new Error('Database owner changed during binding recovery');
    return database;
   }catch(error){await database.close();throw error;}
  },
 });
}
