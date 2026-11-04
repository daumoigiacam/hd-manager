import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {extractDispatchRanking} from './helpers/dispatch-ranking-extractor.mjs';
import {createSearchRecordIndex} from '../src/services/searchEngine.js';
import {runCooperativeProjection} from '../src/services/cooperativeProjection.js';
const fixture=JSON.parse(await fs.readFile(new URL('./fixtures/dispatch-ranking-before-upgrade.json',import.meta.url),'utf8'));
const rank=extractDispatchRanking(await fs.readFile(new URL('../src/App.jsx',import.meta.url),'utf8'));
const labels=row=>[row.name,row.alias,row.phone,row.address];
test('actual cooperative dispatch rank preserves pre-change fuzzy/exact ordering and duplicate occurrences',async()=>{
 const index=createSearchRecordIndex(fixture.records,row=>[{key:'primary',priority:100,values:labels(row)}]);
 for(const c of fixture.cases){const rows=await runCooperativeProjection(()=>rank(fixture.records,c.query,labels,index.search(c.query)),{yieldTask:async()=>{},maxOperations:3});assert.deepEqual(rows.map(row=>row.id),c.ids,c.query)}
});
test('fuzzy fallback can be cancelled between labels and never publishes a partial result',async()=>{
 const controller=new AbortController();let yields=0;
 await assert.rejects(runCooperativeProjection(()=>rank(fixture.records,'typo-unmatched',labels,[]),{signal:controller.signal,maxOperations:1,yieldTask:async()=>{if(++yields===4)controller.abort()}}),{name:'AbortError'});
 assert.equal(yields,4);
});
