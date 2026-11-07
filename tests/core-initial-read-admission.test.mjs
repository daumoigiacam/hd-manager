import test from 'node:test';
import assert from 'node:assert/strict';
import {createInitialReadAdmission} from '../src/services/initialReadAdmission.js';

test('initial reads admit only two jobs and drain FIFO after explicit first-server ACK',()=>{
  const queue=createInitialReadAdmission(),started=[],errors=[];
  for(let index=0;index<50;index++)queue.enqueue(String(index),{start:()=>started.push(index),onError:error=>errors.push(error)});
  assert.deepEqual(started,[0,1]);assert.deepEqual(queue.getSnapshot(),{active:2,queued:48,closed:false});
  for(let index=0;index<50;index++){
    assert.equal(queue.settle(String(index)),true);
    assert(queue.getSnapshot().active<=2);
    assert.deepEqual(started,Array.from({length:Math.min(index+3,50)},(_,i)=>i));
  }
  assert.deepEqual(queue.getSnapshot(),{active:0,queued:0,closed:false});assert.deepEqual(errors,[]);
});

test('queued cancellation never starts that source, active cancellation releases exactly one slot, duplicate ACK has no effect',()=>{
  const queue=createInitialReadAdmission(),started=[];
  for(const key of ['a','b','c','d'])queue.enqueue(key,{start:()=>started.push(key),onError:assert.fail});
  assert.equal(queue.settle('c'),true);assert.deepEqual(started,['a','b']);
  queue.settle('a');assert.deepEqual(started,['a','b','d']);
  assert.equal(queue.settle('a'),false);assert.equal(queue.getSnapshot().active,2);
  queue.close();assert.deepEqual(queue.getSnapshot(),{active:0,queued:0,closed:true});
});

test('synchronous listener failures and throwing error observers cannot strand slots or later sources',()=>{
  const queue=createInitialReadAdmission({concurrency:1}),errors=[],started=[];
  queue.enqueue('first',{start:()=>{throw Error('Synthetic listener construction failure')},onError:error=>{errors.push(error.message);throw Error('Observer failure')}});
  assert.equal(queue.getSnapshot().active,0);
  queue.enqueue('next',{start:()=>started.push('next'),onError:assert.fail});
  assert.deepEqual(started,['next']);assert.deepEqual(errors,['Synthetic listener construction failure']);queue.close();
});

test('reentrant completion/cancellation stays iterative and close prevents late starts',()=>{
  const queue=createInitialReadAdmission({concurrency:1}),started=[];
  queue.enqueue('held',{start:()=>{},onError:assert.fail});
  for(let index=0;index<30;index++)queue.enqueue(String(index),{start:()=>{started.push(index);if(index===10)queue.close();else queue.settle(String(index))},onError:assert.fail});
  queue.settle('held');assert.deepEqual(started,Array.from({length:11},(_,i)=>i));
  assert.equal(queue.settle('20'),false);assert.deepEqual(queue.getSnapshot(),{active:0,queued:0,closed:true});
  assert.throws(()=>queue.enqueue('late',{start:assert.fail,onError:assert.fail}),{name:'AbortError'});
});

test('invalid, duplicate and excess jobs fail explicitly instead of silently opening unbounded subscriptions',()=>{
  for(const options of [{concurrency:0},{concurrency:1.5},{concurrency:2,maxPending:1},{maxPending:NaN}])assert.throws(()=>createInitialReadAdmission(options),RangeError);
  const queue=createInitialReadAdmission({concurrency:1,maxPending:2}),job={start(){},onError(){}};
  assert.throws(()=>queue.enqueue('',job),TypeError);queue.enqueue('a',job);
  assert.throws(()=>queue.enqueue('a',job),TypeError);queue.enqueue('b',job);
  assert.throws(()=>queue.enqueue('c',job),{code:'resource-exhausted'});
  assert.deepEqual(queue.getSnapshot(),{active:1,queued:1,closed:false});queue.close();
});

test('one bulk history leaves the second initial slot available for small required sources',()=>{
  const queue=createInitialReadAdmission({groupLimits:{history:1}}),started=[];
  const add=(key,group='')=>queue.enqueue(key,{group,start:()=>started.push(key),onError:assert.fail});
  add('orders','history');add('payments','history');add('payroll');add('expenses');
  assert.deepEqual(started,['orders','payroll']);
  queue.settle('payroll');assert.deepEqual(started,['orders','payroll','expenses']);
  queue.settle('expenses');assert.equal(queue.getSnapshot().active,1);
  assert.deepEqual(started,['orders','payroll','expenses'],'bulk work remains queued until explicit server ACK');
  queue.settle('orders');assert.deepEqual(started,['orders','payroll','expenses','payments']);
  assert.equal(queue.settle('orders'),false);queue.settle('payments');
  assert.deepEqual(queue.getSnapshot(),{active:0,queued:0,closed:false});queue.close();
});

test('group cancellation, construction error and reentrant ACK cannot strand or over-admit a bulk history',()=>{
 const queue=createInitialReadAdmission({groupLimits:{history:1}}),started=[],errors=[];
 const add=(key,start=()=>started.push(key))=>queue.enqueue(key,{group:'history',start,onError:e=>errors.push(e.message)});
 add('held');add('cancelled');add('throws',()=>{throw Error('listener error')});
 add('reentrant',()=>{started.push('reentrant');queue.settle('reentrant')});add('last');
 queue.settle('cancelled');assert.deepEqual(started,['held']);queue.settle('held');
 assert.deepEqual(started,['held','reentrant','last']);assert.deepEqual(errors,['listener error']);
 assert.equal(queue.getSnapshot().active,1);queue.close();
 for(const groupLimits of [{history:0},{history:1.5},{'':1}])assert.throws(()=>createInitialReadAdmission({groupLimits}),RangeError);
});
