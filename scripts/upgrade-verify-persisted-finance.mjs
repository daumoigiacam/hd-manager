import fs from'node:fs/promises';import path from'node:path';import crypto from'node:crypto';import assert from'node:assert/strict';import{createRequire}from'node:module';import{build}from'esbuild';
import{extractEmployeeHomeDomain}from'./helpers/employee-home-domain-extraction.mjs';import{makeRichSyntheticFixture}from'../performance/upgrade-20261103/rich-synthetic-fixture.mjs';
if(process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8185')throw Error('Only demo Emulator allowed');
const root='test-results/performance-upgrade-20261103',source=await fs.readFile('src/App.jsx','utf8'),extracted=extractEmployeeHomeDomain(source,path.resolve('src'),['buildCustomerLedger']);
const compiled=await build({stdin:{contents:extracted,resolveDir:process.cwd()},bundle:true,platform:'node',format:'cjs',write:false}),module={exports:{}};
new Function('module','exports',compiled.outputFiles[0].text)(module,module.exports);const{buildCustomerLedger}=module.exports;
const require=createRequire(import.meta.url),admin=require('../functions/node_modules/firebase-admin'),app=admin.initializeApp({projectId:'demo-hdm-perf-verification'},'upgrade-persisted-finance'),db=app.firestore();
const report={at:new Date().toISOString(),syntheticOnly:true,productionRequests:0,status:'RUNNING',sourceSha256:crypto.createHash('sha256').update(source).digest('hex'),
 conditions:'Read all persisted documents in isolated load namespaces, including outcomes reported failed. Exact current App buildCustomerLedger plus foreign-key/quantity checks. This is not a financial audit of any real business.',namespaces:[]};
try{
 for(const file of ['active-concurrency-integrity.json','active-workflow-load.json','active-workflow-load-recovery.json']){
  const run=JSON.parse(await fs.readFile(`${root}/${file}`,'utf8'));if(!/^upgrade-(?:integrity|active)-\d+$/.test(run.appId))throw Error('Unexpected fake namespace');
  const collections={},hashes={};for(const c of ['customers','orders','payments','orderRequests','warehouseDispatches']){const rows=(await db.collection(`artifacts/${run.appId}/public/data/${c}`).get()).docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>a.id.localeCompare(b.id));collections[c]=rows;hashes[c]=crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex')}
  const{customers,orders,payments,orderRequests,warehouseDispatches}=collections;const orderById=new Map(orders.map(o=>[o.id,o]));let sales=0,paid=0,debt=0;
  for(const order of orders){assert.equal(order.amount,300000);sales+=order.amount}
  for(const payment of payments){const order=orderById.get(payment.orderId);assert.ok(order,'No persisted payment may reference a missing order');assert.equal(payment.customerId,order.customerId);assert.equal(payment.amount,100000);paid+=payment.amount}
  for(const request of orderRequests){assert.equal(request.items[0].quantity,3);assert.equal(request.items[0].sizeLabel,'To');assert.equal(request.syncVersion,file==='active-concurrency-integrity.json'&&request.id==='request-49'?2:1)}
  for(const dispatch of warehouseDispatches)assert.equal(dispatch.quantity,3);
  for(const customer of customers){const ledger=buildCustomerLedger(customer,orders,payments);debt+=ledger.currentDebt}
  assert.equal(debt,sales-paid);report.namespaces.push({source:file,appId:run.appId,counts:Object.fromEntries(Object.entries(collections).map(([k,v])=>[k,v.length])),hashes,sales,paid,currentAppLedgerDebt:debt,expectedSalesLessPayments:sales-paid,orphanPayments:0,
   qualification:file==='active-concurrency-integrity.json'?'Exact active dispatch conversion and repeated/colliding command cases.':'All persisted records verified, including partial failed workflows. These earlier load fixtures did not include dispatch-to-order linkage and cannot prove complete inventory conversion coverage.'});
 }
 const rich=makeRichSyntheticFixture();let debt=0;const orders=Object.values(rich.data.orders),payments=Object.values(rich.data.payments);
 for(const customer of Object.values(rich.data.customers))debt+=buildCustomerLedger(customer,orders,payments).currentDebt;
 assert.equal(debt,rich.workload.expectedSalesLessPayments);report.richFixture={orders:orders.length,payments:payments.length,currentAppLedgerDebt:debt,expected:rich.workload.expectedSalesLessPayments};report.status='LOCAL_SYNTHETIC_PERSISTED_AND_LEDGER_INTEGRITY_PASS';
}catch(error){report.status='FAILED';report.error={message:error.message,stack:error.stack};process.exitCode=1}
finally{report.endedAt=new Date().toISOString();await fs.writeFile(`${root}/persisted-finance-integrity.json`,JSON.stringify(report,null,2));await app.delete();console.log(JSON.stringify(report))}
