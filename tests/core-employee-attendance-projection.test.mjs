import test from 'node:test';
import assert from 'node:assert/strict';
import {appFunction} from './helpers/app-source-function.mjs';
import {buildBaselineAttendanceCollector} from './fixtures/employee-review-attendance.baseline.mjs';
// Common deterministic date/timestamp dependencies isolate the changed selector
// from clock/timezone calculations, which remain unchanged and have own tests.
const bindings={normalizeEmployeeReviewMonthKey:value=>String(value||'').slice(0,7),getEntityTimestamp:record=>record?.updatedAt||record?.createdAt||''};
const old=buildBaselineAttendanceCollector(bindings),current=appFunction('getEmployeeAttendanceEntriesForMonth',bindings);
const row=(id,extra={})=>({id,companyId:'one',date:'2026-10-02',checkIn:'07:05',...extra});

test('employee-first attendance projection equals frozen measured baseline for identity precedence, canonical days and company/month scope',()=>{
  const rows=[row('2026-10-03_e1'),row('2026-10-04_e2'),
    row('2026-09-30_e1',{date:'2026-10-01'}),row('2026-10-05_e1',{date:'2026-09-30'}),
    row('2026-10-06_e1',{employeeId:'e2',empId:'e1'}),row('2026-10-07_e1',{empId:'e2',targetEmployeeId:'e1'}),
    row('unknown',{targetEmployeeId:'e1'}),row('2026-10-08_e1',{companyId:'foreign'}),
    row('2026-10-09_e1',{companyId:'',appId:'one'}),row('2026-10-10_e1',{companyId:'',tenantId:'one'}),
    row('legacy',{employeeId:0,empId:7}),row('no-identity'),null,
  ];
  for(const attendance of [rows,Object.fromEntries(rows.filter(Boolean).map((record,i)=>[record.id||String(i),record]))]){
    for(const employee of ['e1','e2','7',0,''])for(const month of ['2026-09','2026-10'])for(const company of ['','one','foreign']){
      assert.deepEqual(current(attendance,employee,month,company),old(attendance,employee,month,company));
    }
  }
  assert.equal(current(rows,'e1','2026-10','one').find(r=>r.id==='2026-10-05_e1').date,'2026-10-05');
});

test('only matching employee payloads are cloned; edits to the same input collection remain visible without a stale cache',()=>{
  let reads=0;const rows=Array.from({length:3000},(_,i)=>{
    const record=row('2026-10-02_e'+i,{employeeId:'e'+i});
    Object.defineProperty(record,'details',{enumerable:true,get(){reads++;return {checkOut:'17:00',amount:125000}}});return record;
  });
  const expected=old(rows,'e17','2026-10','one'),baselineReads=reads;reads=0;
  assert.deepEqual(current(rows,'e17','2026-10','one'),expected);
  assert.equal(baselineReads,3000);assert.equal(reads,1);
  rows[30].employeeId='e17';rows[17].date='2026-09-01';
  // Document day has priority over a legacy editable date.
  assert.deepEqual(current(rows,'e17','2026-10','one'),old(rows,'e17','2026-10','one'));
  rows.splice(17,1);assert.deepEqual(current(rows,'e17','2026-10','one'),old(rows,'e17','2026-10','one'));
});
