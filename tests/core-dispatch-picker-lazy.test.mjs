import test from 'node:test';import assert from 'node:assert/strict';import {appFunction} from './helpers/app-source-function.mjs';
for(const[name,kind,searchName]of[['prepareDispatchCustomers','customer','dispatchCustomerSearch'],['prepareDispatchProducts','product','dispatchProductSearch']]){
 for(const blocked of['closed','pending','error'])test(name+' does no ranking while '+blocked,()=>{
  const empty=Object.freeze([]),prepare=appFunction(name,{dispatchPickerOpen:blocked==='closed'?'':kind,
   [searchName]:{pending:blocked==='pending',error:blocked==='error'?Error('fixture'):null},EMPTY_DISPATCH_PICKER_ROWS:empty,
   rankDispatchPickerOptions:()=>{throw Error('Unexpected hidden/partial ranking')},
  },{memoCallback:true})();
  const result=prepare().next();assert.equal(result.done,true);assert.equal(result.value,empty);
 });
}
