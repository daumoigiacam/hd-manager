import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {appFunction} from './helpers/app-source-function.mjs';
import {runCooperativeProjection} from '../src/services/cooperativeProjection.js';
import {resolveTransactionBillingSnapshot} from '../src/services/customerProductBilling.js';
const env={resolveTransactionBillingSnapshot,getPricingProductGroupKey:p=>p.groupKey||'duck',inferPricingGroupKeyFromText:()=> 'duck'};
for(const name of ['capitalizeFirst','normalizeLookupText','parseLooseQuantityValue','parseLooseMoneyValue','normalizeLeadingLabel',
  'getOrderLineUnitPriceValue','getOrderLineQuantityValue','getOrderLineWeightKgValue','getTransactionBillingPresentation',
  'normalizePricingProductFormulaChildren','normalizePricingProductFormulas','getPricingProductId','getPricingProductName',
  'getPricingProductUnit','getPricingGroupMargin','getPricingSalesProductName','getPricingDocumentLineItems',
  'getPricingOrderLineProductId','getPricingOrderLineQuantity','getPricingOrderLineRevenue','matchesPricingFormulaChild'])env[name]=appFunction(name,env);
const build=appFunction('buildPricingProductFormulaSummaries',env);
const frozen=readFileSync(new URL('./fixtures/pricing-product-formula.baseline.mjs',import.meta.url),'utf8');
const baseline=new Function(...Object.keys(env),'return '+frozen.slice(frozen.indexOf('export default ')+15))(...Object.values(env));
function input(){return {products:[{id:'root',name:'Vịt nguyên con',unit:'Con'},{id:'wing',name:'Cánh vịt',unit:'Kg'},{id:'foot',name:'Chân vịt'}],
  productFormulas:[{id:'f',rootProductId:'root',rootGroupKey:'duck',children:[{id:'a',productId:'wing',outputRatioPercent:15.5,lossPercent:2,valueFactor:1.2},
    {id:'b',productId:'foot',outputRatioPercent:25.6,lossPercent:3},{id:'duplicate',productId:'wing',outputRatioPercent:20}]}],
  latestInputsByGroup:{duck:{rawKgPrice:52000,totalKg:31.2,quantity:12}},marginByGroup:{duck:{targetMargin:22.4}},
  orders:Array.from({length:500},(_,i)=>({id:'o'+i,isArchived:i%17===0,status:i%19?'done':'cancelled',
    items:[{productId:i%2?'wing':'foot',productName:i%3?'Cánh vịt':'Chân vịt',quantity:i%5?0.1:0.2,unit:'Kg',unitPrice:25000+i},
      {productName:'Cánh vịt',quantity:0.15,amount:13.3},{productId:'unknown',quantity:99}]}))};}
test('cooperative product formulas preserve frozen first-child matching, billing, cost allocation and decimal order',async()=>{
  for(const adjust of [x=>x,x=>({...x,orders:[...x.orders].reverse()}),x=>({...x,latestInputsByGroup:{},marginByGroup:{}})]){
    const source=adjust(input()),before=structuredClone(source);let turns=0;
    assert.deepEqual(build(source),baseline(source));
    assert.deepEqual(await runCooperativeProjection(()=>build({...source,cooperative:true}),{maxOperations:16,yieldTask:async()=>{turns++;}}),baseline(source));
    assert.ok(turns>20);assert.deepEqual(source,before);
  }
});
test('closing or superseding a large formula calculation cannot publish partial product totals',async()=>{
  const source=input(),before=structuredClone(source),controller=new AbortController();let turns=0,published=false;
  await assert.rejects(runCooperativeProjection(()=>build({...source,cooperative:true}),{signal:controller.signal,maxOperations:16,
    yieldTask:async()=>{if(++turns===6)controller.abort();}}).then(()=>{published=true;}),{name:'AbortError'});
  assert.equal(published,false);assert.deepEqual(source,before);
});
test('actual closed pricing section never scans orders or computes hidden formula summaries',()=>{
  const prepare=appFunction('preparePricingFormulaSummaries',{formulaProjectionAttempt:0,formulaSectionOpen:false,
    buildPricingProductFormulaSummaries:()=>{throw Error('Hidden formula calculation');}}, {scope:'SimplePricingEngineView',memoCallback:true});
  assert.deepEqual(prepare().next(),{done:true,value:[]});
});
