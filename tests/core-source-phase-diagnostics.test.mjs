import test from 'node:test';import assert from 'node:assert/strict';
import {createSourcePhaseDiagnostics} from '../src/services/sourcePhaseDiagnostics.js';
test('source diagnostics are disabled by default and emit only whitelisted timing metadata when explicitly enabled',()=>{
 const events=[];let time=0,enabled=false;
 const diagnostic=createSourcePhaseDiagnostics({enabled:()=>enabled,record:(...args)=>events.push(args),now:()=>time});
 assert.equal(diagnostic.begin(),null);diagnostic.mark('orders','materialized');assert.deepEqual(events,[]);
 enabled=true;const start=diagnostic.begin();time=40;diagnostic.mark('orders','materialized',start);diagnostic.mark('orders','state-queued');
 assert.deepEqual(events,[['data.source.phase',{collection:'orders',phase:'materialized',durationMs:40}],['data.source.phase',{collection:'orders',phase:'state-queued'}]]);
 assert.throws(()=>diagnostic.mark('orders/private-id','materialized'),TypeError);assert.throws(()=>diagnostic.mark('orders','arbitrary-payload'),TypeError);
});
