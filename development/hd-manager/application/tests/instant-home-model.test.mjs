import test from 'node:test';
import assert from 'node:assert/strict';
import {homeModules,homeSearchOptions,homeSummary} from '../src/layout/instantHomeModel.js';
test('configuration can reorder only explicitly authorized modules',()=>{
 const granted=[{id:'customers',label:'Khách hàng'},{id:'orders',label:'Đơn hàng'}];
 assert.deepEqual(homeModules(granted,['payroll','customers','orders']).map(x=>x.id),['customers','orders']);
 assert.deepEqual(homeModules([],['payroll']),[]);
 assert.deepEqual(homeModules([{id:'customers',label:'Khách hàng'}],['orders']).map(x=>x.id),['customers']);
});
test('Vietnamese local function search does not disclose other modules',()=>{
 const modules=homeModules([{id:'orders',label:'Đơn hàng'},{id:'customers',label:'Khách hàng'}]);
 assert.equal(homeSearchOptions(modules,'don hang')[0].id,'orders');
 assert.equal(homeSearchOptions(modules,'khach')[0].id,'customers');
 assert.deepEqual(homeSearchOptions(modules,'luong'),[]);
});
test('missing financial coverage is never converted to zero or fabricated counters',()=>{
 assert.deepEqual(homeSummary(null),[]);
 assert.deepEqual(homeSummary({periodReports:{today:{revenue:0,profit:-100}}}),[{id:'revenue',label:'Doanh thu',value:0,previous:undefined},{id:'profit',label:'Lợi nhuận',value:-100,previous:undefined}]);
 assert.deepEqual(homeSummary({periodReports:{today:{revenue:NaN,profit:undefined,orders:'12'}}}),[]);
 assert.deepEqual(homeSummary({periodReports:{today:{revenue:100}}},'year'),[]);
});
