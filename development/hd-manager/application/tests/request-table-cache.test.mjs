import test from'node:test';import assert from'node:assert/strict';
import{getReadOnlyModuleProjectionEntry as entry,readCompletedModuleProjection as read}from'../src/services/moduleProjectionCaches.js';
test('completed request table survives remount; account, permission, filter and changed source identities cannot reuse it',()=>{
 const source=Array.from({length:6},()=>[]),context={companyId:'a',employeeId:'u',permissionKey:'verified-permission-a',periodKey:'2026-11-15/all',clockKey:'2026-11-15/Asia/Ho_Chi_Minh'};
 let calculations=0;const calculate=()=>{calculations++;return [{id:'request-line-1',unitPrice:67000,quantity:30}];};
 const first=read(entry('requestTableRows',source,context),calculate);
 assert.equal(read(entry('requestTableRows',source,context),calculate),first);assert.equal(calculations,1);
 for(const key of ['companyId','employeeId','permissionKey','periodKey','clockKey'])assert.notEqual(read(entry('requestTableRows',source,{...context,[key]:context[key]+'changed'}),calculate),first,key);
 assert.notEqual(read(entry('requestTableRows',[...source.slice(0,5),[]],context),calculate),first);
 assert.equal(first[0].unitPrice*first[0].quantity,2010000);assert.equal(entry('requestTableRows',source,{...context,permissionKey:''}),undefined);
});
