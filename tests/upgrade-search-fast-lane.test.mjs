import test from 'node:test';
import assert from 'node:assert/strict';
import {createSearchRecordIndex} from '../src/services/searchEngine.js';
const fields=row=>[{key:'primary',priority:100,values:[row.name,row.code]},{key:'phone',values:[row.phone]}];
test('bounded selective lane has identical references, ranking and duplicate positions to full search',()=>{
 const a={id:'a',name:'Vịt Không Móc To',code:'VKM',phone:'0909123456'},b={id:'b',name:'Vịt Không Móc',code:'VKM'};
 const rows=[a,,b,a,...Array.from({length:1000},(_,i)=>({id:'p'+i,name:'Synthetic Product '+i,code:'sku'+i}))];
 const index=createSearchRecordIndex(rows,fields);
 for(const query of ['vkm','vit khong moc','0909','123456','Synthetic Product 999','absent','sku77']){
  const fast=index.searchIfSmall(query);assert.notEqual(fast,null,query);assert.deepEqual(fast,index.search(query),query);
 }
 assert.equal(index.searchIfSmall('synthetic'),null,'broad query is delegated, never truncated');
 assert.equal(index.searchIfSmall(''),null);assert.throws(()=>index.searchIfSmall('vkm',1000),RangeError);
});
