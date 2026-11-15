import test from 'node:test';
import assert from 'node:assert/strict';
import {searchProducts,searchCustomers,getProductSearchFields,createSearchRecordIndex,createSearchRecordIndexAsync} from '../src/services/searchEngine.js';

test('Product 99 and its initials do not fabricate Product 999; every index lane matches numeric product codes exactly',async()=>{
 const rows=Array.from({length:1000},(_,i)=>({id:'fiction-product-'+i,name:'Synthetic Product '+i,code:'SKU-'+i}));
 const index=createSearchRecordIndex(rows,getProductSearchFields),cooperative=await createSearchRecordIndexAsync(rows,getProductSearchFields);
 for(const query of ['999','product 999','99','SKU-999','100','Product 100']){
  const expected=searchProducts(rows,query);assert.deepEqual(index.search(query),expected);assert.deepEqual(await index.searchAsync(query),expected);
  assert.deepEqual(cooperative.search(query),expected);const fast=index.searchIfSmall(query);if(fast!==null)assert.deepEqual(fast,expected);
 }
 assert.deepEqual(searchProducts(rows,'999').map(row=>row.id),['fiction-product-999']);
 const split={id:'a',name:'Gà 67',shortName:'10',code:'A12',sku:'B34',barcode:'893850000001'};
 for(const query of ['6710','1234'])assert.deepEqual(searchProducts([split],query),[],'independent source values cannot form a fictitious code');
 assert.equal(searchProducts([split],'89385')[0],split,'substring inside a real barcode is preserved');
 assert.equal(searchProducts([split],'ga')[0],split,'Vietnamese text behavior is preserved');
});
test('customer phone matching retains the existing formatted-number contract',()=>{
 const customer={id:'c1',name:'Đồng Xoài',phone:'0978 194 836'};
 for(const query of ['0978194836','194836','dong xoai'])assert.equal(searchCustomers([customer],query)[0],customer);
});
