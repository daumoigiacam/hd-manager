import test from 'node:test';
import assert from 'node:assert/strict';
import {createNavigationViewportStore} from '../src/layout/navigationViewport.js';

for(const legacy of [false,true])test(`navigation viewport uses one media query with cleanup (legacy=${legacy})`,()=>{
 const listeners=new Set(),media={matches:false},calls=[];
 if(legacy){media.addListener=fn=>listeners.add(fn);media.removeListener=fn=>listeners.delete(fn)}
 else{media.addEventListener=(type,fn)=>{assert.equal(type,'change');listeners.add(fn)};media.removeEventListener=(type,fn)=>{assert.equal(type,'change');listeners.delete(fn)}}
 const store=createNavigationViewportStore({matchMedia:query=>{calls.push(query);return media}});let updates=0;
 assert.equal(store.getSnapshot(),false);const off=store.subscribe(()=>updates++);assert.equal(listeners.size,1);
 media.matches=true;listeners.forEach(fn=>fn());assert.equal(store.getSnapshot(),true);assert.equal(updates,1);
 off();assert.equal(listeners.size,0);const remount=store.subscribe(()=>updates++);remount();
 assert.deepEqual(calls,['(min-width: 768px)']);assert.equal(listeners.size,0);
});

test('unsupported or restricted media hosts preserve the legacy navigation tree',()=>{
 for(const host of [null,{}, {matchMedia(){throw Error('restricted')}}]){
  const store=createNavigationViewportStore(host);assert.equal(store.getSnapshot(),true);assert.doesNotThrow(()=>store.subscribe(()=>{})());
 }
});
