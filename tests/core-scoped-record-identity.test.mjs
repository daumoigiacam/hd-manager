import test from 'node:test';import assert from 'node:assert/strict';
import {createScopedRecordIdentity} from '../src/utils/scopedRecordIdentity.js';
import {readFileSync} from 'node:fs';

test('only exact current-scope plain records retain identity; new nested snapshots and removed keys invalidate',()=>{
 const keep=createScopedRecordIdentity(),record={checkIn:'06:00'},a={type:'missing_check_out',record,date:'2026-11-02'};
 assert.equal(keep('scope-a',a),a);assert.equal(keep('scope-a',{...a}),a);
 const changed={...a,record:{...record}};assert.equal(keep('scope-a',changed),changed);
 const removed={record:changed.record,date:a.date};assert.equal(keep('scope-a',removed),removed);
 const switched={...removed};assert.equal(keep('scope-b',switched),switched);
 assert.equal(keep('scope-a',removed),removed,'no older actor scope is retained');
 const stamp=new Date(0);assert.equal(keep('scope-a',stamp),stamp);const next=new Date(1);assert.equal(keep('scope-a',next),next);
 assert.throws(()=>keep('',{}),TypeError);
});

test('time-dependent computation still runs on every render and crossing a boundary publishes the new result',()=>{
 const keep=createScopedRecordIdentity();let calls=0,clock=0;const record={};
 const calculate=()=>{calls++;return clock<100?null:{type:'missing_check_out',record}};
 const render=()=>keep('company:employee:date',calculate());
 assert.equal(render(),null);clock=100;const alert=render();assert.equal(alert.type,'missing_check_out');
 clock=101;assert.equal(render(),alert);clock=200;assert.equal(render(),alert);assert.equal(calls,4);
 clock=0;assert.equal(render(),null);clock=100;assert.notEqual(render(),alert);
 const source=readFileSync('src/App.jsx','utf8');
 assert.match(source,/const currentAttendanceAlert = retainCurrentAttendanceAlert\([\s\S]*?resolveAttendanceAnomalyForDate\(employee, attendance, date\)/,
  'the actual clock-sensitive computation remains outside a memo callback');
});
