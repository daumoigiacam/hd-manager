import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {retainCollectionRecordIdentityAsync as reconcile} from '../src/utils/cooperativeCollectionIdentity.js';
import {retainCollectionRecordIdentityAsync as reference} from './fixtures/cooperative-identity-copy.baseline.mjs';
import {retainFirestoreWorkerValue as retain} from '../src/services/firestoreWorkerValues.js';
import {retainFirestoreWorkerValue as oldRetain} from './fixtures/firestore-worker-copy.baseline.mjs';
import {Timestamp,GeoPoint,Bytes,vector} from 'firebase/firestore';

function sameSharing(actual,expected,previous,next,depth=0) {
  assert.deepEqual(actual,expected);
  assert.equal(Object.is(actual,previous),Object.is(expected,previous));
  assert.equal(Object.is(actual,next),Object.is(expected,next));
  if(depth>66 || !actual || typeof actual!=='object')return;
  for(const key of Object.keys(actual))sameSharing(actual[key],expected[key],previous?.[key],next?.[key],depth+1);
}

test('lazy copies preserve every child identity across late changes, missing keys, reordering and local markers',async()=>{
  const source={a:{inner:[1,{amount:12}]},b:[{amount:20}],c:5};
  const changedAtEnd={a:{inner:[1,{amount:12}]},b:[{amount:20}],c:6};
  const changedAtStart={c:6,a:{inner:[1,{amount:12}]},b:[{amount:20}]};
  const missing={a:{inner:[1,{amount:12}]},b:[{amount:20}],newKey:undefined};
  const nullMap=Object.assign(Object.create(null),source);
  const dangerous=Object.fromEntries([['__proto__',{safe:true}],['constructor',[{n:-0}]],['end',0]]);
  const dangerousNext=Object.fromEntries([['__proto__',{safe:true}],['constructor',[{n:-0}]],['end',1]]);
  const rows=Array.from({length:80},(_,i)=>({id:'r'+i,data:{n:i},amount:i/10}));
  const endChanged=structuredClone(rows);endChanged[79].__pendingFirebaseSync=true;
  const middleChanged=structuredClone(rows);middleChanged[40].amount=900;
  const swapped=structuredClone(rows);[swapped[70],swapped[71]]=[swapped[71],swapped[70]];
  const sparse=[, {value:1}],ownUndefined=[undefined,{value:1}];
  const cases=[[source,structuredClone(source)],[source,changedAtEnd],[source,changedAtStart],[source,missing],
    [source,{...changedAtEnd,extra:1}],[nullMap,Object.assign(Object.create(null),changedAtEnd)],
    [dangerous,dangerousNext],[sparse,ownUndefined],[ownUndefined,sparse],
    [rows,structuredClone(rows)],[rows,endChanged],[rows,middleChanged],[rows,swapped],
    [rows,structuredClone(rows).slice(1)],[rows,[...structuredClone(rows),{id:'extra',data:{n:90}}]],
    [[{id:'dup',data:source},{id:'dup',data:source}],[{id:'dup',data:changedAtEnd},{id:'dup',data:structuredClone(source)}]]];
  for(const [a,b] of cases){
    const beforeA=Object.setPrototypeOf(structuredClone(a),Object.getPrototypeOf(a));
    const beforeB=Object.setPrototypeOf(structuredClone(b),Object.getPrototypeOf(b));
    sameSharing(await reconcile(a,b),await reference(a,b),a,b);
    sameSharing(retain(a,b),oldRetain(a,b),a,b);
    assert.deepEqual(a,beforeA);assert.deepEqual(b,beforeB);
  }
  assert.equal({}.safe,undefined);
});

test('SDK equality and late nanosecond changes retain the unchanged prefix without mutating snapshots',()=>{
  const before={stamp:new Timestamp(10,1),geo:new GeoPoint(10,106),bytes:Bytes.fromUint8Array(new Uint8Array([1,2])),vec:vector([1,2]),end:0};
  const next={stamp:new Timestamp(10,1),geo:new GeoPoint(10,106),bytes:Bytes.fromUint8Array(new Uint8Array([1,2])),vec:vector([1,2]),end:1};
  sameSharing(retain(before,next),oldRetain(before,next),before,next);
  next.vec=vector([1,3]);sameSharing(retain(before,next),oldRetain(before,next),before,next);
  next.stamp=new Timestamp(10,2);sameSharing(retain(before,next),oldRetain(before,next),before,next);
});

test('unchanged cooperative records need no shallow copies',async()=>{
  const read=file=>readFileSync(new URL(file,import.meta.url),'utf8');
  async function countCopies(source){
    const context=vm.createContext({});
    vm.runInContext(source.replaceAll('export async function ','async function '),context);
    return vm.runInContext(`(async function(){
      var a=Array.from({length:120},function(_,id){return {id:'r'+id,meta:{amount:id},items:[{quantity:1},{quantity:2}]}}),b=JSON.parse(JSON.stringify(a));
      var copies=0,proto=Object.setPrototypeOf,slice=Array.prototype.slice;
      Object.setPrototypeOf=function(){copies++;return proto.apply(Object,arguments)};
      Array.prototype.slice=function(){copies++;return slice.apply(this,arguments)};
      try{var result=await retainCollectionRecordIdentityAsync(a,b,{now:function(){return 0}});return {copies:copies,same:result===a}}
      finally{Object.setPrototypeOf=proto;Array.prototype.slice=slice}
    })()`,context);
  }
  const old=await countCopies(read('./fixtures/cooperative-identity-copy.baseline.mjs'));
  const current=await countCopies(read('../src/utils/cooperativeCollectionIdentity.js'));
  assert.equal(old.same,true);assert.equal(current.same,true);assert.ok(old.copies>120);
  assert.equal(current.copies,0,'unchanged complete snapshots must not be cloned and discarded');
});
