import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {setImmediate as settle} from 'node:timers/promises';
import {parse} from '@babel/parser';

const source=await readFile(new URL('./SQLiteProductOrders.jsx',import.meta.url),'utf8');
const shared=await readFile(new URL('./OrderSearchInput.jsx',import.meta.url),'utf8');
const ast=text=>parse(text,{sourceType:'module',plugins:['jsx']});
const tree=ast(source),sharedTree=ast(shared);
function nodes(node,predicate,out=[]){if(!node||typeof node!=='object')return out;if(predicate(node))out.push(node);for(const [key,value]of Object.entries(node)){if(['loc','start','end'].includes(key))continue;if(Array.isArray(value))for(const child of value)nodes(child,predicate,out);else if(value&&typeof value==='object')nodes(value,predicate,out);}return out;}
const attribute=(opening,name)=>opening.attributes.find(item=>item.type==='JSXAttribute'&&item.name.name===name);
const compile=(text,node,environment)=>Function(...Object.keys(environment),'return ('+text.slice(node.start,node.end)+');')(...Object.values(environment));
const workspace=tree.program.body.find(node=>node.type==='FunctionDeclaration'&&node.id.name==='OrdersWorkspace');
const searchCaller=nodes(workspace,node=>node.type==='JSXOpeningElement'&&node.name.name==='OrderSearchInput')[0];
const input=nodes(sharedTree,node=>node.type==='JSXOpeningElement'&&node.name.name==='input')[0];
const sharedFunction=sharedTree.program.body.find(node=>node.type==='ExportDefaultDeclaration').declaration;
const defaultDelay=sharedFunction.params[0].properties.find(node=>node.key.name==='commitDelayMs').value.right.value;
const zeroDelay=attribute(searchCaller,'commitDelayMs').value.expression.value;
const changeCallback=attribute(input,'onChange').value.expression;
const keyCallback=attribute(input,'onKeyDown').value.expression;
const wrapper=nodes(workspace,node=>node.type==='JSXOpeningElement'&&!!attribute(node,'onKeyDownCapture'))[0];
const capture=attribute(wrapper,'onKeyDownCapture').value.expression;
const lookup=tree.program.body.find(node=>node.type==='FunctionDeclaration'&&node.id.name==='Lookup');
const lookupEffect=nodes(lookup,node=>node.type==='CallExpression'&&node.callee.name==='useEffect'&&source.slice(node.start,node.end).includes('repo.lookup'))[0].arguments[0];
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};

test('only SQLite Orders opts into zero delay; each real input commits before any timer/deadline or Enter',()=>{
 assert.equal(zeroDelay,0);assert.equal(defaultDelay,250,'original App callers keep their existing default');
 const commits=[],drafts=[],draftSignals=[];let timerCalls=0;
 const change=compile(shared,changeCallback,{setDraft:value=>drafts.push(value),callbacks:{current:{onCommit:value=>commits.push(value),onDraftChange:value=>draftSignals.push(value)}},cancel:()=>{},commitDelayMs:zeroDelay,timer:{current:null},setTimeout:()=>{timerCalls++;throw Error('immediate search must not schedule a timer');}});
 // Preserve exact native composition values, including combining characters.
 for(const value of ['c','ca','cá','ca\u0301','Cá 🐟']){
  const event={target:{value},nativeEvent:{isComposing:true},currentTarget:{blur:()=>{throw Error('input must not blur');}}};
  change(event);assert.equal(commits.at(-1),value,'commit is synchronous in the actual input callback');
 }
 assert.deepEqual(commits,drafts);assert.deepEqual(commits,draftSignals);assert.equal(timerCalls,0);
});

test('unchanged shared default still schedules 250ms; zero-delay fix does not change original callers',()=>{
 let pending,delay,committed=null;
 const change=compile(shared,changeCallback,{setDraft:()=>{},callbacks:{current:{onCommit:value=>{committed=value;}}},cancel:()=>{},commitDelayMs:defaultDelay,timer:{current:null},setTimeout:(callback,ms)=>{pending=callback;delay=ms;return 1;}});
 change({target:{value:'original caller'}});assert.equal(delay,250);assert.equal(committed,null);pending();assert.equal(committed,'original caller');
});

test('IME Enter/229 is stopped only at Orders caller without preventing composition or blurring; normal Enter unchanged',()=>{
 const onCapture=compile(source,capture,{});let commits=0,blurs=0;
 const onKey=compile(shared,keyCallback,{commit:()=>{commits++;},draft:'cá'});
 for(const nativeEvent of [{isComposing:true,keyCode:13},{isComposing:false,keyCode:229}]){
  let stopped=false,prevented=false;
  const event={key:'Enter',nativeEvent,currentTarget:{blur:()=>{blurs++;}},stopPropagation:()=>{stopped=true;},preventDefault:()=>{prevented=true;}};
  onCapture(event);if(!stopped)onKey(event);
  assert.equal(stopped,true);assert.equal(prevented,false,'native IME default action remains available');
 }
 assert.equal(commits,0);assert.equal(blurs,0);
 const event={key:'Enter',nativeEvent:{isComposing:false,keyCode:13},currentTarget:{blur:()=>{blurs++;}},stopPropagation:()=>{throw Error('normal Enter must reach original handler');}};
 onCapture(event);onKey(event);assert.equal(commits,1);assert.equal(blurs,1);
});

function lookupRun({query='cá',promise=Promise.resolve({rows:[]})}={}){
 const calls=[],pages=[],validation=[],errors=[];
 const callback=compile(source,lookupEffect,{repo:{lookup:(...args)=>{calls.push(args);return promise;}},source:'products',query,after:'opaque-cursor',queryKey:JSON.stringify(['products',query,'opaque-cursor']),setError:value=>errors.push(value),setPage:value=>pages.push(value),setValidated:value=>validation.push(value),errorText:error=>error.message,setTimeout:()=>{throw Error('lookup must not schedule a deadline timer');},clearTimeout:()=>{throw Error('no lookup timer should exist');}});
 const close=callback();return {calls,pages,validation,errors,close};
}

test('bounded lookup dispatches in the effect immediately with no 200ms timer',async()=>{
 const run=lookupRun();assert.equal(run.calls.length,1,'dispatch happens before awaiting any event-loop deadline');
 assert.deepEqual(run.calls[0],['products',{search:'cá',after:'opaque-cursor',limit:25}]);await settle();assert.equal(run.pages.length,1);assert.deepEqual(run.validation,[true]);run.close();
});

test('lookup cleanup rejects stale success and errors while the new query publishes its own result',async()=>{
 const old=deferred(),next=deferred(),a=lookupRun({query:'ca',promise:old.promise});a.close();
 const b=lookupRun({query:'cá',promise:next.promise});next.resolve({rows:[{id:'current'}]});await settle();old.resolve({rows:[{id:'stale'}]});await settle();
 assert.equal(a.pages.length,0);assert.equal(a.validation.length,0);assert.equal(b.pages[0].rows[0].id,'current');
 const failed=deferred(),c=lookupRun({query:'hidden',promise:failed.promise});c.close();failed.reject(Error('stale rejection'));await settle();assert.deepEqual(c.errors,['']);assert.equal(c.pages.length,0);b.close();
});
