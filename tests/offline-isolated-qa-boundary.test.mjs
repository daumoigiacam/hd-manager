// Pure configuration/actor contracts; not remote HTTPS acceptance evidence.
import test from 'node:test';import assert from 'node:assert/strict';import {generateKeyPairSync} from 'node:crypto';
import {createOfflineServerEnvironment} from '../functions/offlineServerEnvironment.cjs';
import {createTrustedOfflineActorResolver} from '../functions/offlineTrustedActor.cjs';
import {resolveOfflineRuntimeEnvironment} from '../development/hd-manager/application/src/config/offlineRuntimeEnvironment.js';
const {publicKey}=generateKeyPairSync('rsa',{modulusLength:2048}),jwk={...publicKey.export({format:'jwk'}),alg:'RS256'};
const config={projectId:'hd-manager-c5839',appId:'hd-manager-release-qa-20261114',environment:'isolated-qa',appOrigin:'https://isolated-qa.example.com',publicKey:jwk};
test('Owner-approved QA cannot become a Development backdoor or select the live namespace/origin',()=>{
 const db={projectId:config.projectId},auth={app:{options:{projectId:config.projectId}}};
 assert.equal(createOfflineServerEnvironment({...config,db,auth}).environment,'isolated-qa');
 assert.equal(resolveOfflineRuntimeEnvironment({...config,apiBaseUrl:config.appOrigin+'/api/offline/'}).appId,config.appId);
 for(const patch of [{environment:'development'},{appId:'hd-manager-production'},{appOrigin:'https://app.hdconnect.net'},{projectId:'other-project'}]){
  assert.throws(()=>createOfflineServerEnvironment({...config,...patch,db,auth}));
  assert.throws(()=>resolveOfflineRuntimeEnvironment({...config,...patch,apiBaseUrl:config.appOrigin+'/api/offline/'}));
 }
});
test('QA resolver rejects non-QA account and tenant claims before ANY Firestore identity/source read',async()=>{
 const decoded={uid:'identity_real-identity',identityId:'real-identity',companyId:'real-tenant',appUserId:'real-employee',accountType:'employee',aud:config.projectId,iss:'https://securetoken.google.com/'+config.projectId,exp:Math.floor(Date.now()/1000)+3600};
 let reads=0;const db={projectId:config.projectId,doc(){reads++;throw Error('Must not read a real tenant');},runTransaction(){reads++;throw Error('Must not start a real-tenant transaction');}},auth={app:{options:{projectId:config.projectId}},verifyIdToken:async()=>decoded};
 const environment=createOfflineServerEnvironment({...config,db,auth}),resolver=createTrustedOfflineActorResolver({environment,db,projector:{hasCompanyRolePermissionAction:()=>true}});
 await assert.rejects(resolver.resolve('unit-token'),{code:'permission-denied'});await assert.rejects(resolver.read({},decoded),{code:'permission-denied'});assert.equal(reads,0);
 for(const key of ['identityId','companyId','appUserId'])decoded[key]='qa_release_20261114_unit';decoded.uid='identity_'+decoded.identityId;
 assert.deepEqual(await resolver.verifyToken('unit-token'),decoded);
});
