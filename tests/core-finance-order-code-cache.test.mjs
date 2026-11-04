import test from 'node:test';
import assert from 'node:assert/strict';
import {appFunction} from './helpers/app-source-function.mjs';
import {createProjectionCache} from '../src/services/cooperativeProjection.js';
import {createBoundedCollationCompare} from '../src/services/collationCompareCache.js';

test('actual finance order-code lookup preserves last-match precedence and reopens without rebuilding every memo token',()=>{
 const first=Object.freeze({id:'a',codes:Object.freeze(['shared','one'])}),last=Object.freeze({id:'b',codes:Object.freeze(['shared','two'])});let calls=0;
 const bindings={orders:Object.freeze([first,Object.freeze({codes:['must-skip']}),last]),financeOrderCodeScope:'company:actor:all',
  financeOrderCodeCache:createProjectionCache({maxScopes:1}),buildOrderMemoCandidates:order=>{calls++;return order.codes}};
 const run=()=>appFunction('orderByCodeMap',bindings,{memoCallback:true,scope:'FinanceView'})();
 const original=new Map();bindings.orders.forEach(order=>{if(order.id)order.codes.forEach(code=>original.set(code,order))});
 const actual=run(),before=calls;assert.deepEqual([...actual],[...original]);assert.equal(actual.get('shared'),last);assert.equal(actual.has('must-skip'),false);
 assert.equal(run(),actual);assert.equal(calls,before);
 const changed=Object.freeze({id:'b',codes:Object.freeze(['changed'])});bindings.orders=Object.freeze([first,changed]);
 const next=run();assert.notEqual(next,actual);assert.equal(next.has('two'),false);assert.equal(next.get('shared'),first);assert.equal(actual.get('shared'),last);
 bindings.financeOrderCodeScope='company:other-actor:assigned';assert.notEqual(run(),next);
 bindings.financeOrderCodeScope='company:actor:all';assert.notEqual(run(),next,'one scope bound prevents accumulating large token maps');
});

test('finance payment customer picker retains Vietnamese ordering, archived exclusion, search semantics and30-row cap',()=>{
 const customers=Object.freeze(['Đức','Dũng','Ánh','An','Chị Thu','Thu 2','Thu 10','A','a',...Array.from({length:40},(_,i)=>`Khách ${i}`)]
  .map((name,index)=>Object.freeze({id:String(index),name,phone:'090'+index,isArchived:index===2,address:'Bình Thạnh',customerGroup:'Nhóm'})));
 const normalizeLookupText=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 const bindings={customers,normalizeLookupText,paymentCustomerSearch:'',compareVietnameseText:createBoundedCollationCompare(new Intl.Collator('vi'))};
 for(const keyword of ['','thu','binh','0901','nomatch']){
  bindings.paymentCustomerSearch=keyword;
  const expected=customers.filter(c=>!c.isArchived).filter(c=>!keyword||[c.name,c.phone,c.address,c.customerGroup].some(value=>normalizeLookupText(value).includes(normalizeLookupText(keyword))))
    .sort((a,b)=>(a.name||'').localeCompare(b.name||'','vi')).slice(0,30);
  assert.deepEqual(appFunction('paymentCustomerOptions',bindings,{memoCallback:true,scope:'FinanceView'})(),expected);
 }
});
