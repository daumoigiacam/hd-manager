import test from 'node:test';import assert from 'node:assert/strict';
import {rememberCommittedReadSources as remember,hasRetainedModuleSources as available,requestReadiness} from '../src/services/moduleReadAvailability.js';
import {readFileSync} from 'node:fs';import {parse} from '@babel/parser';
test('only this read owner retains committed sources; refresh does not become a fresh server acknowledgement',()=>{
 const binding={tenantId:'tenant-a',ownerKey:'uid-a/tenant-a/revision-1',names:['companies','employees','products','customers','orderRequests','warehouseDispatches']};
 const state=remember(null,binding),refreshed={...state,collections:{...state.collections,warehouseDispatches:false}};
 assert(available({...binding,state:refreshed,collections:['warehouseDispatches']}));assert.equal(refreshed.collections.warehouseDispatches,false);
 for(const changed of [{tenantId:'tenant-b'},{ownerKey:'uid-b/tenant-a/revision-1'},{ownerKey:'uid-a/tenant-a/revision-2'}])assert.equal(available({...binding,...changed,state,collections:['products']}),false);
 assert.equal(available({...binding,state:{...binding,collections:{}},collections:['products']}),false);
 const next=remember(state,{...binding,ownerKey:'uid-b/tenant-b/revision-1',tenantId:'tenant-b',names:['companies']});assert.equal(next.availableCollections.products,undefined);
});
test('retained rows stay readable; editing, approval and sharing require fresh complete sources',()=>{
 const cached={baseFresh:false,dispatchFresh:false,baseRetained:true,dispatchRetained:true,rowsComplete:true,statusesComplete:true};
 assert.deepEqual(requestReadiness(cached),{rowsReady:true,projectionReady:true,writesReady:false,retained:true});
 assert.equal(requestReadiness({...cached,baseFresh:true}).writesReady,false);
 assert.equal(requestReadiness({...cached,baseFresh:true,dispatchFresh:true}).writesReady,true);
 assert.equal(requestReadiness({...cached,baseRetained:false}).rowsReady,false);
 assert.equal(requestReadiness({...cached,statusesComplete:false}).writesReady,false);
});
test('the canonical App denial cleanup drops retained readiness and cannot clear a replacement owner',()=>{
 const source=readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8'),tree=parse(source,{sourceType:'module',plugins:['jsx']});let fn;
 const visit=node=>{if(!node||typeof node!=='object')return;if(node.type==='VariableDeclarator'&&node.id?.name==='invalidateDeniedReadOwner')fn=node.init;for(const [key,value]of Object.entries(node)){if(['loc','extra','comments'].includes(key))continue;if(Array.isArray(value))value.forEach(visit);else if(value?.type)visit(value);}};visit(tree);assert(fn);
 const readOwnerRef={current:'owner-a'},collectionReadinessCommittedRef={current:{}},customerBootstrapCommitRef={current:{}},events=[];
 let state=remember(null,{tenantId:'a',ownerKey:'owner-a',names:['companies','employees','orderRequests']}),loaded={orderRequests:true};
 const bindings={readOwnerRef,readOwnerKey:'owner-a',tenantCompanyId:'a',collectionReadinessCommittedRef,customerBootstrapCommitRef,stopReadSources:()=>events.push('stop'),lastStableCollectionDataRef:{current:new Map([['orderRequests',['private']]])},lastRealtimeSnapshotAtRef:{current:new Map()},lastRealtimeServerSnapshotAtRef:{current:new Map()},setLoadedCollections:f=>{loaded=f(loaded);},setServerConfirmedCollectionState:f=>{state=f(state);},setCustomerFinancialState:()=>{},resetCustomerFinancialReadiness:()=>({})};
 const invalidate=new Function(...Object.keys(bindings),'return ('+source.slice(fn.start,fn.end)+')')(...Object.values(bindings));
 invalidate();assert.deepEqual(state.collections,{});assert.equal(state.availableCollections,undefined);assert.deepEqual(loaded,{});assert.equal(collectionReadinessCommittedRef.current,null);assert.equal(bindings.lastStableCollectionDataRef.current.size,0);
 state=remember(null,{tenantId:'b',ownerKey:'owner-b',names:['companies','employees','orderRequests']});readOwnerRef.current='owner-b';invalidate();assert.equal(state.availableCollections.orderRequests,true);assert.equal(state.ownerKey,'owner-b');
});
