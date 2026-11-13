// Deployment-neutral composition. No Firebase initialization, signer fallback,
// function export or deployment happens on import. The hosting service must
// inject its explicitly authorized Firebase app and secret-manager key reader.
import serverEnvironment from './offlineServerEnvironment.cjs';
import trustedApi from './offlineTrustedApi.cjs';
import trustedHttp from './offlineTrustedHttp.cjs';
import projector from './generated/offlineOriginalDomain.cjs';
import {createOfflineHomeFeed,HOME_PERMISSION_MAPPING} from './offlineHomeFeed.mjs';
import {createTrustedReadApi,trustedReadCapabilities} from './offlineTrustedReadApi.mjs';
import {createTrustedBusinessCommands,trustedBusinessCapabilities} from './offlineTrustedCommands.mjs';
import identity from './identityCenter.js';
import {FieldValue,FieldPath} from 'firebase-admin/firestore';
export function createTrustedOfflineBackend({db,auth,configuration,getSigningKey,nativeOrigins=['https://localhost']}){
 const environment=serverEnvironment.createOfflineServerEnvironment({...configuration,db,auth});
 const identityCenter=identity.createIdentityCenter({db,admin:{auth:()=>auth,firestore:{FieldValue,FieldPath}},getAppId:requested=>{if(requested&&requested!==environment.appId)throw Error('Identity app binding mismatch');return environment.appId;}});
 const api=trustedApi.createTrustedOfflineApi({environment,projector,mapping:HOME_PERMISSION_MAPPING,getSigningKey,createHomeFeed:createOfflineHomeFeed,createReadSources:createTrustedReadApi,deriveReadCapabilities:trustedReadCapabilities,createCommands:createTrustedBusinessCommands,deriveBusinessCapabilities:trustedBusinessCapabilities,identityCenter});
 return Object.freeze({handler:trustedHttp.createTrustedOfflineHttp({environment,api,nativeOrigins}),close:()=>api.close(),environment});
}
