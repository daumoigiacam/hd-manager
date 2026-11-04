import test from 'node:test';
import assert from 'node:assert/strict';
import { createSupplierEntryIndex } from '../src/utils/supplierEntryIndex.js';

const normalizeName=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const normalizePhone=value=>String(value||'').replace(/\D/g,'').replace(/^84/,'0');
const find=(rows,name,phone,customerId)=>rows.find(entry=>(customerId&&entry.customerId===customerId)
  ||normalizeName(entry.name)===normalizeName(name)&&(!entry.phone||!phone||normalizePhone(entry.phone)===normalizePhone(phone)));

test('indexed grouping preserves first OR-match priority, wildcard phones, normalization collisions and customer identities',()=>{
  const rows=[{name:'Đức',phone:'0901000001',customerId:'a'},{name:'Duc',phone:'',customerId:'b'},
    {name:'Hồng',phone:'',customerId:'c'},{name:'Đức',phone:'0901000002',customerId:'d'},
    {name:'Duc',phone:'letters',customerId:'e'},{name:'Đức',phone:'0901000001',customerId:'a'}];
  const index=createSupplierEntryIndex({normalizeName,normalizePhone});rows.forEach(row=>index.add(row));
  for(const name of ['Duc','Đức','Hồng','Other',''])for(const phone of ['',null,'0901000001','84901000001','0901000002','letters','symbols'])
    for(const id of ['',null,'a','b','c','d','e','missing'])assert.equal(index.find(name,phone,id),find(rows,name,phone,id));
  rows[0].totalAmount=100;assert.equal(index.find('Đức','0901000001','').totalAmount,100);
});

test('large grouping performs bounded normalization per input while matching the reference result exactly',()=>{
  let names=0,phones=0;
  const index=createSupplierEntryIndex({normalizeName:value=>{names++;return normalizeName(value)},normalizePhone:value=>{phones++;return normalizePhone(value)}});
  const rows=[];
  for(let i=0;i<350;i++){const row={name:'Synthetic '+i%113,phone:i%9?'09'+i:'',customerId:'c'+i};rows.push(row);index.add(row);}
  for(let i=0;i<1800;i++){
    const name='Synthetic '+i%177,phone=i%5?'09'+i%600:'',customerId=i%4?'':'c'+i%350;
    const expected=find(rows,name,phone,customerId),actual=index.find(name,phone,customerId);assert.equal(actual,expected);
    if(!actual){const row={name,phone,customerId};rows.push(row);index.add(row);}
  }
  assert(names<=rows.length+1800);assert(phones<=rows.length+1800);
});
