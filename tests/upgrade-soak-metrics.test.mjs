import test from'node:test';import assert from'node:assert/strict';import{numericStats,sumOwnedProcesses,ownedCpuIntervals,memoryTrend,matchedSessionModuleMemory}from'../scripts/helpers/upgrade-soak-metrics.mjs';
test('missing memory stays missing; zero is accepted only when an owned process actually reports zero',()=>{
 assert.deepEqual(numericStats([null,undefined,NaN]),{n:0,min:null,median:null,p95:null,max:null});
 assert.equal(sumOwnedProcesses({processes:[],rendererOwnershipKnown:true},'rssKb'),undefined);
 assert.equal(sumOwnedProcesses({processes:[{rssKb:0}],rendererOwnershipKnown:true},'rssKb'),0);
 assert.equal(sumOwnedProcesses({processes:[{rssKb:10},{}],rendererOwnershipKnown:true},'rssKb'),undefined);
 assert.equal(sumOwnedProcesses({processes:[{rssKb:10}],rendererOwnershipKnown:false},'rssKb'),undefined);
});

test('role and module population changes do not become a matched-session leak trend',()=>{
 const samples=[
  {elapsedMs:0,module:'home',bytes:10},{elapsedMs:60000,module:'home',bytes:10},
  {elapsedMs:120000,module:'products',bytes:100},{elapsedMs:180000,module:'products',bytes:100},
  {elapsedMs:240000,module:'home',bytes:1000},{elapsedMs:300000,module:'home',bytes:1000}
 ];
 assert.ok(memoryTrend(samples,s=>s.bytes)>0);
 const groups=matchedSessionModuleMemory(samples,[{index:0,startMs:0,endMs:200000},{index:1,startMs:240000,endMs:360000}],{heap:s=>s.bytes});
 assert.equal(groups.length,3);
 for(const g of groups){assert.equal(g.samples,2);assert.equal(g.metrics.heap.unitsPerMinuteSlope,0);assert.equal(g.metrics.heap.firstThird.n,1);assert.equal(g.metrics.heap.lastThird.n,1);}
 assert.equal(memoryTrend([{elapsedMs:0,bytes:1},{elapsedMs:0,bytes:2}],s=>s.bytes),null);
 assert.equal(memoryTrend([{elapsedMs:0},{elapsedMs:60000}],s=>s.bytes),null);
});
test('CPU uses actual tick rate and elapsed interval, never treats restarted or missing processes as zero CPU',()=>{
 const row=(elapsedMs,pid,userTicks,systemTicks)=>({elapsedMs,rendererOwnershipKnown:true,processes:[{pid,userTicks,systemTicks}]});
 const r=ownedCpuIntervals([row(0,1,100,50),row(1000,1,150,100),row(2000,2,5,5),row(3000,2,10,10),row(4000,2,0,0)],100);
 assert.deepEqual(r.values.map(v=>v.oneCorePercent),[100,10]);assert.equal(r.missing.length,2);
 assert.equal(ownedCpuIntervals([row(0,1,0,0),row(1000,1,0,0)],undefined).values.length,0);
});
