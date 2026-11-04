import test from 'node:test';import assert from 'node:assert/strict';
import {createEmployeeHomeFieldProjection as create,employeeHomeSpreadSource as source,employeeHomeSpreadResult as result} from '../src/services/employeeHomeFieldProjection.js';
const fields=['id','companyId','isArchived','amount','date','customerId'],row={id:'synthetic-order',companyId:'synthetic-company',amount:125,date:'2026-11-02'};
const copy=value=>result({...source(value)});
test('projected source fields preserve values, known absence and nested spread calculations; sources cannot mutate',()=>{
 const p=create({orders:fields});try{
  const input=p.source('orders',{...row}),first=result({...source(input),outstandingAmount:input.amount});
  assert.equal(input.amount,125);assert.equal(input.isArchived,undefined);
  first.outstandingAmount-=25;const second=result({...source(first),paidAmount:25});
  assert.equal(second.outstandingAmount,100);assert.equal(second.paidAmount,25);assert.equal(second.amount,125);
  assert.equal(Object.getPrototypeOf(first),Object.prototype);p.assertVerified();
  assert.throws(()=>{input.amount=1},{code:'unproven_home_field_projection'});assert.equal(row.amount,125);assert.throws(()=>p.assertVerified());
 }finally{p.close()}
});
test('unknown get/has/descriptor/enumeration and a caught failure never become successful zero or undefined',()=>{
 for(const operation of [v=>v.unrequestedCost,v=>'unrequestedCost'in v,v=>Object.getOwnPropertyDescriptor(v,'unrequestedCost'),v=>Object.keys(v),v=>Object.values(v),v=>Object.entries(v),v=>({...v})]){
  const p=create({orders:fields});try{
   const first=copy(p.source('orders',{...row})),second=copy(first);
   try{operation(second)}catch{/* simulate an inner helper swallowing errors */}
   assert.throws(()=>p.assertVerified(),{code:'unproven_home_field_projection'});
  }finally{p.close()}
 }
});
test('spreading two source collections preserves restrictions from both, including when one mask allows an absent field',()=>{
 const p=create({orders:fields,customers:['id','companyId','isArchived','customerId','unrequestedCost']});try{
  const order=p.source('orders',{...row}),customer=p.source('customers',{id:'synthetic-customer',companyId:'synthetic-company'});
  const both=result({...source(order),...source(customer)});assert.equal(both.amount,125);
  assert.throws(()=>both.unrequestedCost,{code:'unproven_home_field_projection'});assert.throws(()=>p.assertVerified());
 }finally{p.close()}
});
test('different projection lifetimes cannot mix through a spread; closed records and context admission fail closed',()=>{
 const a=create({orders:fields}),b=create({orders:fields});try{
  const one=a.source('orders',{...row}),two=b.source('orders',{...row});
  assert.throws(()=>result({...source(one),...source(two)}),{code:'unproven_home_field_projection'});
 }finally{a.close();b.close()}
 const active=Array.from({length:4},()=>create({orders:fields}));try{assert.throws(()=>create({orders:fields}))}finally{active.forEach(p=>p.close())}
 const next=create({orders:fields}),protectedRow=next.source('orders',{...row});next.close();assert.throws(()=>protectedRow.amount);assert.throws(()=>source(protectedRow));
 const current=create({orders:fields});try{try{protectedRow.amount}catch{/* stale cached helper swallows the error */}assert.throws(()=>current.assertVerified())}finally{current.close()}
});
test('field declarations and source shape are strict; ordinary unprojected spreads retain ordinary JavaScript behavior',()=>{
 for(const input of [{},{orders:[]},{orders:['id','companyId']},{orders:[...fields,'amount']},{employees:fields},{orders:[...fields,'a.b']}])assert.throws(()=>create(input));
 const p=create({orders:fields});try{assert.throws(()=>p.source('orders',{...row,unexpected:999}));assert.throws(()=>p.assertVerified())}finally{p.close()}
 const plain={a:1};assert.equal(source(plain),plain);assert.deepEqual(result({...source(plain),a:2}),{a:2});assert.equal(source(null),null);
});
