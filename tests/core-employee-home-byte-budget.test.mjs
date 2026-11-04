import test from 'node:test';import assert from 'node:assert/strict';import {serialize,deserialize} from 'node:v8';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),sdk=createRequire(new URL('../functions/package.json',import.meta.url));
const {Timestamp,GeoPoint}=sdk('firebase-admin/firestore'),Long=sdk('long');
const {measureHomePrivateByteUpperBound:measure,createHomePrivateByteBudget:budget}=require('../functions/employeeHomeByteBudget');
const {encodeEmployeeHomePrivateValue:encode,decodeEmployeeHomePrivateValue:decode}=require('../functions/employeeHomePrivateValues');
test('private budget bounds actual complete codec serialization without changing input or values',()=>{
 const nullMap=Object.assign(Object.create(null),JSON.parse('{"__proto__":{"literal":"kept"},"constructor":false}'));
 const values=[null,undefined,true,false,-0,NaN,Infinity,-Infinity,Number.MAX_VALUE,'Tiếng Việt 😀 漢字 \ud800',
  new Timestamp(-123,999999999),new GeoPoint(10.8,106.7),Buffer.from([0,255]),new Date(NaN),new Date(0),[],new Array(10000),nullMap];
 const array=[1,,3];Object.defineProperty(array,'__proto__',{value:'literal array key',enumerable:true,writable:true,configurable:true});values.push(array);
 let nested={stamp:new Timestamp(42,987654321)};for(let i=0;i<60;i++)nested={['path_'+i]:nested};values.push(nested);
 // Node22 considers distinct invalid Date instances unequal (and its TAP
 // reporter can throw while printing them). Compare the exact serialized wire
 // bytes instead: this still checks invalid dates, sparse arrays and -0/NaN.
 for(const value of values){const before=encode(value),wire=serialize(before),actual=wire.byteLength,upper=measure(value);assert(upper>=actual,`bound ${upper} < ${actual}`);assert.deepEqual(serialize(encode(value)),wire);assert.deepEqual(serialize(encode(decode(deserialize(wire)))),wire)}
});
test('conservative estimate compacts to original exact record sizes before rejecting any valid snapshot',()=>{
 const values=[{amount:100,note:'Tiếng Việt'},new Timestamp(123,456),{data:Buffer.alloc(300)}],exact=values.reduce((sum,v)=>sum+serialize(encode(v)).byteLength,0);
 const accepted=budget(exact);for(const value of values)accepted.admit(value);assert.equal(accepted.stats().records,3);assert(accepted.stats().accountedBytes<=exact);assert(accepted.stats().compactions>0);
 const rejected=budget(exact-1);assert.throws(()=>{for(const v of values)rejected.admit(v)},{code:'home_snapshot_byte_limit'});
 const repeated=Array.from({length:1000},(_,i)=>({amount:i,note:'same synthetic text'})),repeatedExact=repeated.reduce((sum,v)=>sum+serialize(encode(v)).byteLength,0),linear=budget(repeatedExact);
 for(const value of repeated)linear.admit(value);assert.deepEqual(linear.stats(),{records:1000,accountedBytes:repeatedExact,compactions:1,exactMode:true});
 assert.throws(()=>linear.admit({amount:1}),{code:'home_snapshot_byte_limit'});assert.equal(linear.stats().compactions,1);assert.equal(linear.stats().records,1000);
 assert.throws(()=>budget(0),TypeError);assert.throws(()=>budget(24*1024*1024+1),TypeError);
});
test('deterministic varied financial/native fixtures are conservatively bounded and budgets cannot be bypassed',()=>{
 let seed=0x2468ace;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296};
 const make=depth=>{const n=Math.floor(random()*(depth?12:8));
  if(n===0)return null;if(n===1)return undefined;if(n===2)return random()<.5;if(n===3)return (random()-.5)*1e12;
  if(n===4)return 'Hóa đơn 😀 漢字'.repeat(Math.floor(random()*30));if(n===5)return new Timestamp(Math.floor(random()*1e9),Math.floor(random()*1e9));
  if(n===6)return new GeoPoint(random()*90,random()*180);if(n===7)return Buffer.alloc(Math.floor(random()*250),123);
  if(n<10)return Array.from({length:Math.floor(random()*8)},()=>make(depth-1));
  return Object.fromEntries(Array.from({length:Math.floor(random()*10)},(_,i)=>['field_'+i,make(depth-1)]));
 };
 for(let i=0;i<500;i++){const value=make(4),encoded=encode(value),upper=measure(value);assert(upper>=serialize(encoded).byteLength);assert.throws(()=>measure(value,{limit:upper-1}),{code:'home_snapshot_byte_limit'})}
 const value={stamp:new Timestamp(1793590000,987654321),bytes:Buffer.alloc(2000),amount:Number('9223372036854775807'),note:'Tiếng Việt 😀'.repeat(100)};
 const upper=measure(value);assert(upper>=serialize(encode(value)).byteLength);assert.throws(()=>measure(value,{limit:upper-1}),{code:'home_snapshot_byte_limit'});
});
test('unknown prototypes, cycles, depth and non-finite private budgets fail closed',()=>{
 const cycle={};cycle.self=cycle;let deep={};for(let i=0;i<66;i++)deep={child:deep};
 for(const value of [cycle,deep,()=>{},Symbol('x'),1n,new Map(),new Set(),new RegExp('x'.repeat(1000)),new ArrayBuffer(1000),new Uint32Array(1000)])assert.throws(()=>measure(value),{code:'unsupported_home_value'});
 assert.throws(()=>measure(Long.fromNumber(42)),{code:'unsupported_home_value'});
 for(const limit of [NaN,Infinity,-1,32*1024*1024+1])assert.throws(()=>measure({}, {limit}),TypeError);
 assert.throws(()=>measure({}, {limit:0}),{code:'home_snapshot_byte_limit'});
 const wire=encode({stamp:new Timestamp(1,2)});assert(measure(wire)>=serialize(encode(wire)).byteLength);
});
