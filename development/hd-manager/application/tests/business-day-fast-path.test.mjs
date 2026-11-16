import test from 'node:test';import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {dateSql,strictBusinessDaySql,entityDates,warehouseDispatchBusinessSortSql} from '../src/data/businessDirectoryDateSql.js';

test('shared dispatch read/projection date is identical to the original parser for all field precedences and historical dates',()=>{
 const db=new DatabaseSync(':memory:');try{
  const j=k=>`json_extract(r.body,'$.${k}')`,first=`COALESCE(${entityDates.slice(0,7).map(k=>`NULLIF(${j(k)},'')`).join(',')},'')`;
  const statement=db.prepare(`WITH r(body) AS(VALUES(?)) SELECT COALESCE(${dateSql([first,...entityDates.slice(7).map(j)])},'') original,${warehouseDispatchBusinessSortSql()} candidate FROM r`);
  const values=[null,'',false,0,{},[],{seconds:1794675600},{timestampValue:'2026-11-14T17:00:00Z'},'2026-11-15','2026-02-29','2028-02-29',' 2026-11-15 ','2026-11-15\0junk','bad','15/11/2026','2026-11-14T16:59:59Z','2026-11-14T17:00:00Z','2026-12-31T17:00:00Z'];
  for(const field of entityDates)for(const value of values)for(const date of [undefined,'2026-11-15','invalid']){
   const row=statement.get(JSON.stringify({createdAt:'2026-11-13T17:00:00Z',date,[field]:value}));assert.equal(row.candidate,row.original,JSON.stringify({field,value,date}));
  }
 }finally{db.close();}
});

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

test('warehouse candidate precedence, malformed dates and Vietnam midnight boundaries retain the original result and row order',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  const j=key=>`json_extract(r.body,'$.${key}')`;
  const candidates=[`COALESCE(${entityDates.slice(0,7).map(k=>`NULLIF(${j(k)},'')`).join(',')},'')`,...entityDates.slice(7).map(j)];
  db.exec('CREATE TABLE r(id INTEGER PRIMARY KEY,body TEXT)');
  const insert=db.prepare('INSERT INTO r(body) VALUES(?)');
  const values=['2026-11-15','2026-02-29','2028-02-29',' 2026-11-15 ','2026-11-15\0hidden','bad','15/11/2026',null,'',0,false,{seconds:1794675600},'2026-11-14T16:59:59Z','2026-11-14T17:00:00Z','2026-12-31T17:00:00Z'];
  for(const field of entityDates)for(const value of values)insert.run(JSON.stringify({[field]:value,createdAt:'2026-11-15T00:00:00+07:00',updatedAt:'2027-01-01'}));
  insert.run(JSON.stringify({date:'invalid',requestDate:'2028-01-01',createdAt:'2026-11-14T17:00:00Z'}));
  const rows=db.prepare(`SELECT id,${dateSql(candidates)} original,${strictBusinessDaySql(candidates)} candidate FROM r`).all();
  for(const row of rows)assert.equal(row.candidate,row.original,`stored row ${row.id}`);
  for(const expression of [dateSql(candidates),strictBusinessDaySql(candidates)]){
   const ids=db.prepare(`SELECT id FROM r WHERE ${expression}>='2026-11-15' AND ${expression}<'2027-01-01' ORDER BY ${expression} DESC,id DESC LIMIT 25`).all();
   if(expression===dateSql(candidates))rows.expected=ids;else assert.deepEqual(ids,rows.expected);
  }
 }finally{db.close();}
});
