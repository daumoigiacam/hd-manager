import test from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp, deleteApp } from 'firebase/app';
import { getFirestore, Timestamp, GeoPoint, Bytes, vector, doc, refEqual } from 'firebase/firestore';
import { encodeFirestoreWorkerValue as encode, decodeFirestoreWorkerValue as decode, retainFirestoreWorkerValue as retain } from '../src/services/firestoreWorkerValues.js';

test('worker transport preserves SDK values, nanos, field names and numeric edge values', async () => {
  const app = initializeApp({ projectId: 'demo-worker-codec' }, 'codec-test'), db = getFirestore(app);
  try {
    const value = { stamp: new Timestamp(-1, 999999999), geo: new GeoPoint(-20.25, 106.1),
      bytes: Bytes.fromUint8Array(new Uint8Array([0,255,42])), ref: doc(db, 'fixture/one'),
      vector: vector([1,2,-3.5]), date: new Date(-123), nothing: undefined,
      data: [null,true,'text',NaN,Infinity,-Infinity,-0,{ marker: [5,1,2] }],
      dangerousKeys: Object.fromEntries([['__proto__',{ safe:true }],['constructor','value']]) };
    const actual = decode(structuredClone(encode(value, db)), db);
    assert.equal(actual.stamp.isEqual(value.stamp),true);
    assert.equal(actual.geo.isEqual(value.geo),true);
    assert.equal(actual.bytes.isEqual(value.bytes),true);
    assert.equal(refEqual(actual.ref,value.ref),true);
    assert.equal(actual.vector.isEqual(value.vector),true);
    assert.equal(actual.date.getTime(),-123);
    assert.ok(Object.hasOwn(actual,'nothing'));
    assert.deepEqual(actual.data,value.data);
    assert.ok(Object.hasOwn(actual.dangerousKeys,'__proto__'));
    assert.equal(Object.getPrototypeOf(actual.dangerousKeys),Object.prototype);
    assert.equal({}.safe,undefined);
    assert.equal(retain(value,actual),value,'unchanged SDK values keep the original complete row identity');
    actual.stamp=new Timestamp(-1,999999998);
    assert.notEqual(retain(value,actual),value,'even one nanosecond must invalidate the row');
  } finally { await deleteApp(app); }
});

test('worker transport rejects unsupported instances and does not mask unknown-class changes', () => {
  assert.throws(()=>encode(new Map()),/Unsupported/);
  assert.throws(()=>decode([99]),/Invalid/);
  assert.throws(()=>decode([12,[['__proto__']]]),/Invalid/);
  const a=new (class Unknown {})(),b=new (class Unknown {})();
  assert.equal(retain(a,b),b);
  const previous={amount:1,remove:true},next={amount:1};
  assert.equal(retain(previous,next),next);
});
