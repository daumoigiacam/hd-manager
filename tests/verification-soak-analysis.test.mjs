import test from 'node:test';
import assert from 'node:assert/strict';
import {describeProcessSamples,describeSeries,summarizeSdkSoak,observationCoverage,processCpuIntervals} from '../performance/phase2-verification/soak-analysis.mjs';
test('missing metrics stay missing; zero is a valid measurement',()=>{
 assert.equal(describeSeries([{t:1,value:null},{t:2,value:undefined}]).min,null);
 assert.equal(describeSeries([{t:1,value:0}]).min,0);
 assert.equal(describeSeries([{t:1,value:0}]).descriptiveSlopePerHour,null);
});
test('restart PIDs and cohorts are never concatenated into a leak slope',()=>{
 const values=describeProcessSamples([{elapsedMs:1,processes:[{pid:1,kind:'native-main',rssKb:100}]},{elapsedMs:2,processes:[{pid:2,kind:'native-main',rssKb:50}]}],'sdk');
 assert.equal(values.length,2);assert.ok(values.every(v=>v.count===1&&v.cohort==='sdk'&&v.descriptiveSlopePerHour===null));
});
test('warm-up excluded from slope, median windows resist one transient peak',()=>{
 const rows=[{t:1,value:90000}];
 for(let i=4;i<8;i++)for(const value of [100,100,10000])rows.push({t:i*300000+10,value});
 const result=describeSeries(rows);assert.equal(result.max,90000);assert.equal(result.descriptiveSlopePerHour,0);
});
test('route request/search attempted does not become successful coverage',()=>{
 const value=summarizeSdkSoak({samples:[{elapsedMs:1,module:'home',heap:{usedSize:10}},{elapsedMs:2,module:'customers'}],actions:[{kind:'actual-ui-route',clicked:false},{kind:'search',exercised:false},{kind:'logout',invoked:true}]});
 assert.equal(value.coverage.routeClicks,0);assert.equal(value.coverage.routeNotFound,1);assert.equal(value.coverage.searchInputs,0);assert.equal(value.coverage.logoutInvoked,1);
 assert.equal(value.metrics.find(x=>x.metric==='mainJsHeapUsedBytes').count,1);
 assert.equal(value.metrics.find(x=>x.metric==='publicSdkOutstanding').min,null);
});
test('pointer samples deduplicate overlap but preserve identical clocks after a document reload',()=>{
 const row={start:10,feedbackMs:120,trusted:true},untrusted={start:11,feedbackMs:2,trusted:false};
 const result=summarizeSdkSoak({samples:[{documentOrigin:100,probe:{frames:[row,untrusted]}},{documentOrigin:100,probe:{frames:[row]}},{documentOrigin:200,probe:{frames:[row]}}]});
 assert.equal(result.clicks.uniqueObserved,2);assert.equal(result.clicks.over100Ms,2);assert.equal(result.clicks.maxMs,120);
 assert.equal(summarizeSdkSoak({}).clicks.maxMs,null);
});
test('two-hour clock alone cannot replace actual observation through a host sleep gap',()=>{
 assert.equal(observationCoverage([{elapsedMs:1},{elapsedMs:7200000}],7200000).observedWithoutLargeGaps,false);
 assert.equal(observationCoverage([{elapsedMs:10},{elapsedMs:5}],20).observedWithoutLargeGaps,false);
 const samples=Array.from({length:480},(_,i)=>({elapsedMs:i*15000}));
 assert.equal(observationCoverage(samples,7200000).observedWithoutLargeGaps,true);
});
test('login reporting selects one sample per explicit login instead of counting every heartbeat as a new login',()=>{
 const s=(t,ready)=>({elapsedMs:t,probe:{homeShellMs:10,homeDataReadyMs:ready}});
 const result=summarizeSdkSoak({samples:[s(1,100),s(10,100),s(21,150),s(30,150)],actions:[{kind:'initial-fake-login',invoked:true},{kind:'relogin-fake-role',invoked:true,elapsedMs:20},{kind:'relogin-fake-role',invoked:false,elapsedMs:40}]});
 assert.equal(result.loginEpochs.length,3);assert.deepEqual(result.loginEpochs.map(p=>p.homeDataReadyMs),[100,150,null]);
});
test('process CPU allows parallel cores and does not connect a counter reset',()=>{
 const s=(t,ticks,pid=1)=>({elapsedMs:t,processes:[{pid,kind:'owned-renderer',userTicks:ticks,systemTicks:0}]});
 const result=processCpuIntervals([s(0,0),s(1000,200),s(2000,0),s(3000,20),s(4000,10,2)],100);
 assert.equal(result.processes[0].intervals.length,2);assert.equal(result.processes[0].intervals[0].percentOfOneCore,200);
 assert.equal(result.processes[0].cpuMs,2200);assert.equal(processCpuIntervals([],null).status,'NOT_VERIFIED_CLOCK_TICKS');
});

test('worker SDK listener counters stay separate from zero main-thread counters and unknown is not zero',()=>{
 const result=summarizeSdkSoak({samples:[{elapsedMs:1,mainSdk:{outstanding:0},probe:{workerCounters:{a:{outstanding:11},b:{outstanding:2}}}},{elapsedMs:2,probe:{workerCounters:{}}},{elapsedMs:3,probe:{}},{elapsedMs:4,probe:{workerCounters:{a:{}}}}]});
 const worker=result.metrics.find(row=>row.metric==='workerPublicSdkOutstanding');
 assert.equal(worker.count,2);assert.equal(worker.min,0);assert.equal(worker.max,13);
 assert.equal(result.metrics.find(row=>row.metric==='publicSdkOutstanding').max,0);
});
