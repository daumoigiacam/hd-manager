import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {shouldRequestCustomerSupplements as request,customerReadiness} from '../src/features/customers/customerReadiness.js';
const props={privacyScope:'tenant-a:owner-a:session1:permissions1',localOnline:true,canViewCustomerDebt:true};
test('financial/history reads start only after this scope has a committed directory',()=>{
 assert.equal(request(props,null),false);assert.equal(request(props,'another-account'),false);
 assert.equal(request(props,props.privacyScope),true);
 assert.equal(request({...props,supplementsRequested:true},props.privacyScope),false);
 for(const permission of ['canViewCustomerDebt','canViewCustomerOrderHistory','canViewCustomerPaymentHistory','canViewCustomerStats']){
  assert.equal(request({privacyScope:props.privacyScope,[permission]:true},props.privacyScope),true);
 }
});
test('no financial rights, offline or signed SQLite reader cannot silently enable cloud supplements',()=>{
 assert.equal(request({privacyScope:props.privacyScope},props.privacyScope),false);
 for(const change of [{localOnline:false},{localFirstRequired:true},{privacyScope:''}])assert.equal(request({...props,...change},props.privacyScope),false);
 assert.equal(customerReadiness({localFirstRequired:true,runtimeCurrent:true,online:false,supplementsRequested:false}),'sqlite');
});
test('canonical integration uses the existing request callback after directory commit and preserves paging and financial guards',()=>{
 const source=fs.readFileSync(new URL('../src/features/customers/productCRMShared.jsx',import.meta.url),'utf8');
 assert.match(source,/shouldRequestCustomerSupplements\(props,committedDirectoryScope\)/);
 assert.match(source,/setCommittedDirectoryScope\(props.privacyScope\)/);
 assert.match(source,/setTimeout\(\(\)=>props.onRequestSupplements\(\),0\)/);assert.match(source,/clearTimeout\(timer\)/);
 assert.match(source,/onDirectoryReady:directoryReady/);
 const controller=fs.readFileSync(new URL('../src/features/legacy/CustomerCRMController.jsx',import.meta.url),'utf8');
 assert.match(controller,/canSeeCustomerDebt = financialDataReady && Boolean/);
 assert.match(controller,/canSeeCustomerOrderHistory = financialDataReady && Boolean/);
 assert.match(controller,/usePagedList\(/);
});
