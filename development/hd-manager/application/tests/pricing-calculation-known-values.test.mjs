import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parse} from '@babel/parser';
const sources=['../src/App.jsx','../src/features/customers/productCRMShared.jsx'].map(file=>{
  const source=fs.readFileSync(new URL(file,import.meta.url),'utf8');return {source,tree:parse(source,{sourceType:'module',plugins:['jsx']})};
});
function actual(name,env){let selected;for(const {source,tree}of sources){function visit(n){if(!n||typeof n!=='object')return;if(n.type==='VariableDeclarator'&&n.id?.name===name)selected={source,node:n.init};for(const[k,v]of Object.entries(n)){if(['loc','comments','extra'].includes(k))continue;if(Array.isArray(v))v.forEach(visit);else if(v?.type)visit(v);}}visit(tree);if(selected)break;}assert.ok(selected,name);return Function(...Object.keys(env),'return ('+selected.source.slice(selected.node.start,selected.node.end)+')')(...Object.values(env));}
const env={LOOKUP_NORMALIZATION_MAX_LENGTH:256,LOOKUP_NORMALIZATION_CACHE_LIMIT:4096,lookupNormalizationCache:new Map()};for(const name of ['parseLooseMoneyValue','parseLooseQuantityValue','roundPricingToThousand','normalizeLookupText','inferPricingTypeKeyFromText','getPricingFinalStageCostPerKg','pricingCutPartDraftsToRules'])env[name]=actual(name,env);
const calculate=actual('calculatePricingStageSalePrice',env),parts=actual('buildPricingCutPartPriceRows',env);
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} must equal ${b}`);
test('stage price matches independent cost-per-head arithmetic, including decimal comma',()=>{
  close(calculate({purchasePricePerKg:40000,averageWeight:3,lossWeight:0.65,marginPercent:20}),144000/2.35);
  close(calculate({purchasePricePerKg:40000,averageWeight:1,lossWeight:'0,22',marginPercent:25}),50000/0.78);
  close(calculate({purchasePricePerKg:40000,averageWeight:1,lossWeight:0,marginPercent:25}),50000);
  close(calculate({purchasePricePerKg:40000,averageWeight:1,lossWeight:'',outputWeight:0.8,marginPercent:25}),62500);
});
test('no sale price is fabricated for zero input, unavailable purchase cost or zero usable weight',()=>{
  for(const change of [{averageWeight:0},{purchasePricePerKg:0},{lossWeight:1},{lossWeight:2}])assert.equal(calculate({purchasePricePerKg:40000,averageWeight:1,lossWeight:0.2,...change}),0);
});
test('cut-part allocation conserves total carcass cost before sales-price rounding and keeps the source immutable',()=>{
  const input={inputCostPerKg:40000,marginPercent:20,stages:[{name:'Vịt móc',inputWeight:1,outputWeight:0.8,lossWeight:0.2}],cutParts:[{partName:'Phần A',ratioPercent:50,lossPercent:0,valueFactor:1},{partName:'Phần B',ratioPercent:50,lossPercent:10,valueFactor:1.2}]};
  const before=structuredClone(input),rows=parts(input);
  close(rows.reduce((sum,row)=>sum+row.allocatedCostPerKg*row.usableRatioPercent/100,0),50000);
  assert.deepEqual(rows.map(row=>row.suggestedPrice),[58000,69000]);assert.deepEqual(input,before);
});
