import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const read = file => readFileSync(new URL(file, import.meta.url), 'utf8');
const compatibility = read('../src/services/legacyRuntime.js');
test('old WebView built-ins support actual collection reconciliation without replacing native functions', () => {
  const context = vm.createContext({});
  vm.runInContext('Object.hasOwn = undefined; Array.prototype.at = undefined;', context);
  vm.runInContext(compatibility, context);
  vm.runInContext(read('../src/utils/collectionIdentity.js').replaceAll('export function ', 'function '), context);
  assert.equal(vm.runInContext(`(() => {
    const old = [{id:'a', amount:100}];
    return retainCollectionRecordIdentity(old, [{id:'a', amount:100}]) === old
      && [1,2].at(-1) === 2 && [1].at(8) === undefined
      && !Object.hasOwn({}, 'toString') && Object.hasOwn({x:0}, 'x')
      && !Object.getOwnPropertyDescriptor(Array.prototype, 'at').enumerable;
  })()`, context), true);
  vm.runInContext('this.originalAt = Array.prototype.at; this.originalOwn = Object.hasOwn;', context);
  vm.runInContext(compatibility, context);
  assert.equal(vm.runInContext('originalAt === Array.prototype.at && originalOwn === Object.hasOwn', context), true);
});
test('compatibility initializes before App and production lowers syntax for WebView 74', () => {
  const main = read('../src/main.jsx');
  assert.ok(main.indexOf("import './services/legacyRuntime.js'") < main.indexOf("import App from"));
  assert.match(read('../vite.config.js'), /target: \['chrome74', 'es2019'\]/);
  assert.doesNotMatch(read('../src/services/firestoreRestPagination.js'), /structuredClone\(/);
});

test('old WebView settles every queued result in input order, including failures', async () => {
  const context = vm.createContext({ setTimeout });
  vm.runInContext('Promise.allSettled = undefined;', context);
  vm.runInContext(compatibility, context);
  const outcomes = await vm.runInContext(`Promise.allSettled(new Set([
    new Promise(resolve => setTimeout(() => resolve('slow'), 5)), Promise.reject('failed'), 3,
  ]))`, context);
  assert.equal(JSON.stringify(outcomes), JSON.stringify([
    { status: 'fulfilled', value: 'slow' }, { status: 'rejected', reason: 'failed' }, { status: 'fulfilled', value: 3 },
  ]));
  assert.equal(JSON.stringify(await vm.runInContext('Promise.allSettled([])', context)), '[]');
  await assert.rejects(vm.runInContext('Promise.allSettled({})', context), /iterable|object/i);
  assert.equal(await vm.runInContext(`class CustomPromise extends Promise {}; Promise.allSettled.call(CustomPromise, []) instanceof CustomPromise`, context), true);
});

test('UUID fallback uses secure bytes, retains v4 bits and never replaces native or uses weak entropy', () => {
  let calls = 0;
  const secureCrypto = { getRandomValues(bytes) { calls++; bytes.fill(255); return bytes; } };
  const context = vm.createContext({ crypto: secureCrypto, isSecureContext: true });
  vm.runInContext(compatibility, context);
  assert.equal(secureCrypto.randomUUID(), 'ffffffff-ffff-4fff-bfff-ffffffffffff');
  assert.equal(calls, 1);
  const original = secureCrypto.randomUUID;
  vm.runInContext(compatibility, context);
  assert.equal(secureCrypto.randomUUID, original);
  const noEntropy = { };
  vm.runInContext(compatibility, vm.createContext({ crypto: noEntropy, isSecureContext: true }));
  assert.equal(noEntropy.randomUUID, undefined);
  const insecure = { getRandomValues: secureCrypto.getRandomValues };
  vm.runInContext(compatibility, vm.createContext({ crypto: insecure, isSecureContext: false }));
  assert.equal(insecure.randomUUID, undefined);
});
