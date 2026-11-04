import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {writeFile} from 'node:fs/promises';import path from 'node:path';
import {buildEmployeeHomeProjector} from '../scripts/helpers/employee-home-projector-build.mjs';
import {validateEmployeeHomeScreenDto} from '../src/services/employeeHomeScreenDto.js';
const require=createRequire(import.meta.url),{Timestamp,GeoPoint}=require('../functions/node_modules/firebase-admin/lib/firestore/index.js');
const {encodeEmployeeHomePrivateValue:encode,decodeEmployeeHomePrivateValue:decode}=require('../functions/employeeHomePrivateValues.js');
const {createEmployeeHomeProcessProjector}=require('../functions/employeeHomeProcessProjector.js');
const directory=path.resolve('test-results/perf-target-20261102/private-home-process-unit');
const manifest=await buildEmployeeHomeProjector(directory);
const fixture=()=>{
 const employee={companyId:'company-a',name:'Synthetic employee',position:'Nhân viên',basicSalary:6200000,passwordHash:'PRIVATE_PROCESS_SENTINEL'};
 const snapshot={company:{documentId:'company-a',data:{}},employee:{documentId:'employee-a',data:employee},sources:{},counts:{}};
 for(const name of ['employees','customers','orders','payments','expenses','financials','attendance','performance','employeeReviews','deliveryReports','holidays','advances','assets','assetCostLogs'])snapshot.sources[name]=[];
 snapshot.sources.employees=[{documentId:'employee-a',data:employee}];
 snapshot.sources.attendance=[{documentId:'2026-11-02_employee-a',data:{companyId:'company-a',empId:'employee-a',date:'2026-11-02',status:'present',checkIn:Timestamp.fromDate(new Date('2026-11-02T01:00:00Z')),checkOut:Timestamp.fromDate(new Date('2026-11-02T10:00:00Z'))}}];
 for(const [name,rows]of Object.entries(snapshot.sources))snapshot.counts[name]=rows.length;return snapshot;
};
const scope={companyId:'company-a',employeeId:'employee-a',date:'2026-11-02',timeZone:'Asia/Ho_Chi_Minh'};

test('private value wire preserves nanoseconds, Date, plain user keys and supported SDK values, rejecting unknown prototypes and cycles',()=>{
 const input=Object.fromEntries([['__proto__',{safe:true}],['constructor','ordinary-field'],['stamp',new Timestamp(10,123456789)],['geo',new GeoPoint(10,106)],['bytes',Buffer.from([0,255,10])],['date',new Date(123)],['invalid',new Date(NaN)],['array',[undefined,NaN,-0]]]);
 const result=decode(encode(input));assert(result.stamp.isEqual(input.stamp));assert(result.geo.isEqual(input.geo));
 assert.deepEqual(result.bytes,input.bytes);assert.equal(result.date.getTime(),123);assert(Number.isNaN(result.invalid.getTime()));
 assert.deepEqual(result.array,input.array);assert.deepEqual({...result.__proto__},{safe:true});assert.equal({}.safe,undefined);
 const cyclic={};cyclic.self=cyclic;
 for(const value of [cyclic,/unknown/,()=>{},Object.assign(new Date(),{extra:1})])assert.throws(()=>encode(value),/Unsupported/);
 const wire=encode({stamp:input.stamp});wire.specials.push(wire.specials[0]);assert.throws(()=>decode(wire),/Unsupported/);
});

test('real private child calculation isolates concurrent timezone scopes and exposes only validated display data',async()=>{
 const parentZone=Intl.DateTimeFormat().resolvedOptions().timeZone,parentOffset=new Date().getTimezoneOffset();
 const project=createEmployeeHomeProcessProjector({...manifest,validate:validateEmployeeHomeScreenDto});
 const [vietnam,utc]=await Promise.all([project({scope,snapshot:fixture()}),project({scope:{...scope,timeZone:'UTC'},snapshot:fixture()})]);
 assert.equal(vietnam.domainVersion,manifest.domainVersion);assert.equal(vietnam.kind,'hd-employee-home-model-v1');
 // The existing attendance display explicitly formats in Vietnam time. Keep
 // that established behavior even if the calling device timezone is UTC.
 assert.match(vietnam.model.attendance.in.value,/08:00/);assert.match(utc.model.attendance.in.value,/08:00/);
 assert.doesNotMatch(JSON.stringify(vietnam),/PRIVATE_PROCESS_SENTINEL|passwordHash|employee-a|company-a/);
 assert.equal(Intl.DateTimeFormat().resolvedOptions().timeZone,parentZone);assert.equal(new Date().getTimezoneOffset(),parentOffset);
 const clock=path.join(directory,'synthetic-clock-scope.cjs');
 await writeFile(clock,'module.exports={projectEmployeeHomeSnapshot(){const model='+JSON.stringify(vietnam.model)+';model.positionLabel=Intl.DateTimeFormat().resolvedOptions().timeZone;model.salary.salesRevenue=new Date("2026-11-02T01:00:00Z").getHours();return model}};');
 const inspect=createEmployeeHomeProcessProjector({modulePath:clock,domainVersion:manifest.domainVersion,validate:validateEmployeeHomeScreenDto});
 const [vClock,uClock]=await Promise.all([inspect({scope,snapshot:{}}),inspect({scope:{...scope,timeZone:'UTC'},snapshot:{}})]);
 assert.equal(vClock.model.salary.salesRevenue,8);assert.equal(uClock.model.salary.salesRevenue,1);
 assert.notEqual(vClock.model.positionLabel,uClock.model.positionLabel);
 assert.equal(Intl.DateTimeFormat().resolvedOptions().timeZone,parentZone);
 await assert.rejects(project({scope:{...scope,timeZone:'Invalid/Zone'},snapshot:fixture()}),/invalid_home_timezone/);
});

test('child admission, hard timeout, input bound and output validation fail closed and release terminated processes',async()=>{
 const hang=path.join(directory,'synthetic-hang.cjs');await writeFile(hang,'module.exports={projectEmployeeHomeSnapshot(){while(true){}}};');
 const project=createEmployeeHomeProcessProjector({modulePath:hang,domainVersion:manifest.domainVersion,validate:validateEmployeeHomeScreenDto,maxInflight:1,timeoutMs:500});
 const pending=project({scope,snapshot:{}}),rejected=assert.rejects(pending,/home_projection_timeout/);
 await assert.rejects(project({scope,snapshot:{}}),/home_projection_busy/);await rejected;
 await new Promise(resolve=>setTimeout(resolve,100));await assert.rejects(project({scope,snapshot:{}}),/home_projection_timeout/);
 const tiny=createEmployeeHomeProcessProjector({...manifest,validate:validateEmployeeHomeScreenDto,maxInputBytes:1});
 await assert.rejects(tiny({scope,snapshot:{}}),/home_projection_input_limit/);
 const bad=path.join(directory,'synthetic-bad-output.cjs');await writeFile(bad,'module.exports={projectEmployeeHomeSnapshot(){return {password:"PRIVATE_OUTPUT_SENTINEL"}}};');
 const invalid=createEmployeeHomeProcessProjector({modulePath:bad,domainVersion:manifest.domainVersion,validate:validateEmployeeHomeScreenDto});
 await assert.rejects(invalid({scope,snapshot:{}}),error=>error.message==='invalid_home_projection'&&!error.message.includes('PRIVATE_OUTPUT_SENTINEL'));
});
