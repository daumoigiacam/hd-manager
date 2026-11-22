import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parse} from '@babel/parser';
const source=fs.readFileSync(new URL('../src/features/customers/productCRMShared.jsx',import.meta.url),'utf8');
const nodes=new Map();for(const statement of parse(source,{sourceType:'module',plugins:['jsx']}).program.body){const declaration=statement.type==='ExportNamedDeclaration'?statement.declaration:statement;if(declaration?.type==='VariableDeclaration')for(const row of declaration.declarations)if(row.id.name)nodes.set(row.id.name,row.init);}
const actual=(name,bindings={})=>{const node=nodes.get(name);assert.ok(node,name);return Function(...Object.keys(bindings),'return ('+source.slice(node.start,node.end)+')')(...Object.values(bindings));};
const read=actual('parseCustomerImportWorkbook',{
  CUSTOMER_IMPORT_HEADER_ALIASES:actual('CUSTOMER_IMPORT_HEADER_ALIASES'),
  normalizeLookupText:actual('normalizeLookupText',{LOOKUP_NORMALIZATION_CACHE_LIMIT:actual('LOOKUP_NORMALIZATION_CACHE_LIMIT'),LOOKUP_NORMALIZATION_MAX_LENGTH:actual('LOOKUP_NORMALIZATION_MAX_LENGTH'),lookupNormalizationCache:new Map()}),
  toTitleCase:String,capitalizeFirst:String,parseCustomerImportCsvRows:actual('parseCustomerImportCsvRows')
});
test('the actual customer parser reads a real Excel sheet with the installed library and preserves leading-zero phone identifiers',async()=>{
  const bytes=fs.readFileSync(new URL('./fixtures/customer-import-qa.xlsx',import.meta.url));
  const result=await read(new File([bytes],'customers.xlsx'));
  assert.equal(result.totalDataRows,1);assert.equal(result.records.length,1);assert.equal(result.records[0].name,'Khách Excel QA');assert.equal(result.records[0].phone,'0900000055');assert.equal(result.skippedRows.length,0);
});
test('CSV import still validates required fields and reports invalid rows',async()=>{
  const result=await read(new File(['Tên Khách hàng,Số điện thoại,Địa chỉ\nKhách QA,0900000056,Địa chỉ QA\nThiếu SĐT,,Địa chỉ QA'],'customers.csv'));
  assert.equal(result.records.length,1);assert.equal(result.records[0].phone,'0900000056');assert.equal(result.skippedRows.length,1);assert.match(result.skippedRows[0].reason,/Số điện thoại/);
});
