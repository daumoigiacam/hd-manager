import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {appFunction,appObject} from './helpers/app-source-function.mjs';
import {readApplicationSource} from '../scripts/helpers/application-source.cjs';
import {settingsDataFixture} from '../development/hd-manager/application/tests/helpers/settings-data-fixture.mjs';

const source=readApplicationSource();
const collections=appObject('DATA_COLLECTION_NAMES').elements.map(node=>node.value).filter(name=>name!=='companies');
const normalize=appFunction('normalizeBackupCollectionItems');
const count=appFunction('countBackupRecords',{BACKUP_DATA_COLLECTIONS:collections,normalizeBackupCollectionItems:normalize});
function restoreFixture(fail=false){
  const fixture=settingsDataFixture();
  if(fail)fixture.flags.failChunk=1;
  return {restore:fixture.restore,docs:fixture.docs,get writes(){return fixture.businessWrites.map(([ref,payload])=>({path:ref.split('/'),payload}));}};
}

// master-backup-scheduling retains 15 actual scheduler/handler oracles: complete
// baseline output, tenant scopes, cancellation and every failure boundary.
// Current writes/Rules are covered by audited manual-order, delivery-cashflow,
// payroll, asset and message guard suites, rather than old whole-file hashes.
test('backup manifest retains financial and locked-payroll collections; backup performs no document mutations',()=>{
  for(const name of ['orders','payments','expenses','financials','advances','payrollPeriods','payrollSnapshots','payrollAdjustments','payrollDebtCarryovers'])assert.ok(collections.includes(name),name);
  const backup=appFunction('handleCreateCompanyBackup').toString();
  assert.equal(/\b(?:setDoc|updateDoc|deleteDoc|runTransaction|writeBatch)\s*\(/.test(backup),false);
});

test('restore preserves exact financial values, links and archived state while targeting the selected tenant only',async()=>{
  const payload={sourceCompanyId:'old-tenant',collections:{
    orders:[{id:'order-a',companyId:'old-tenant',total:2032000,paid:0}],
    payments:{'receipt-a':{companyId:'old-tenant',amount:929000,matchedOrderId:'order-a',isArchived:false}},
    expenses:[{id:'cost-a',companyId:'old-tenant',amount:55000,approvalStatus:'approved',cashflowStatus:'confirmed',isArchived:true}],
    payrollSnapshots:[{id:'locked-a',companyId:'old-tenant',status:'locked',closingBalance:809666}],
    forged_authority:[{id:'not-in-backup-manifest',amount:999}],
  }};
  const before=structuredClone(payload),f=restoreFixture();
  const locked={...payload.collections.payrollSnapshots[0],companyId:'target'};
  f.docs.set('payrollSnapshots/locked-a',structuredClone(locked));
  const result=await f.restore(payload);
  assert.equal(result.success,true);assert.equal(result.restoredCount,4);assert.deepEqual(payload,before);
  assert.deepEqual(f.docs.get('payrollSnapshots/locked-a'),locked);
  assert.equal(f.writes.length,3,'An existing identical locked snapshot is retained without a write');
  for(const write of f.writes){
    const name=write.path.at(-2),id=write.path.at(-1);
    assert.ok(collections.includes(name));assert.equal(write.payload.companyId,'target');
    const original=normalize(payload.collections[name]).find(row=>row.id===id);
    for(const[key,value]of Object.entries(original).filter(([key])=>key!=='companyId'))assert.deepEqual(write.payload[key],value,name+'.'+key);
  }
});

test('full backup counts and restore retain all records beyond presentation page limits',async()=>{
  const financials=Array.from({length:43},(_,index)=>({id:'financial-'+index,companyId:'old-tenant',amount:index+0.25}));
  const payload={sourceCompanyId:'old-tenant',collections:{financials}};assert.equal(count(payload),43);
  const f=restoreFixture();assert.equal((await f.restore(payload)).restoredCount,43);
  assert.deepEqual(Object.fromEntries(f.writes.map(row=>[row.payload.id,row.payload.amount])),Object.fromEntries(financials.map(row=>[row.id,row.amount])));
});

test('restore rejects server failures instead of returning financial success',async()=>{
  const f=restoreFixture(true);
  await assert.rejects(f.restore({collections:{payments:[{id:'receipt',amount:1000}]}}),/Business chunk rejected/);
});

test('deployed function public exports retain the baseline API without pinning audited implementation bytes',()=>{
  const exported=text=>new Set([...text.matchAll(/\bexports\.(\w+)\s*=/g)].map(match=>match[1]));
  const baseline=exported(execFileSync('git',['show','d4262219:functions/index.js'],{encoding:'utf8',maxBuffer:10*1024*1024}));
  const current=exported(readFileSync(new URL('../functions/index.js',import.meta.url),'utf8'));
  assert.ok(baseline.size>0);for(const name of baseline)assert.ok(current.has(name),'Missing public export: '+name);
  assert.equal(/commitAtomicInventoryOperation|commitOrderReturnTransaction|useScreenCursorState/.test(source),false);
});
