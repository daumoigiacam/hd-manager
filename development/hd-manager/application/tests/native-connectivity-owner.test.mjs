import test from'node:test';import assert from'node:assert/strict';
import{createConnectivityState,createNativeConnectivityObserver}from'../src/services/nativeConnectivity.js';
test('real Native state corrects stale browser online/offline and ignores reordered callbacks',()=>{
 const changes=[],state=createConnectivityState({browser:()=>true,onChange:value=>changes.push(value)});
 assert.equal(state.read(),true);state.accept({online:false,sequence:2});assert.equal(state.read(),false);
 state.accept({online:true,sequence:1});assert.equal(state.read(),false);state.accept({online:true,sequence:3});assert.equal(state.read(),true);
 state.accept({online:true,sequence:3});state.accept({online:'false',sequence:4});assert.deepEqual(changes,[false,true]);
});
test('first OS observation republishes a silently changed browser fallback to mounted owners',()=>{
 let fallback=true;const updates=[],state=createConnectivityState({browser:()=>fallback,onChange:value=>updates.push(value)});
 assert.equal(state.read(),true);fallback=false;state.accept({online:false,sequence:1});assert.deepEqual(updates,[false]);
 state.accept({online:false,sequence:2});assert.deepEqual(updates,[false]);
});
test('one observer owns one callback across repeated UI attachment and removes a late listener after close',async()=>{
 let callback,resolveListener,resolveStart,starts=0,stops=0,removed=0;const received=[];
 const plugin={addListener(name,listener){assert.equal(name,'nativeNetworkChange');callback=listener;return new Promise(resolve=>resolveListener=resolve);},startNetworkObservation(){starts++;return new Promise(resolve=>resolveStart=resolve);},async stopNetworkObservation(){stops++;}};
 const observer=createNativeConnectivityObserver({plugin,accept:value=>received.push(value)});
 observer.start();observer.start();assert.equal(starts,1);callback({online:false,sequence:1});assert.equal(received.length,1);
 observer.close();observer.close();resolveListener({async remove(){removed++;}});resolveStart({online:true,sequence:2});await new Promise(resolve=>setImmediate(resolve));callback({online:true,sequence:3});
 assert.equal(received.length,1);assert.equal(removed,1);assert(stops>=1&&stops<=2);observer.start();assert.equal(starts,1);
});
