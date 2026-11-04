import test from 'node:test';import assert from 'node:assert/strict';
import {rememberAcceptanceSession} from '../src/services/acceptanceRememberedSession.js';
function fixture(patch={}){
 const user={isAnonymous:false},auth={currentUser:null};auth.currentUser=user;let reads=0,remembers=0,current=true;
 const input={env:{VITE_ACCEPTANCE_REMEMBER_SESSION:'true'},platform:'android',auth,expectedUser:user,isCurrent:()=>current,
  getInfo:async()=>{reads++;return{id:'com.hdmanager.app.acceptance'}},mutate:operation=>operation(),remember:async()=>{remembers++},...patch};
 return {input,stats:()=>({reads,remembers}),cancel:()=>{current=false}};
}
test('remembering a session requires the explicit flag, Android, a nonanonymous user and the exact isolated package',async()=>{
 for(const patch of [{env:{}},{platform:'web'},{expectedUser:{isAnonymous:true}},{getInfo:async()=>({id:'com.hdmanager.app'})}]){
  const f=fixture(patch);assert.equal(await rememberAcceptanceSession(f.input),false);assert.equal(f.stats().remembers,0);
 }
 const f=fixture();assert.equal(await rememberAcceptanceSession(f.input),true);assert.deepEqual(f.stats(),{reads:1,remembers:1});
});
test('logout/account switch while package lookup or the auth mutation queue is pending prevents persistence',async()=>{
 const f=fixture();f.input.getInfo=async()=>{f.cancel();return{id:'com.hdmanager.app.acceptance'}};
 assert.equal(await rememberAcceptanceSession(f.input),false);assert.equal(f.stats().remembers,0);
 const queued=fixture();queued.input.mutate=operation=>{queued.input.auth.currentUser={};return operation()};
 assert.equal(await rememberAcceptanceSession(queued.input),false);assert.equal(queued.stats().remembers,0);
});
