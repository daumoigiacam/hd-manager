import test from 'node:test';import assert from 'node:assert/strict';
import {createStartupUiAdmission} from '../src/services/startupUiAdmission.js';
import {createStartupSubscriptionBarrier} from '../src/services/startupSubscriptionPlan.js';
test('collection receipt alone does not admit inbox work ahead of the personal Home commit; explicit open can request it',()=>{
 const calls=[],pending=[];let releasedByUser=false;
 const barrier=createStartupSubscriptionBarrier({isCurrent:()=>true,start:reason=>calls.push(reason),onPending:value=>pending.push(value),schedule:()=>1,cancel:()=>{}});
 barrier.activate(['orders','payments','personal-home-projection']);barrier.confirm('orders');barrier.confirm('payments');
 assert.deepEqual(calls,[]);
 const scope={uid:'u',companyId:'c'},admission=createStartupUiAdmission({...scope,isCurrent:()=>true,
  onPersonalReady:()=>barrier.confirm('personal-home-projection'),onNotificationsRequested:()=>{releasedByUser=true;barrier.requestNow()}});
 admission.reportPersonalReady({...scope,uid:'other'},true);assert.deepEqual(calls,[]);
 admission.requestNotifications(scope);assert.deepEqual(calls,['explicit-open']);assert.equal(releasedByUser,true);assert.equal(admission.personalReady,false);
 assert.deepEqual(pending,[true,false]);barrier.dispose();admission.close();
 const automatic=[];const second=createStartupSubscriptionBarrier({isCurrent:()=>true,start:reason=>automatic.push(reason),schedule:()=>1,cancel:()=>{}});
 second.activate(['orders','personal-home-projection']);second.confirm('orders');assert.deepEqual(automatic,[]);second.confirm('personal-home-projection');assert.deepEqual(automatic,['foreground-confirmed']);second.dispose();
});
test('only the matching current UI commit admits personal-Home background work; explicit notification demand remains independent',()=>{
 let current=true,commits=0,requests=0;const scope={uid:'fixture-user',companyId:'fixture-company'};
 const gate=createStartupUiAdmission({...scope,isCurrent:()=>current,onPersonalReady:()=>commits++,onNotificationsRequested:()=>requests++});
 assert.equal(gate.personalReady,false);
 assert.equal(gate.reportPersonalReady({...scope,uid:'other'},true),false);assert.equal(gate.personalReady,false);
 assert.equal(gate.reportPersonalReady({...scope,companyId:'other'},true),false);
 gate.requestNotifications(scope);assert.equal(requests,1);assert.equal(commits,0);assert.equal(gate.personalReady,false);
 gate.reportPersonalReady(scope,true);gate.reportPersonalReady(scope,true);assert.equal(commits,1);assert.equal(gate.personalReady,true);
 gate.reportPersonalReady(scope,false);assert.equal(gate.personalReady,false);
 current=false;assert.equal(gate.reportPersonalReady(scope,true),false);assert.equal(gate.requestNotifications(scope),false);
 gate.close();current=true;assert.equal(gate.reportPersonalReady(scope,true),false);assert.equal(gate.requestNotifications(scope),false);
});
