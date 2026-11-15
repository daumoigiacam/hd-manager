import test from 'node:test';import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {dateSql,strictBusinessDaySql} from '../src/data/businessDirectoryDateSql.js';

test('canonical-day shortcut is exactly equal to original SQL across calendar/timezone/type/legacy and fallback boundaries',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  const j=key=>`json_extract(r.body,'$.${key}')`,candidates=[j('a'),j('b')];
  const query=db.prepare(`WITH r(body) AS(VALUES(?)) SELECT ${dateSql(candidates)} original,${strictBusinessDaySql(candidates)} candidate FROM r`);
  const values=[null,'',false,0,1794675600000,{},[],{seconds:1794675600},{_seconds:1794675600},{timestampValue:'2026-11-14T17:00:00Z'},
   '2026-11-15',' 2026-11-15 ','2026-02-28','2026-02-29','2028-02-29','2026-04-31','2026-12-31','2027-01-01','0000-01-01','9999-12-31',
   '2026-11-15\0junk','bad','15/11/2026','15-11-2026','2026-11-14T16:59:59Z','2026-11-14T17:00:00Z','2026-12-31T23:59:59+07:00','2026-12-31T17:00:00Z','2026-11-15T00:00:00','2026-11-15 00:00:00','2026-11-15T25:00:00'];
  for(let month=1;month<=12;month++)for(const day of [1,28,29,30,31])values.push(`2026-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`);
  let comparisons=0;
  for(const a of values)for(const b of [null,'2026-11-15','2028-02-29','invalid']){
   const row=query.get(JSON.stringify({a,b}));assert.equal(row.candidate,row.original,JSON.stringify({a,b}));comparisons++;
  }
  assert.equal(comparisons,364);
 }finally{db.close();}
});
