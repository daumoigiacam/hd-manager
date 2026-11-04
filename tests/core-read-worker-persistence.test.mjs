import test from 'node:test';import assert from 'node:assert/strict';
import {getReadWorkerCacheAppName,clearReadWorkerPersistentCache,canPersistReadCollection} from '../src/services/readWorkerPersistence.js';
import {prioritizePersistentReadSources} from '../src/services/readWorkerPolicy.js';
import {appFunction,appObject} from './helpers/app-source-function.mjs';
import {readFileSync} from 'node:fs';
const scope={projectId:'demo-cache',appId:'fixture-app',uid:'synthetic-a',companyId:'company-a',accountType:'employee',appName:'[DEFAULT]',apiKey:'synthetic-api'};

test('persistent read namespace is deterministic, opaque and isolated across every scope boundary',async()=>{
 const original=await getReadWorkerCacheAppName(scope);assert.match(original,/^hd-read-cache-v1-[a-f0-9]{64}$/);
 assert.equal(await getReadWorkerCacheAppName({...scope}),original);
 assert.equal(await getReadWorkerCacheAppName({...scope,appName:original,sourceAppName:scope.appName}),original,'worker verifies the same original application scope');
 for(const key of ['projectId','appId','uid','companyId','appName'])assert.notEqual(await getReadWorkerCacheAppName({...scope,[key]:scope[key]+'-other'}),original,key);
 for(const patch of [{uid:''},{companyId:null},{accountType:'customer'},{projectId:'x'.repeat(513)}])await assert.rejects(getReadWorkerCacheAppName({...scope,...patch}),TypeError);
 assert.equal(original.includes(scope.uid),false);assert.equal(original.includes(scope.companyId),false);
 await assert.rejects(clearReadWorkerPersistentCache({projectId:'other',apiKey:scope.apiKey},scope),TypeError,'purge cannot address another Firebase project');
});

test('only explicit business histories may persist; identities, settings, inbox and unknown collections stay volatile',()=>{
 for(const name of ['orders','orderRequests','payments','expenses','attendance','warehouseDispatches'])assert.equal(canPersistReadCollection(name),true);
 for(const name of ['companies','employees','customers','notifications','messages','identity_accounts','bankAccounts','unknown','orders/other'])assert.equal(canPersistReadCollection(name),false);
});

test('persistent source prioritization changes only order and keeps every required name',()=>{
 const names=['customers','products','orders','payments','warehouseDispatches','holidays'];
 const result=prioritizePersistentReadSources(names,canPersistReadCollection);
 assert.deepEqual(result,['orders','payments','warehouseDispatches','customers','products','holidays']);
 assert.deepEqual([...result].sort(),[...names].sort());assert.deepEqual(names,['customers','products','orders','payments','warehouseDispatches','holidays']);
});

test('actual app cache opt-in requires the feature flag AND matching remembered native identity',()=>{
 const node=appObject('persistentReadCache'),source=readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
 const expression=source.slice(node.start,node.end).replace('import.meta.env','env');
 const run=(flag,native,remembered)=>new Function('env','isNativeRuntime','rememberedNativeUid','firebaseUser',`return (${expression})`)
  ({VITE_READ_WORKER_PERSISTENCE:flag},()=>native,()=>remembered,{uid:'approved'});
 assert.equal(run('server-validated-native',true,'approved'),true);
 for(const args of [[undefined,true,'approved'],['server-validated-native',false,'approved'],['server-validated-native',true,'other'],['server-validated-native',true,'']])assert.equal(run(...args),false);
});

test('actual logout and customer-login switch purge the old cache without blocking the signed-out UI',async()=>{
 for(const name of ['handleLogout','handleSwitchToCustomerLogin']){
  const calls=[];let rejectPurge;
  const pending=new Promise((_resolve,reject)=>{rejectPurge=reject});
  const noop=()=>{};
  const fn=appFunction(name,{readWorkerControllerRef:{current:{clearPersistentCache:()=>{calls.push('purge');return pending}}},
   recordStartupEvent:(event,details)=>{assert.deepEqual(details,{});calls.push(event)},forgetNativeSession:()=>calls.push('forget'),
   suppressBiometricAutoLoginForSession:noop,biometricVerifiedIdentityRef:{current:'fixture'},setBiometricUnlockState:noop,isVpsStagingMode:false,
   auth:{currentUser:{uid:'synthetic'}},startIdentityLogoutAudit:async()=>{},signOut:async()=>{},
   clearAppSession:()=>calls.push('clear-session'),setFirebaseUser:noop,setCurrentUser:value=>{assert.equal(value,null);calls.push('signed-out')},
   setCurrentCompany:noop,setActiveTab:noop,setPreferredCustomerLoginMode:noop});
  await fn();assert.deepEqual(calls.slice(0,2),['purge','forget']);assert(calls.includes('signed-out'));
  rejectPurge(Error('synthetic failure'));await Promise.resolve();await Promise.resolve();
  assert(calls.includes('data.read_cache.clear_failed'),'cleanup failure is observable, never reported as a successful cache purge');
 }
});
