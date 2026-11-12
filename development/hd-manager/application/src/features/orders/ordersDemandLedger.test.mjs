import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parse} from '@babel/parser';
const source=await readFile(new URL('./SQLiteProductOrders.jsx',import.meta.url),'utf8');
const tree=parse(source,{sourceType:'module',plugins:['jsx']});
const detail=tree.program.body.find(n=>n.type==='FunctionDeclaration'&&n.id.name==='OrderDetail');
function nodes(node,predicate,out=[]){if(!node||typeof node!=='object')return out;if(predicate(node))out.push(node);for(const [key,value]of Object.entries(node)){if(['loc','start','end'].includes(key))continue;if(Array.isArray(value))for(const child of value)nodes(child,predicate,out);else if(value&&typeof value==='object')nodes(value,predicate,out);}return out;}
const text=node=>source.slice(node.start,node.end);
const variable=name=>nodes(detail,n=>n.type==='VariableDeclarator'&&n.id.name===name)[0].init;
const effects=nodes(detail,n=>n.type==='CallExpression'&&n.callee.name==='useEffect');
const cleanup=effects.find(n=>text(n).includes('return()=>cancelLedger'));
const compile=(node,env)=>Function(...Object.keys(env),'return ('+text(node)+');')(...Object.values(env));
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
function harness({validated=true,editing=null,live=true}={}){
 const pending=deferred(),calls=[],values=[],states=[],errors=[],ledgerController={current:null};
 const env={validated,editing,detail:{customerId:'c',checkpoint:{generation:'g',seq:4}},runtime:{},current:()=>live,ledgerController,AbortController,
  repo:{ledger:(...args)=>{calls.push(args);return pending.promise;}},setLedger:v=>values.push(v),setLedgerState:v=>states.push(v),setLedgerError:v=>errors.push(v),errorText:e=>e.message};
 env.cancelLedger=compile(variable('cancelLedger'),env);
 return {...env,pending,calls,values,states,errors,request:compile(variable('requestLedger'),env),cleanup:compile(cleanup.arguments[0],env)};
}
test('essential detail effect never auto-starts history; explicit enabled button alone binds request',()=>{
 const essential=effects.find(n=>text(n).includes('repo.detail'));
 assert.ok(essential);assert.equal(text(essential).includes('repo.ledger'),false);
 for(const effect of effects)assert.equal(text(effect).includes('repo.ledger'),false);
 const button=nodes(detail,n=>n.type==='JSXOpeningElement'&&n.attributes.some(a=>a.name?.name==='onClick'&&a.value?.expression?.name==='requestLedger'))[0];
 assert.ok(button);assert.match(text(button),/disabled=\{!validated\|\|ledgerState==='loading'\}/);
 assert.match(source.slice(button.start,button.end+80),/Xem công nợ và lịch sử/);
 const h=harness();assert.equal(h.calls.length,0);
});
test('explicit history forwards exact checkpoint/signal, publishes only complete result or withheld reason',async()=>{
 const h=harness(),p=h.request();assert.equal(h.calls.length,1);assert.equal(h.calls[0][0],'c');assert.deepEqual(h.calls[0][1],h.detail.checkpoint);assert.equal(h.calls[0][2].signal,h.ledgerController.current.signal);
 assert.deepEqual(h.states,['loading']);assert.deepEqual(h.values,[null]);
 h.pending.resolve({status:'complete',currentDebt:123,creditBalance:7,orders:[]});await p;
 assert.equal(h.states.at(-1),'complete');assert.equal(h.values.at(-1).currentDebt,123);
 const held=harness(),q=held.request();held.pending.resolve({status:'unconfirmed',reason:'pending source'});await q;
 assert.equal(held.states.at(-1),'withheld');assert.equal(held.values.at(-1).currentDebt,undefined);
});
test('hide/epoch/edit cleanup aborts read and suppresses stale result without resetting draft',async()=>{
 const dependencies=cleanup.arguments[1].elements.map(n=>n.name);for(const name of ['repo','runtime','identity','epoch','reload','editing'])assert.ok(dependencies.includes(name));
 const h=harness(),dispose=h.cleanup(),p=h.request(),signal=h.calls[0][2].signal;
 dispose();assert.equal(signal.aborted,true);assert.equal(h.ledgerController.current,null);
 h.pending.resolve({status:'complete',currentDebt:999});await p;assert.equal(h.values.some(v=>v?.currentDebt===999),false);
 assert.equal(text(cleanup).includes('setEditing'),false);
 assert.match(text(variable('edit')),/cancelLedger\(\)/);assert.match(text(variable('requestClose')),/cancelLedger\(\)/);
});
test('stale/denied detail cannot request history; read errors publish no false debt',async()=>{
 for(const options of [{validated:false},{editing:{}},{live:false}]){const h=harness(options);await h.request();assert.equal(h.calls.length,0);}
 const h=harness(),p=h.request();h.pending.reject(Error('Missing signed customers.history.payments.read'));await p;
 assert.equal(h.states.at(-1),'error');assert.match(h.errors.at(-1),/customers.history.payments.read/);assert.deepEqual(h.values,[null]);
});
