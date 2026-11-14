import test from 'node:test';
import assert from 'node:assert/strict';
import {productionOfflineConfiguration,verifyProductionOfflineEndpoint} from '../scripts/production-offline-preflight.mjs';
import {productionQaSettings} from '../scripts/build-production-qa-apk.mjs';

// Public test key material only. These HTTP doubles test failure handling and
// configuration, not Production availability or end-to-end Offline readiness.
const key={kty:'RSA',alg:'RS256',e:'AQAB',n:'a'.repeat(342)};
const configuration={projectId:'hd-manager-c5839',appId:'hd-manager-production',environment:'production',
  appOrigin:'https://app.hdconnect.net',apiBaseUrl:'https://app.hdconnect.net/api/offline/',publicKey:key,maxOfflineMs:3600000};
const response=(keys=[key],origin=configuration.appOrigin)=>new Response(JSON.stringify({keys}),{
  headers:{'content-type':'application/json','access-control-allow-origin':origin}});

test('Production Offline preflight fails closed on missing endpoint, wrong key, HTML, private material and CORS',async()=>{
  for(const reply of [new Response('{}',{status:404}),response([{...key,n:'b'.repeat(342)}]),
    new Response('<html/>',{headers:{'content-type':'text/html'}}),response([{...key,d:'private'}]),response([key],'*')]) {
    await assert.rejects(verifyProductionOfflineEndpoint(configuration,{fetcher:async()=>reply}));
  }
  await assert.rejects(verifyProductionOfflineEndpoint(configuration,{fetcher:async()=>{throw Error('network unavailable');}}));
});
test('A matching public verifier enables the existing runtime, never a local signer or emulator',async()=>{
  const proof=await verifyProductionOfflineEndpoint(configuration,{fetcher:async(url,options)=>{
    assert.equal(url.href,configuration.apiBaseUrl+'.well-known/jwks.json');
    assert.equal(options.credentials,'omit');assert.equal(options.redirect,'error');
    assert.equal(options.headers.Authorization,undefined);return response();
  }});
  assert.match(proof.status,/USER_GRANT_AND_DEVICE_TESTS_STILL_REQUIRED/);
  const settings=productionQaSettings({appId:'com.hdmanager.app'},'1'.repeat(40),configuration);
  assert.equal(settings.environment.VITE_OFFLINE_RUNTIME,'trusted-v1');
  assert.equal(settings.environment.VITE_CUSTOMER_DELTA_SYNC,'true');
  assert.equal(settings.environment.VITE_OFFLINE_MAX_MS,'3600000');
  assert.equal(settings.environment.VITE_NATIVE_MINIMAL_ENTRY,'false');
  assert.equal(settings.environment.VITE_OFFLINE_API_BASE_URL,configuration.apiBaseUrl);
  assert.match(settings.signedOffline,/SERVER_GRANT_AND_DEVICE_VERIFICATION_REQUIRED/);
});
test('Real-data QA rejects an alternate project, origin, endpoint or unsafe lifetime',()=>{
  for(const patch of [{projectId:'demo-hdmanager-local'}, {environment:'isolated-qa'},
    {appOrigin:'https://qa.example.com'}, {apiBaseUrl:'https://alternate.example.com/'}, {maxOfflineMs:0}]) {
    assert.throws(()=>productionOfflineConfiguration({...configuration,...patch}));
  }
});
