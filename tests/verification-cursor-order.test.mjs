import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeCursorItems} from '../src/services/firestoreCursorPagination.js';
test('merging cursor pages preserves canonical UTF-8 document-ID order, including case and supplementary Unicode',()=>{
 const ids=['z','é','A','a','\uE000','\u{10000}','😀'];
 const expected=[...ids].sort((a,b)=>Buffer.compare(Buffer.from(a,'utf8'),Buffer.from(b,'utf8')));
 const first=ids.slice(0,4).map(id=>({id,value:1})),next=ids.slice(4).map(id=>({id,value:2}));
 const actual=mergeCursorItems(first,[...next,{id:'a',value:3}]);
 assert.deepEqual(actual.map(x=>x.id),expected);
 assert.equal(actual.find(x=>x.id==='a').value,3);
 assert.equal(new Set(actual.map(x=>x.id)).size,ids.length);
});
