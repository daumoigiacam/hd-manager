import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {installAccountLoginFlowObserver} from '../scripts/helpers/account-login-flow-observer.mjs';
import {resolveAccountLoginReadinessContract} from '../scripts/helpers/account-login-readiness-contract.mjs';

function harness(expectedAccount='employee'){
 let time=10,nextId=0,interval;const handlers={},frames=[],timers=new Map();
 const props={currentUser:{companyId:'company-a',accountType:'employee',role:'employee'},
  serverConfirmedCollectionState:{tenantId:'company-a',collections:{orders:false}}};
 const context={login:true,main:false,busy:false};
 const main={isConnected:true,__reactFiber$test:{memoizedProps:props,return:null},closest:()=>null,
  querySelector:selector=>selector.includes('.business-report-workspace')?{}:context.busy?{}:null};
 const button={innerText:'Vào Ứng Dụng',disabled:false};
 const document={querySelector:selector=>selector==='input[type=tel]'?(context.login?{}:null):
  selector==='.customer-portal-main'?null:selector==='main[data-hd-module="home"]'?(context.main?main:null):
  selector.startsWith('.customer-portal-nav')&&context.main?{}:null,
  addEventListener:(name,callback)=>{handlers[name]=callback},removeEventListener:name=>delete handlers[name]};
 const window={};
 vm.runInNewContext(`(${installAccountLoginFlowObserver.toString()})(${JSON.stringify({expectedAccount,required:['orders']})})`,{
  window,document,performance:{timeOrigin:1000000,now:()=>time},Date:{now:()=>1000000+time},
  setTimeout:callback=>{timers.set(++nextId,callback);return nextId},clearTimeout:id=>timers.delete(id),
  setInterval:callback=>{interval=callback;return ++nextId},clearInterval:()=>{},
  requestAnimationFrame:callback=>frames.push(callback),
  MutationObserver:class{observe(){}disconnect(){}},PerformanceObserver:class{observe(){}disconnect(){}},
 });
 return {props,context,state:window.__hdAccountLoginFlow.state,setTime:value=>{time=value},
  submit:(trusted=true)=>{const event={timeStamp:time,isTrusted:trusted,target:{closest:()=>button}};handlers.pointerdown(event);handlers.click(event)},
  check:()=>interval(),flushFrames:()=>{while(frames.length)frames.shift()()},stop:()=>window.__hdAccountLoginFlow.stop('test-cleanup')};
}

test('clock requires a trusted submit, matching tenant, every source, no busy state and two frames',()=>{
 const h=harness();h.submit(false);assert.equal(h.state.inputAt,null);
 h.setTime(100);h.submit();h.context.login=false;h.context.main=true;h.setTime(400);h.check();
 assert.equal(h.state.shellAt,400);assert.equal(h.state.homeReadyAt,null);
 h.props.serverConfirmedCollectionState={tenantId:'foreign-company',collections:{orders:true}};h.check();assert.equal(h.state.sourceReadyAt,null);
 h.props.serverConfirmedCollectionState={tenantId:'company-a',collections:{orders:true}};h.context.busy=true;h.check();
 assert.equal(h.state.sourceReadyAt,400);assert.equal(h.state.homeReadyAt,null);
 h.context.busy=false;h.setTime(450);h.check();assert.equal(h.state.homeReadyAt,450);assert.equal(h.state.endReason,null);
 h.setTime(480);h.flushFrames();assert.equal(h.state.twoFramesAfterReadyAt,480);assert.equal(h.state.endReason,'home-ready-observed');
});

test('retry preserves earlier attempt but excludes human retry time from the new clock',()=>{
 const h=harness();h.setTime(100);h.submit();h.setTime(20100);h.submit();
 assert.equal(h.state.attempts.length,1);assert.equal(h.state.attempts[0].inputAt,100);assert.equal(h.state.inputAt,20100);
 h.context.login=false;h.context.main=true;h.props.serverConfirmedCollectionState.collections.orders=true;
 h.setTime(20200);h.check();h.setTime(20250);h.flushFrames();
 assert.equal(h.state.twoFramesAfterReadyAt-h.state.inputAt,150,'synthetic clock arithmetic only, not a latency benchmark');
});

test('a different account role cannot satisfy the requested customer cohort',()=>{
 const h=harness('customer');h.setTime(100);h.submit();h.context.login=false;h.context.main=true;
 h.props.serverConfirmedCollectionState.collections.orders=true;h.check();h.flushFrames();
 assert.equal(h.state.roleMatches,false);assert.equal(h.state.endReason,null);h.stop();
});

test('actual App customer contract keeps real catalogue/inbox witnesses but excludes unqueryable private pricing',()=>{
 const source=readFileSync('src/App.jsx','utf8');
 const employee=resolveAccountLoginReadinessContract(source,'employee');assert.equal(employee.required.length,15);assert.deepEqual(employee.excluded,[]);
 const customer=resolveAccountLoginReadinessContract(source,'customer');
 for(const required of ['companies','products','reward_catalog','promotions','messages','orders','payments'])assert(customer.required.includes(required));
 assert.deepEqual(customer.excluded.map(row=>row.collection),['pricingInputs','pricingRules']);
 assert(!customer.required.includes('employees'));assert(!customer.required.includes('pricingRules'));
 assert.throws(()=>resolveAccountLoginReadinessContract(source,'unknown'),TypeError);
 assert.throws(()=>resolveAccountLoginReadinessContract(source.replace('CUSTOMER_BOOTSTRAP_COMMIT_COLLECTIONS.forEach(name=>','[].forEach(name=>'),'customer'),/bootstrap witnesses/);
 assert(customer.required.includes('customer_accounts'));assert(customer.required.includes('customers'));
 assert(customer.required.includes('notifications'),'customer Home inbox baseline is part of complete readiness');
 assert(employee.required.includes('advances'));assert(!employee.required.includes('warehouseImports'));
});
