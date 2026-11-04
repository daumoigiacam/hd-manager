import test from 'node:test';
import assert from 'node:assert/strict';
import inspector from 'node:inspector';
import {installedBridge} from './helpers/installed-capacitor-bridge.mjs';
import {readNativeBridgeCallbackCount} from '../scripts/helpers/native-bridge-callback-count.mjs';

test('read only actual V8 native bridge map size with no exposed callback values', async () => {
  const sdk = installedBridge();
  const listener = await sdk.plugin.addListener('appStateChange', () => {});
  globalThis.window = sdk.win;
  const session = new inspector.Session(); session.connect();
  const methods = [];
  const client = {send(method, params) {
    methods.push(method);
    return new Promise((resolve, reject) => session.post(method, params, (error, result) => error ? reject(error) : resolve(result)));
  }};
  try {
    assert.equal(await readNativeBridgeCallbackCount(client), 1);
    await listener.remove();
    for (let i=0;i<8;i++) await Promise.resolve();
    assert.equal(await readNativeBridgeCallbackCount(client), 2);
    assert.equal(methods.filter(method => method === 'Runtime.releaseObjectGroup').length, 2);
    assert.ok(!methods.some(method => method.startsWith('Debugger.') || method.startsWith('HeapProfiler.')));
  } finally {session.disconnect(); delete globalThis.window;}
});

test('missing bridge stays unknown, never reports a fabricated zero; diagnostic handles released', async () => {
  const methods = [];
  await assert.rejects(readNativeBridgeCallbackCount({async send(method) {
    methods.push(method); return method === 'Runtime.evaluate' ? {result:{type:'undefined'}} : {};
  }}), /unavailable/);
  assert.deepEqual(methods, ['Runtime.evaluate', 'Runtime.releaseObjectGroup']);
});
