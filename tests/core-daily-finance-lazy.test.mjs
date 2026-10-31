import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {appFunction} from './helpers/app-source-function.mjs';
import {resolveTransactionBillingSnapshot} from '../src/services/customerProductBilling.js';
import {runCooperativeReportProjection} from '../src/services/cooperativeReportProjection.js';
const bindings={resolveTransactionBillingSnapshot};
for(const name of ['normalizeLookupText','parseLooseMoneyValue','parseLooseQuantityValue','getOrderLineUnitPriceValue','getOrderLineQuantityValue','getOrderLineWeightKgValue','getTransactionBillingPresentation'])bindings[name]=appFunction(name,bindings);
bindings.resolveEntityDateKey=(row,fallback)=>/^\d{4}-\d{2}-\d{2}$/.test(String(row.date))?row.date:fallback;
const frozen=readFileSync(new URL('./fixtures/daily-finance-breakdown.baseline.mjs',import.meta.url),'utf8');
const baseline=(orders,expenses)=>new Function(...Object.keys(bindings),'orders','expenses','return '+frozen.slice(frozen.indexOf('export default ')+15))(...Object.values(bindings),orders,expenses)();
const factory=(orders,expenses,open)=>appFunction('prepareDailyFinanceBreakdown',{...bindings,orders,expenses,showDailyFinanceDetails:open,company:{id:'fixture'},employee:{id:'fixture'},dailyFinanceAttempt:0,useMemo:f=>f()});

test('closed daily-finance dialog reads no historical record payloads',()=>{
  const forbidden=new Proxy([],{get(){throw Error('Closed dialog must not scan history')}});
  const step=factory(forbidden,forbidden,false)().next();assert.equal(step.done,true);assert.deepEqual(step.value,[]);
});

test('opened daily-finance details yield while preserving frozen amounts, fallback items, exclusions and day order',async()=>{
  const orders=Array.from({length:400},(_,i)=>({id:'o'+i,date:i%13?'2026-10-'+String(1+i%24).padStart(2,'0'):'invalid',
    totalAmount:i%2?'12.345 đ':0,status:i%17?'done':'cancelled',items:[{quantity:2,quantityUnit:'Con',unitPrice:125000}],isArchived:i%19===0}));
  const expenses=Array.from({length:70},(_,i)=>({id:'e'+i,date:'2026-10-'+String(1+i%24).padStart(2,'0'),amount:'1.250 đ',isDeleted:i%9===0}));
  const before=structuredClone({orders,expenses});let clock=0,yields=0;
  const actual=await runCooperativeReportProjection(factory(orders,expenses,true)(),{now:()=>clock++,budgetMs:1,yieldWork:async()=>{yields++}});
  assert.deepEqual(actual,baseline(orders,expenses));assert.ok(yields>5);assert.deepEqual({orders,expenses},before);
});

test('closing or replacing the scope cancels incomplete daily-finance results',async()=>{
  const orders=Array.from({length:500},()=>({date:'2026-10-01',totalAmount:10}));let active=true,published=false;
  await assert.rejects(runCooperativeReportProjection(factory(orders,[],true)(),{isCurrent:()=>active,budgetMs:1,now:()=>0,yieldWork:async()=>{active=false}}).then(()=>{published=true}),{name:'AbortError'});
  assert.equal(published,false);
});
