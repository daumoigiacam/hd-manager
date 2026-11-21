import test from 'node:test';
import assert from 'node:assert/strict';
import {customerHistoryItemLabel} from '../src/utils/customerHistoryPresentation.js';
test('legacy history items resolve catalog names while saved invoice descriptions remain authoritative',()=>{
  const products=[{id:'duck',name:'Vịt kiểm thử'}];
  assert.equal(customerHistoryItemLabel({productId:'duck',quantity:10},products),'Vịt kiểm thử x10');
  assert.equal(customerHistoryItemLabel({description:'Tên trên chứng từ',productId:'duck',quantity:2},products),'Tên trên chứng từ x2');
  assert.equal(customerHistoryItemLabel({productNameSnapshot:'Tên cũ',billingQuantity:3}), 'Tên cũ x3');
  assert.equal(customerHistoryItemLabel({}), 'Hàng hóa x0');
});
