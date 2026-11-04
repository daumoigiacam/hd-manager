import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {installedBridge} from './helpers/installed-capacitor-bridge.mjs';
import {subscribeScopedNativeEvent} from '../src/services/scopedNativeListener.js';

const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

test('installed Capacitor bridge retains callback entries after native RETURN_NONE removal; scoped forwarding stops application callbacks', async () => {
  const {plugin, callbacks, calls} = installedBridge();
  let oldCalls = 0;
  const oldHandle = await plugin.addListener('backButton', () => oldCalls++);
  await oldHandle.remove();
  await flush();
  assert.equal(callbacks.size, 2); // original + removal callback; native sends no result
  for (const value of callbacks.values()) value.callback();
  assert.equal(oldCalls, 2); // reproduce the pre-change application retention path

  let currentCalls = 0;
  const dispose = subscribeScopedNativeEvent(plugin, 'backButton', () => currentCalls++);
  await flush();
  const owned = [...callbacks.values()].at(-1).callback;
  owned(); assert.equal(currentCalls, 1);
  dispose(); dispose(); await flush();
  owned();
  for (const value of [...callbacks.values()].slice(2)) value.callback();
  assert.equal(currentCalls, 1);
  assert.equal(calls.filter(c => c.methodName === 'removeListener').length, 2);
});

test('unmount before registration resolves removes exactly once and rejects late events', async () => {
  let resolve, callback, removals = 0, delivered = 0;
  const plugin = {addListener(_name, value) { callback = value; return new Promise(r => { resolve = r; }); }};
  const dispose = subscribeScopedNativeEvent(plugin, 'appStateChange', () => delivered++);
  callback({isActive: true}); assert.equal(delivered, 1);
  dispose(); callback({isActive: true});
  resolve({remove() { removals++; return Promise.resolve(); }});
  await flush(); dispose();
  assert.equal(removals, 1); assert.equal(delivered, 1);
});

test('registration and removal failures do not produce unhandled rejection or resurrect disposed callbacks', async () => {
  const reported = [];
  const disposeFailed = subscribeScopedNativeEvent({addListener() { throw Error('sync'); }}, 'x', () => {}, e => reported.push(e.message));
  assert.deepEqual(reported, ['sync']); disposeFailed();
  let callback;
  const dispose = subscribeScopedNativeEvent({addListener(_name, cb) { callback = cb; return Promise.resolve({remove: () => Promise.reject(Error('remove'))}); }}, 'x', () => { throw Error('late event reached app'); }, e => reported.push(e.message));
  await flush(); dispose(); callback(); await flush();
  assert.deepEqual(reported, ['sync']);
  let reject;
  const late = subscribeScopedNativeEvent({addListener() { return new Promise((_r, fail) => { reject = fail; }); }}, 'x', () => {}, e => reported.push(e.message));
  late(); reject(Error('late registration')); await flush();
  assert.deepEqual(reported, ['sync']);
});

test('successive account scopes cannot receive each other\'s background or back events', async () => {
  const callbacks = [], delivered = [];
  const plugin = {addListener(_name, cb) { callbacks.push(cb); return Promise.resolve({remove() {}}); }};
  let stop;
  for (let i = 0; i < 20; i++) {
    stop?.(); stop = subscribeScopedNativeEvent(plugin, 'appStateChange', () => delivered.push(i));
    await flush(); callbacks.forEach(cb => cb({isActive: true}));
    assert.equal(delivered.at(-1), i); assert.equal(delivered.length, i + 1);
  }
  stop(); callbacks.forEach(cb => cb({isActive: true}));
  assert.equal(delivered.length, 20);
});

test('retained bridge forwarding functions no longer retain disposed synthetic account payloads after GC', () => {
  const source = `
    import {subscribeScopedNativeEvent} from './src/services/scopedNativeListener.js';
    const retained=[],oldRefs=[],newRefs=[];
    const plugin={addListener(_name,cb){retained.push(cb);return Promise.resolve({remove(){retained.push(cb)}})}};
    async function create(old){const payload={rows:Array.from({length:2048},(_,i)=>({id:i,value:'fiction-only'}))};
      const weak=new WeakRef(payload);let dispose;
      if(old){const h=await plugin.addListener('x',()=>payload.rows.length);dispose=()=>h.remove()}
      else dispose=subscribeScopedNativeEvent(plugin,'x',()=>payload.rows.length);
      await Promise.resolve();dispose();await Promise.resolve();return weak;}
    for(let i=0;i<16;i++){oldRefs.push(await create(true));newRefs.push(await create(false))}
    for(let i=0;i<8;i++){await new Promise(r=>setImmediate(r));global.gc()}
    console.log(JSON.stringify({old:oldRefs.filter(w=>w.deref()).length,after:newRefs.filter(w=>w.deref()).length}));
  `;
  const result = JSON.parse(execFileSync(process.execPath, ['--expose-gc', '--input-type=module', '-e', source], {encoding:'utf8', timeout:20000, windowsHide:true}));
  assert.deepEqual(result, {old:16, after:0});
});
