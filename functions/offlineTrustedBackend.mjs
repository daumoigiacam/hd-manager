// Deployment-neutral composition. No Firebase initialization, signer fallback,
// function export or deployment happens on import. The hosting service must
// inject its explicitly authorized Firebase app and secret-manager key reader.
import serverEnvironment from './offlineServerEnvironment.cjs';
import trustedApi from './offlineTrustedApi.cjs';
import trustedHttp from './offlineTrustedHttp.cjs';
import projector from './generated/offlineOriginalDomain.cjs';
import {createOfflineHomeFeed,HOME_PERMISSION_MAPPING} from './offlineHomeFeed.mjs';
import {createTrustedReadApi,trustedReadCapabilities} from './offlineTrustedReadApi.mjs';
export function createTrustedOfflineBackend({db,auth,configuration,getSigningKey,nativeOrigins=[]}){
 const environment=serverEnvironment.createOfflineServerEnvironment({...configuration,db,auth});
 const api=trustedApi.createTrustedOfflineApi({environment,projector,mapping:HOME_PERMISSION_MAPPING,getSigningKey,createHomeFeed:createOfflineHomeFeed,createReadSources:createTrustedReadApi,deriveReadCapabilities:trustedReadCapabilities});
 return Object.freeze({handler:trustedHttp.createTrustedOfflineHttp({environment,api,nativeOrigins}),close:()=>api.close(),environment});
}
