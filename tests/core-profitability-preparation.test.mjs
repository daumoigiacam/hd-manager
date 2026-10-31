import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
import {runCooperativeReportProjection} from '../src/services/cooperativeReportProjection.js';
const source=await fs.readFile(new URL('../src/services/executiveDashboardService.js',import.meta.url),'utf8');
const frozen=await fs.readFile(new URL('fixtures/profitability-build.baseline.mjs',import.meta.url),'utf8');
const baseline=frozen.slice(frozen.indexOf('export default ')+15).trim().replace(/;$/,'').replace('events.sort(sortProfitEvents)','events.sort(baselineSortProfitEvents)');
const readBaseline=async file=>{const text=await fs.readFile(new URL('fixtures/'+file,import.meta.url),'utf8');return text.slice(text.indexOf('export default ')+15).trim().replace(/;$/,'')};
const inventoryBaseline=await readBaseline('inventory-sold-cost.baseline.mjs');
const businessBaseline=await readBaseline('business-analysis.baseline.mjs');
const bundled=await build({stdin:{contents:source+`
const baselineSortProfitEvents=(a,b)=>{const day=a.dateKey.localeCompare(b.dateKey);return day || (a.type===b.type?0:(PROFIT_EVENT_ORDER[a.type]??9)-(PROFIT_EVENT_ORDER[b.type]??9))};
export const baselineProfitability=${baseline};
export const baselineInventory=${inventoryBaseline};
export const baselineBusiness=${businessBaseline};
export {normalizeInput,createProfitabilitySnapshotReader,buildProfitabilityDiagnostics,buildInventorySoldCostSteps,buildBusinessAnalysisSteps};
`,resolveDir:fileURLToPath(new URL('../src/services',import.meta.url)),sourcefile:'profitability-differential.js'},bundle:true,write:false,format:'esm',platform:'node'});
const module=await import('data:text/javascript;base64,'+Buffer.from(bundled.outputFiles[0].text).toString('base64'));
const {normalizeInput,createProfitabilitySnapshotReader,baselineProfitability,buildProfitabilityDiagnostics}=module;
function fixture(seed){
 const products=[{id:'duck',name:'Vịt 🦆',unit:'Con',groupName:'Vịt'},{id:'chicken',name:'Gà',unit:'Kg',groupName:'Gà'}];
 const days=['2026-09-30','2026-10-01','2026-10-22','2026-10-23','2026-10-24','2026-10-25'];
 return {now:'2026-10-24T12:00:00',products,
  warehouseImports:Array.from({length:40},(_,i)=>({id:'i'+i,date:days[(i+seed)%days.length],productId:products[i%2].id,quantity:(i*7+seed)%19,kg:i%4,amount:(i+1)*1200})),
  warehouseDispatches:Array.from({length:25},(_,i)=>({id:'d'+i,date:days[(i*3+seed)%days.length],productId:products[i%2].id,quantity:i%8,kg:i%3,unit:i%2?'Kg':'Con',costPrice:4500})),
  orders:Array.from({length:65},(_,i)=>({id:'o'+i,date:days[(i*5+seed)%days.length],items:[{productId:products[i%2].id,quantity:i%11,price:10000+i,unit:i%2?'Kg':'Con',costPrice:3200},{productId:'unconfigured',productName:'Khác',quantity:i%3,price:9000,costPrice:2100}]})),
 };
}
test('prepared three-day snapshots and diagnostics equal frozen pre-change profitability including carryover, event ties and missing stock',()=>{
 const days=['2026-10-22','2026-10-23','2026-10-24'];
 for(let seed=0;seed<12;seed++){
  const raw=fixture(seed),source=normalizeInput(raw),before=structuredClone(raw),read=createProfitabilitySnapshotReader(source,days);
  for(const todayKey of days)assert.deepEqual(read(todayKey),baselineProfitability(source,{todayKey}));
  const finance={todayKey:days.at(-1)};
  assert.deepEqual(buildProfitabilityDiagnostics(source,finance,read),buildProfitabilityDiagnostics(source,finance,day=>baselineProfitability(source,{todayKey:day})));
  assert.deepEqual(raw,before,'neither path mutates input');
  assert.equal(read(days[2]),read(days[2]),'today reused within this invocation');
 }
});

test('fine-grained inventory and business steps equal frozen 85616cf1 amounts, row order, allocation and rankings',async()=>{
 for(let seed=0;seed<12;seed++){
  const raw=fixture(seed);raw.employees=[{id:'sales',name:'NV thử',position:'Kinh doanh'}];raw.customers=[{id:'c',name:'Khách thử',empId:'sales',currentDebt:100}];
  raw.orders.forEach((order,i)=>{order.customerId='c';order.salesEmpId='sales';order.amount=10000+i;order.paidAmount=i%3?100:0});
  const source=normalizeInput(raw),before=structuredClone(raw),finance=module.FinancialService.build(source);
  const profitability=module.ProfitabilityService.build(source,finance);let clock=0,yields=0;
  const options={budgetMs:1,now:()=>clock++,yieldWork:async()=>{yields++}};
  const costs=await runCooperativeReportProjection(module.buildInventorySoldCostSteps(source,finance.todayKey),options);
  assert.deepEqual([...costs],[...module.baselineInventory(source,finance.todayKey)]);
  const business=await runCooperativeReportProjection(module.buildBusinessAnalysisSteps(source,finance,profitability),options);
  assert.deepEqual(business,module.baselineBusiness(source,finance,profitability));
  assert.deepEqual(raw,before);assert.ok(yields>10);
 }
});

test('preparation visits each source once, and a new build observes in-place edits, removals and tenant replacements',()=>{
 const raw=fixture(2),source=normalizeInput(raw),days=['2026-10-22','2026-10-23','2026-10-24'];
 let visits=0;const order=source.orders[0],date=order.date;
 Object.defineProperty(order,'date',{configurable:true,get(){visits++;return date}});
 const read=createProfitabilitySnapshotReader(source,days);days.forEach(day=>read(day));
 assert.equal(visits,1,'do not replay source normalization once per report day');
 Object.defineProperty(order,'date',{configurable:true,writable:true,value:'2026-10-24'});
 order.items[0].quantity=777;source.warehouseImports.splice(0,5);
 const next=createProfitabilitySnapshotReader(source,days);
 for(const todayKey of days)assert.deepEqual(next(todayKey),baselineProfitability(source,{todayKey}));
 const other=normalizeInput({now:raw.now,orders:[],products:[{id:'other',name:'Other tenant'}]});
 assert.deepEqual(createProfitabilitySnapshotReader(other,days)(days[2]),baselineProfitability(other,{todayKey:days[2]}));
});
