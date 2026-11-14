// Artifact boundary regression. Strict DAO/token doubles, NOT HTTPS evidence.
// CI builds this package before the test; never substitute a source import.
import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
import {trustedCommandFixture,command} from './helpers/trusted-offline-command-fixture.mjs';
const {createTrustedOfflineBackend}=createRequire(import.meta.url)('../functions/offlineTrustedBackend.bundle.cjs');
const response=()=>({statusCode:200,set(){return this;},status(value){this.statusCode=value;return this;},json(value){this.body=value;return this;}});
function open(){const f=trustedCommandFixture(),backend=createTrustedOfflineBackend({db:f.db,auth:f.auth,configuration:f.configuration,getSigningKey:f.getSigningKey});return{f,async call(action,body={},token='a'){const res=response();await backend.handler({method:'POST',path:'/api/offline/'+action,body,get:name=>name==='authorization'?'Bearer '+token:name==='origin'?f.configuration.appOrigin:undefined},res);return res;},async close(){await backend.close();await f.close();}};}
test('bundled read services share the exact branded environment, not a second createRequire copy',async()=>{
 const h=open();try{for(const[action,body]of [['attendance-period',{action:'read',employeeId:'employee-a',monthKey:'2026-10'}],['attendance-adjustment',{action:'list'}],['payroll-settlement',{action:'catalog',monthKey:'2026-10'}]]){const r=await h.call(action,body);assert.equal(r.statusCode,200,action+': '+JSON.stringify(r.body));}assert.equal((await h.call('attendance-period',{action:'read',employeeId:'employee-b',monthKey:'2026-10'})).statusCode,403);}finally{await h.close();}
});
test('the built artifact performs atomic business writes, immutable replay and current-owner denial',async()=>{
 const h=open();try{const grant=await h.call('grant',{deviceId:'bundle-unit-device'});assert.equal(grant.statusCode,200);const c=command('bundle-adjustment','attendanceRequest.create','bundle-adjustment',{workDate:'2026-10-30',workRole:'Sản xuất',adjustmentType:'Ghi chú',reason:'Artifact boundary test',proposedDetail:'No time formula change'}),body={scope:grant.body.scope,command:c};
 const a=await h.call('sync',body);assert.equal(a.statusCode,200);assert.equal(a.body.outcome,'accepted');assert.deepEqual((await h.call('sync',body)).body,a.body);const before=h.f.writes.length;assert.equal((await h.call('sync',body,'b')).statusCode,403);assert.equal(h.f.writes.length,before);
 Object.assign(h.f.rows.get(h.f.root+'employees/employee-a'),{position:'Sản xuất',role:'employee'});assert.equal((await h.call('sync',body)).statusCode,403);assert.equal(h.f.writes.length,before);
 }finally{await h.close();}
});
