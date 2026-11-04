import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {patchNativeListenerRelease} from '../scripts/native-listener-release-patch.mjs';
import {installedBridge} from './helpers/installed-capacitor-bridge.mjs';
const source=fs.readFileSync('node_modules/@capacitor/android/capacitor/src/main/assets/native-bridge.js','utf8');
const versions={android:'8.4.3',core:'8.4.3'};
const patch=value=>patchNativeListenerRelease(value,versions).code;
const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve()};

test('pinned bridge releases both listener/removal ownership with no callback invocation or native routing change',async()=>{
 const original=installedBridge(),fixed=installedBridge(patch);
 for(const [runtime,expected]of[[original,2],[fixed,0]]){
  let received=0;const handle=await runtime.plugin.addListener('appStateChange',()=>received++);
  const add=runtime.calls.at(-1);runtime.cap.fromNative({callbackId:add.callbackId,success:true,save:true,data:{isActive:true}});
  assert.equal(received,1);assert.equal(runtime.callbacks.size,1);
  assert.equal(await handle.remove(),undefined);
  await flush();
  assert.equal(runtime.calls.at(-1).pluginId,'App');assert.equal(runtime.calls.at(-1).methodName,'removeListener');
  assert.equal(runtime.calls.at(-1).options.eventName,'appStateChange');assert.equal(runtime.calls.at(-1).options.callbackId,add.callbackId);
  assert.equal(runtime.callbacks.size,expected);assert.equal(received,1,'unsubscribe cannot run a handler with fake/empty data');
 }
});

test('1000 public SDK add/remove cycles leave zero retired entries; late events cannot revive a disposed listener',async()=>{
 const runtime=installedBridge(patch);let events=0;
 for(let i=0;i<1000;i++){
  const handle=await runtime.plugin.addListener('appStateChange',()=>events++),id=runtime.calls.at(-1).callbackId;
  await handle.remove();await flush();assert.equal(runtime.callbacks.size,0);
  runtime.cap.fromNative({callbackId:id,success:true,save:true,data:{isActive:true}});
 }
 assert.equal(events,0);assert.equal(runtime.calls.length,2000);
});

test('ordinary native promise and persistent event semantics remain intact',async()=>{
 const runtime=installedBridge(patch),promise=runtime.cap.nativePromise('App','getInfo',{}),id=runtime.calls.at(-1).callbackId;
 assert.equal(runtime.callbacks.size,1);runtime.cap.fromNative({callbackId:id,success:true,save:false,data:{version:'fiction'}});
 assert.equal((await promise).version,'fiction');assert.equal(runtime.callbacks.size,0);
 let delivered=0;const handle=await runtime.plugin.addListener('backButton',()=>delivered++),eventId=runtime.calls.at(-1).callbackId;
 for(let i=0;i<3;i++)runtime.cap.fromNative({callbackId:eventId,success:true,save:true,data:{canGoBack:true}});
 assert.equal(delivered,3);assert.equal(runtime.callbacks.size,1);await handle.remove();await flush();assert.equal(runtime.callbacks.size,0);
});

test('SDK upgrade, source drift and already patched input fail closed; generation is deterministic',()=>{
 assert.throws(()=>patchNativeListenerRelease(source,{...versions,android:'8.4.4'}),/needs review/);
 assert.throws(()=>patchNativeListenerRelease(source+'\n',versions),/needs review/);
 assert.throws(()=>patchNativeListenerRelease(patch(source),versions),/needs review/);
 assert.deepEqual(patchNativeListenerRelease(source,versions),patchNativeListenerRelease(source,versions));
});
