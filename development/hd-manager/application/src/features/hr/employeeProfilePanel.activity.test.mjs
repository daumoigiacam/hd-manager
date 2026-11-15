import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {parse} from '@babel/parser';

// Execute the source hook bodies, not a reimplementation of its lifecycle.
// This is a focused ownership/cleanup check, not APK or rendering evidence.
const source=readFileSync(new URL('./EmployeeProfilePanel.jsx',import.meta.url),'utf8');
const ast=parse(source,{sourceType:'module',plugins:['jsx']});
const component=ast.program.body.find(node=>node.type==='ExportDefaultDeclaration').declaration;
const returned=component.body.body.find(node=>node.type==='ReturnStatement');
const program=source.slice(component.start,returned.start)+'return {rows,error,loading};}';
function harness(props){
 const slots=[];let index=0,dirty=true,effects=[],view;
 const useState=initial=>{const n=index++;slots[n]??={value:initial};return[slots[n].value,next=>{slots[n].value=typeof next==='function'?next(slots[n].value):next;dirty=true;}];};
 const useRef=initial=>{const n=index++;return slots[n]??={current:initial};};
 const useEffect=(effect,deps)=>{const n=index++,old=slots[n];if(!old||deps.some((v,i)=>!Object.is(v,old.deps[i]))){slots[n]={deps};effects.push(()=>{old?.cleanup?.();slots[n].cleanup=effect();});}};
 const render=vm.runInNewContext(program+'\nEmployeeProfilePanel;',{useState,useRef,useEffect});
 return{
  render(next={}){props={...props,...next};index=0;effects=[];dirty=false;view=render(props);return view;},
  commit(){for(const effect of effects)effect();effects=[];},
  async settle(){for(let i=0;i<8;i++){if(dirty){this.render();for(const effect of effects)effect();}await new Promise(resolve=>setImmediate(resolve));}return view;},
  change(next){props={...props,...next};dirty=true;},
  stop(){for(const slot of slots)slot.cleanup?.();},
 };
}
function owner(){
 let reads=0;const subscriptions=new Set(),deferred=[];
 const runtime={isCurrent:()=>true,subscribe(fn){subscriptions.add(fn);return()=>subscriptions.delete(fn);}};
 const repository={page(){reads++;return new Promise(resolve=>deferred.push(resolve));}};
 return{runtime,repository,deferred,get reads(){return reads;},get active(){return subscriptions.size;}};
}
test('hidden employee panel does not read or subscribe; source changes detach and ignore late reads',async()=>{
 const a=owner(),h=harness({...a,visible:false});await h.settle();assert.equal(a.reads,0);assert.equal(a.active,0);
 h.change({visible:true});await h.settle();assert.equal(a.reads,1);assert.equal(a.active,1);
 h.change({visible:false});await h.settle();assert.equal(a.active,0);
 a.deferred.shift()([{id:'late-a'}]);const hidden=await h.settle();assert.equal(hidden.rows.length,0);
 h.change({visible:true});await h.settle();assert.equal(a.active,1);assert.equal(a.reads,2);
 a.deferred.shift()([{id:'a'}]);const ready=await h.settle();assert.equal(ready.rows[0].id,'a');assert.equal(ready.loading,false);
 h.stop();assert.equal(a.active,0);
});
test('a new owner cannot render the previous employee queue before or after a late callback',async()=>{
 const a=owner(),b=owner(),h=harness({...a,visible:true});await h.settle();a.deferred.shift()([{id:'private-a'}]);await h.settle();
 const switched=h.render({...b});assert.equal(switched.rows.length,0);assert.equal(switched.loading,true);
 h.commit();await h.settle();
 assert.equal(a.active,0);assert.equal(b.active,1);
 b.deferred.shift()([{id:'b'}]);const ready=await h.settle();assert.equal(ready.rows[0].id,'b');h.stop();assert.equal(b.active,0);
});
