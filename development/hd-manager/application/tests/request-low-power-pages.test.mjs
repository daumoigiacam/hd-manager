import test from'node:test';import assert from'node:assert/strict';
import{getGroupedRowPage}from'../src/services/groupedRowPage.js';
test('15-row low-power pages preserve every grouped line, independent unit/price and all-row totals',()=>{
 const groups=Array.from({length:1000},(_,i)=>({id:'customer-'+i,rows:Array.from({length:3},(_,j)=>({id:`${i}-${j}`,quantity:2,orderedUnit:j?'Con':'Kg',pricingUnit:'Kg',unitPrice:67000+j}))}));
 const original=groups.flatMap(group=>group.rows),seen=[];
 for(let offset=0;offset<original.length;offset+=15){const page=getGroupedRowPage(groups,offset,15);assert.equal(page.total,3000);assert(page.items.reduce((n,g)=>n+g.rows.length,0)<=15);for(const group of page.items){assert.equal(group.rowSpan,group.rows.length);seen.push(...group.rows);}}
 assert.equal(new Set(seen.map(row=>row.id)).size,3000);assert.deepEqual(seen,original);seen.forEach((row,i)=>assert.equal(row,original[i]));assert.equal(seen.reduce((n,row)=>n+row.quantity,0),6000);
 const boundary=getGroupedRowPage([{rows:original.slice(0,17)},{rows:original.slice(17,40)}],15,15);assert.deepEqual(boundary.items.map(g=>g.rowSpan),[2,13]);
});
