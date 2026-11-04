import test from 'node:test';import assert from 'node:assert/strict';
import {appFunction} from './helpers/app-source-function.mjs';
import {createBoundedCollationCompare} from '../src/services/collationCompareCache.js';
test('actual warehouse supplier picker keeps exact default Vietnamese ordering, archives and stable ties',()=>{
 const labels=['Đức','Duc','Hồng','hồng','Gà 2','Gà 10','a','A','','💬','Dũng','Dung','Thu','Túi','01','1'];
 const customers=Array.from({length:603},(_,i)=>({id:i,...[{name:labels[i%labels.length]},{customerName:labels[i%labels.length]},{fullName:labels[i%labels.length]},{phone:labels[i%labels.length]}][i%4],isArchived:i%31===0}));
 const before=JSON.stringify(customers),compareVietnameseText=createBoundedCollationCompare(new Intl.Collator('vi'));
 const label=r=>`${r.name||r.customerName||r.fullName||r.phone||''}`;
 const expected=customers.filter(r=>!r.isArchived).sort((a,b)=>label(a).localeCompare(label(b),'vi'));
 const project=appFunction('supplierCustomerOptions',{customers,compareVietnameseText},{memoCallback:true});
 for(let i=0;i<3;i++)assert.deepEqual(project(),expected);
 assert.equal(JSON.stringify(customers),before);
});
