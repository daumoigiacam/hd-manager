import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';import {extractEmployeeHomeDomain} from '../scripts/helpers/employee-home-domain-extraction.mjs';
const file=new URL('../src/features/customers/productCRMShared.jsx',import.meta.url),text=fs.readFileSync(file,'utf8');
const original=extractEmployeeHomeDomain(text,fileURLToPath(new URL('.',file)),['buildCustomerQuoteShareText']);
const output=await build({stdin:{contents:original,resolveDir:process.cwd(),sourcefile:'canonical-quote-domain.js'},bundle:true,write:false,format:'esm',platform:'node',logLevel:'silent'});
const {buildCustomerQuoteShareText:quote}=await import('data:text/javascript;base64,'+Buffer.from(output.outputFiles[0].text).toString('base64'));
test('canonical quote subtracts the real payment source: 120000 minus 40000 equals 80000',()=>{
 const customer={id:'c1',companyId:'qa-tenant',name:'QA Customer',openingDebt:0},product={id:'p1',name:'Gà',unit:'Kg'};
 const order={id:'o1',companyId:'qa-tenant',customerId:'c1',date:'2026-11-15',amount:120000};
 const payment={id:'payment1',companyId:'qa-tenant',customerId:'c1',date:'2026-11-15',amount:40000,method:'cash',allocations:[{orderId:'o1',amount:40000}]};
 const common={customer,quoteProducts:[product],currentCompany:{name:'QA Company'},orders:[order],priceOverrides:{p1:{price:67000}}};
 const incorrectWithoutPayments=quote(common),correct=quote({...common,payments:[payment]});
 assert(correct.includes('67.000'));assert(correct.includes('Công nợ hiện tại của khách: 80.000 đ.'));
 assert(incorrectWithoutPayments.includes('Công nợ hiện tại của khách: 120.000 đ.'));
 assert.equal(order.amount,120000);assert.equal(payment.amount,40000);
});
