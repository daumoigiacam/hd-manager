import test from'node:test';import assert from'node:assert/strict';
import{createSearchRecordIndex}from'../src/services/searchEngine.js';
const rows=Array.from({length:1000},(_,i)=>({id:String(i),name:`Synthetic Product ${i}`,sku:`SKU${i}`}));
const fields=row=>[{key:'primary',value:row.name,priority:100},{key:'sku',value:row.sku,priority:90}];
test('dense and intersected postings preserve every row, ranking, sparse input and cancellation',async()=>{
 const sparse=new Array(1200);rows.forEach((r,i)=>sparse[i+100]=r);sparse[1150]=rows[5];
 for(const source of[rows,sparse]){const index=createSearchRecordIndex(source,fields);
  for(const query of['s','sk','synthetic product','synthetic 1','sku9','product 99','missing'])assert.deepEqual(await index.searchAsync(query),index.search(query));
  const controller=new AbortController();await assert.rejects(index.searchAsync('s',{signal:controller.signal,maxOperations:32,yieldTask:async()=>controller.abort()}),{name:'AbortError'});
 }
});
test('dense postings keep source occurrence order, membership and caller ordering with the same finite budget',async()=>{
 const source=[...rows,...rows.slice(0,12)],index=createSearchRecordIndex(source,fields),membership=new Set(rows.filter((_,i)=>i%2===0)),orderedRecords=[...source].reverse();
 const expected=orderedRecords.filter(row=>membership.has(row));
 assert.deepEqual(await index.searchAsync('s',{orderedRecords,membership,maxOperations:32}),expected);
 let yields=0;await index.searchAsync('s',{maxOperations:32,yieldTask:async()=>{yields++}});assert.ok(yields>1,'dense path must still cooperate');
});
