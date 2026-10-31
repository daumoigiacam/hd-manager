import test from 'node:test';
import assert from 'node:assert/strict';
import {initializeApp,deleteApp} from 'firebase/app';
import {getFirestore,Timestamp,GeoPoint,Bytes,vector,doc} from 'firebase/firestore';
import {encodeFirestoreWorkerValue as oldEncode,decodeFirestoreWorkerValue as oldDecode,retainFirestoreWorkerValue as retain} from '../src/services/firestoreWorkerValues.js';
import {encodeFirestoreNativeValue as encode,decodeFirestoreNativeValue as decode} from '../src/services/firestoreNativeWireValues.js';

test('native wire equals tagged SDK oracle, including numeric edges, nanos, user markers, dangerous names and repeated decoding',async()=>{
  const app=initializeApp({projectId:'demo-native-wire'},'native-wire-unit'),db=getFirestore(app);
  try{
    const sdk={timestamp:new Timestamp(-1,999999999),geo:new GeoPoint(-10,106),bytes:Bytes.fromUint8Array(new Uint8Array([0,255,42])),reference:doc(db,'fixture/one'),vector:vector([1,2,-3.5])};
    const userMarkers={kind:'hd-firestore-native-value-v1',value:null,specials:[{path:[],type:'timestamp',data:[1,2]}]};
    const value={...sdk,sub:[sdk,{n:NaN,positive:Infinity,negative:-Infinity,zero:-0,nothing:undefined}],date:new Date(-123),
      dangerous:Object.fromEntries([['__proto__',{...sdk}],['constructor',userMarkers],['',sdk]])};
    for(const input of [value,...Object.values(sdk),null,undefined,NaN,-0,userMarkers,Object.assign(Object.create(null),{a:sdk})]){
      const expected=oldDecode(structuredClone(oldEncode(input,db)),db),wire=structuredClone(encode(input,db));
      const before=structuredClone(wire),actual=decode(wire,db);
      assert.equal(retain(expected,actual),expected);
      assert.deepEqual(wire,before,'SDK rehydration must not mutate the wire tree');
      assert.equal(retain(expected,decode(wire,db)),expected);
    }
    const actual=decode(structuredClone(encode(value,db)),db);
    assert.ok(Object.hasOwn(actual.dangerous,'__proto__'));assert.equal({}.timestamp,undefined);
    assert.notEqual(retain(actual,{...actual,timestamp:new Timestamp(-1,999999998)}),actual);
  }finally{await deleteApp(app)}
});

test('native wire rejects unknown values, cycles, invalid/duplicate/overlapping paths and prototype traversal',()=>{
  for(const value of [new Map(),new Uint8Array([1]),()=>{},Symbol('bad'),1n])assert.throws(()=>encode(value),/Unsupported/);
  const cycle={};cycle.loop=cycle;assert.throws(()=>encode(cycle),/nesting/);
  const make=(value,specials)=>({kind:'hd-firestore-native-value-v1',value,specials});
  const special=path=>({path,type:'timestamp',data:[1,2]});
  for(const wire of [null,[99],make({},[special(['__proto__'])]),make({a:null},[special(['a']),special(['a'])]),
    make({a:null},[special(['a','b'])]),make([null],[special(['0'])]),make({},[special([])]),
    make({a:null},[special([{toJSON(){throw Error('Must not execute path objects')}}])]),
    make(new Map(),[]),make(cycle,[]),make({a:1},[special(['a'])]),make({a:null},[{path:['a'],type:'unknown'}])]){
    assert.throws(()=>decode(wire),/Invalid/);
  }
});
