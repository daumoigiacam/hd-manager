import assert from 'node:assert/strict';
import {resolveOfflineRuntimeEnvironment} from '../development/hd-manager/application/src/config/offlineRuntimeEnvironment.js';

export function productionOfflineConfiguration(configuration) {
  const environment=resolveOfflineRuntimeEnvironment(configuration);
  assert.equal(environment.environment,'production','QA with real data requires the Production Offline issuer');
  assert.equal(environment.apiBaseUrl,'https://app.hdconnect.net/api/offline/','Unexpected Production Offline endpoint');
  return environment;
}

// This is a public trust/configuration preflight, NOT a grant, snapshot or
// end-to-end Offline acceptance. No user token or signing secret is loaded.
export async function verifyProductionOfflineEndpoint(configuration,{fetcher=fetch}={}) {
  const environment=productionOfflineConfiguration(configuration);
  const response=await fetcher(new URL('.well-known/jwks.json',environment.apiBaseUrl),{
    method:'GET',redirect:'error',cache:'no-store',credentials:'omit',
    headers:{Accept:'application/json',Origin:environment.appOrigin},signal:AbortSignal.timeout(10000),
  });
  assert.equal(response.status,200,`Production Offline JWK unavailable (HTTP ${response.status}); do not enable the SQLite runtime`);
  assert.match(response.headers.get('content-type')||'',/^application\/json\b/i,'JWK must be JSON');
  assert.equal(response.headers.get('access-control-allow-origin'),environment.appOrigin,'JWK CORS origin mismatch');
  const body=await response.text();
  assert.ok(body.length<=16384,'JWK response too large');
  const {keys}=JSON.parse(body);
  assert.ok(Array.isArray(keys)&&keys.length>0&&keys.length<=8,'Invalid JWK set');
  for(const key of keys) {
    assert.ok(key&&typeof key==='object'&&!['d','p','q','dp','dq','qi','oth'].some(field=>Object.hasOwn(key,field)),'JWK must contain public keys only');
  }
  const pinned=environment.publicKey;
  const matches=keys.filter(key=>['kty','e','n','alg'].every(field=>key[field]===pinned[field])&&(!pinned.kid||key.kid===pinned.kid));
  assert.equal(matches.length,1,'Production JWK does not match the pinned Offline verifier');
  return {status:'PUBLIC_JWK_VERIFIED_USER_GRANT_AND_DEVICE_TESTS_STILL_REQUIRED',
    apiBaseUrl:environment.apiBaseUrl,projectId:environment.projectId,checkedAt:new Date().toISOString()};
}
