import test from'node:test';import assert from'node:assert/strict';
import*as old from'./fixtures/report-formatters-before-upgrade.mjs';
import{formatVnd,formatCompactVnd,formatPercent}from'../src/features/business-report/reportViewModel.js';
test('cached report formatters preserve every display value, threshold, negative zero and decimal rounding',()=>{
 const values=[undefined,null,false,true,'','10,5','12345.25','invalid',NaN,Infinity,-Infinity,0,-0,-.1,-.5,-1.5,1.5,999999.9,1000000,999999999.9,1000000000,Number.MAX_SAFE_INTEGER];
 for(let i=0;i<1000;i++)values.push((i%2?-1:1)*(i*1234567.89+i/10));
 for(const value of values)for(const fn of[formatVnd,formatCompactVnd,formatPercent])assert.equal(fn(value),old[fn.name](value));
});
