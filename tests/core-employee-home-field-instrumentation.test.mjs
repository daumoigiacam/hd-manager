import test from 'node:test';import assert from 'node:assert/strict';import path from 'node:path';import {pathToFileURL} from 'node:url';
import {instrumentEmployeeHomeSpreads as instrument,collectEmployeeHomeCandidateFields as fields} from '../scripts/helpers/employee-home-field-instrumentation.mjs';
import {createEmployeeHomeFieldProjection as create} from '../src/services/employeeHomeFieldProjection.js';
const guardImport=pathToFileURL(path.resolve('src/services/employeeHomeFieldProjection.js')).href;
const load=async source=>{const built=instrument(source,{guardImport});return {built,module:await import('data:text/javascript;base64,'+Buffer.from(built.code).toString('base64'))}};
test('source instrumentation preserves nested/spread argument parentheses and original ordinary results',async()=>{
 const original=`export function build(x){return {...(x||{}),nested:{...({...x}),amount:(x?.amount||0)+5},tail:3}}`;
 const a=await import('data:text/javascript;base64,'+Buffer.from(original).toString('base64')),b=await load(original);
 assert.equal(b.built.spreads,3);for(const input of [null,undefined,{}, {amount:12,note:'synthetic'}])assert.deepEqual(b.module.build(input),a.build(input));
 assert.throws(()=>instrument(b.built.code),/unchanged/);
});
test('real transformed object clones retain guards through nested ledger-like calculations and caught unknown fields',async()=>{
 const candidate=await load(`export function calculate(order,readUnknown=false){const first={...order,appliedAmount:25};const second={...({...first}),outstandingAmount:order.amount-first.appliedAmount};if(readUnknown){try{return second.unrequestedCost||0}catch{return 0}}return {amount:second.outstandingAmount}}`);
 const schema={orders:['id','companyId','isArchived','amount']};
 const p=create(schema);try{assert.deepEqual(candidate.module.calculate(p.source('orders',{id:'synthetic',companyId:'synthetic',amount:125})),{amount:100});p.assertVerified()}finally{p.close()}
 const q=create(schema);try{assert.equal(candidate.module.calculate(q.source('orders',{id:'synthetic',companyId:'synthetic',amount:125}),true),0);assert.throws(()=>q.assertVerified(),{code:'unproven_home_field_projection'})}finally{q.close()}
});
test('candidate fields include literal and static accesses/destructuring without truncating dynamic accesses into invented fields',()=>{
 const result=fields(`export function f(row,key){const {amount:total}=row;return row?.createdAt||row['legacyAmount']||row[key]||total}`);
 assert(result.includes('amount'));assert(result.includes('legacyAmount'));assert(result.includes('createdAt'));assert(result.includes('companyId'));assert(!result.includes('key'));
});
