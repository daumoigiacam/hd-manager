import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import {loginLocalQa} from '../tools/local-development/auth-client.mjs';
test('actual Local authenticated grant renewal keeps the owner; foreign tenant, principal and revision are rejected',async()=>{
 const {configuration:c,idToken}=await loginLocalQa('A');
 assert.match(c.projectId,/^demo-/);assert.equal(new URL(c.apiEndpoint).hostname,'127.0.0.1');
 const post=body=>fetch(c.apiEndpoint+'grant',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+idToken},body:JSON.stringify(body)});
 const deviceId='qa-renew-contract-'+randomUUID(),initial=await post({deviceId});assert.equal(initial.status,200);const first=await initial.json();
 const response=await post({deviceId,renewalScope:first.scope});assert.equal(response.status,200);const renewed=await response.json();assert.deepEqual(renewed.scope,first.scope);
 const payload=JSON.parse(Buffer.from(renewed.signedGrant.split('.')[1],'base64url'));assert.equal(payload.sessionId,first.scope.sessionId);assert(payload.expiresAtMs>payload.issuedAtMs);
 for(const field of ['tenantId','principalId','permissionRevision','projectId','deviceId'])assert.equal((await post({deviceId,renewalScope:{...first.scope,[field]:'foreign'}})).status,403,field);
 assert.equal((await post({deviceId,renewalScope:{...first.scope,sessionId:'bad/session'}})).status,403);
});
