import test from 'node:test';
import assert from 'node:assert/strict';
import {compareRestDocumentNames,collectTenantRestQuery,consumeTenantRestQuery} from '../src/services/firestoreRestPagination.js';

test('allocation-free REST name ordering matches TextEncoder bytes, including astral and unpaired surrogates',()=>{
  const encoder=new TextEncoder();
  const oracle=(a,b)=>{const x=encoder.encode(a),y=encoder.encode(b);for(let i=0;i<Math.min(x.length,y.length);i++)if(x[i]!==y[i])return Math.sign(x[i]-y[i]);return Math.sign(x.length-y.length)};
  const names=['','abc','ab','a\0','Vịt','Vit','🦆','\ue000','\ud800','\udfff','\ufffd','\ud800a','\ufffda','\ud800\udc00'];
  let seed=17;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed};
  for(let i=0;i<300;i++)names.push('projects/demo/documents/orders/'+String.fromCharCode(...Array.from({length:12},()=>random()&0xffff)));
  for(const a of names)for(const b of names)assert.equal(Math.sign(compareRestDocumentNames(a,b)),oracle(a,b));
});

const parent='projects/demo-cooperative/databases/(default)/documents/artifacts/test/public/data';
const time='2026-10-31T01:00:00.123456Z';
const body={structuredQuery:{from:[{collectionId:'orders'}],where:{fieldFilter:{field:{fieldPath:'companyId'},op:'EQUAL',value:{stringValue:'a'}}}}};
const records=Array.from({length:201},(_,i)=>({name:`${parent}/orders/doc-${String(i).padStart(4,'0')}`,fields:{companyId:{stringValue:'a'},amount:{integerValue:String(i)}}}));
const decode=fields=>({companyId:fields.companyId.stringValue,amount:Number(fields.amount.integerValue)});
const options=()=>({queryBody:body,context:{parent,companyId:'a',accountType:'employee'},pageSize:200,decodeFields:decode,
 runQuery:async request=>{
  const cursor=request.structuredQuery.startAt?.values[0].referenceValue;
  const page=records.filter(d=>!cursor||compareRestDocumentNames(d.name,cursor)>0).slice(0,request.structuredQuery.limit);
  return page.length?page.map(document=>({document,readTime:time})):[{readTime:time}];
 }});

test('validation and decoding yield between records while preserving complete pinned snapshot and order',async()=>{
  let clock=0,yields=0,decoded=0,decodedAtYield=0,maxBatch=0;
  const result=await collectTenantRestQuery({...options(),now:()=>clock++,budgetMs:4,
   decodeFields:fields=>{decoded++;return decode(fields)},yieldWork:async()=>{
    yields++;maxBatch=Math.max(maxBatch,decoded-decodedAtYield);decodedAtYield=decoded;
   }});
  assert.deepEqual(result.items,records.map(d=>({id:d.name.split('/').at(-1),data:decode(d.fields)})));
  assert.equal(result.readTime,time);assert.equal(result.pageCount,2);assert.equal(result.exhausted,true);
  assert.ok(yields>50);assert.ok(maxBatch<=4);assert.equal(decoded,201);
});

test('cancellation while validating or decoding never publishes a partial page',async()=>{
  for(const phase of ['validation','decoding']){
   let clock=0,decoded=0;const controller=new AbortController(),published=[];
   await assert.rejects(consumeTenantRestQuery({...options(),signal:controller.signal,now:()=>clock++,budgetMs:4,
    decodeFields:fields=>{decoded++;return decode(fields)},yieldWork:async()=>{
     if(phase==='validation'||decoded>0)controller.abort();
    }},rows=>published.push(rows)),{name:'AbortError'});
   assert.deepEqual(published,[]);
   if(phase==='validation')assert.equal(decoded,0);else assert.ok(decoded>0&&decoded<200);
  }
});

test('tenant changes after yielding and foreign rows late in a page still fail closed',async()=>{
 let clock=0,current=true;
 await assert.rejects(collectTenantRestQuery({...options(),isCurrent:()=>current,now:()=>clock++,yieldWork:async()=>{current=false}}),{name:'AbortError'});
 const o=options(),original=o.runQuery;let published=false;
 await assert.rejects(consumeTenantRestQuery({...o,now:()=>clock++,yieldWork:async()=>{},runQuery:async request=>{
  const rows=await original(request);return rows.map((row,i)=>i===150?{...row,document:{...row.document,fields:{companyId:{stringValue:'foreign'}}}}:row);
 }},()=>{published=true}),/Foreign tenant/);
 assert.equal(published,false);
});
