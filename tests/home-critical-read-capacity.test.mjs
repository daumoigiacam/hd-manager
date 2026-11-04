import test from 'node:test';import assert from 'node:assert/strict';
import {getHomeCriticalReadCapacity} from '../performance/upgrade-20261103/rejected-pilots/homeCriticalReadCapacity.js';
import {planForegroundRealtimeActivation} from '../src/services/realtimeListenerPlanner.js';
const required=Array.from({length:15},(_,i)=>'source'+i),baseline=['companies','employees'];
const options={enabled:true,workerAvailable:true,tab:'home',baseLimit:8,requestedNames:required,availableNames:[...required,...baseline],baselineNames:baseline};
test('all required Home sources use the same subscription owner, with no source loss or reordering',()=>{
 const before=planForegroundRealtimeActivation({...options,limit:8});
 const after=planForegroundRealtimeActivation({...options,limit:getHomeCriticalReadCapacity(options)});
 assert.equal(before.overflowNames.length,7);assert.deepEqual(after.liveNames,required);assert.deepEqual(after.overflowNames,[]);
});
test('leaving Home evicts excess listeners and restores prior budget; feature off and absent worker preserve behavior',()=>{
 for(const change of [{tab:'products'},{enabled:false},{workerAvailable:false}])assert.equal(getHomeCriticalReadCapacity({...options,...change}),8);
 const next=planForegroundRealtimeActivation({...options,requestedNames:['source14'],activeNames:required,recentNames:required,limit:getHomeCriticalReadCapacity({...options,tab:'products'})});
 assert.equal(next.liveNames.length,8);assert.equal(next.liveNames[0],'source14');assert.equal(next.evictedNames.length,7);
});
test('unknown, baseline and duplicate names do not enlarge capacity; hard bound keeps overflow explicit',()=>{
 assert.equal(getHomeCriticalReadCapacity({...options,requestedNames:['companies','source1','source1','unknown']}),8);
 const many=Array.from({length:30},(_,i)=>'source'+i);
 assert.equal(getHomeCriticalReadCapacity({...options,requestedNames:many,availableNames:many}),16);
});
