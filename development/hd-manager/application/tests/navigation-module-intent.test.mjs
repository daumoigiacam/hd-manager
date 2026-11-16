import test from 'node:test';
import assert from 'node:assert/strict';
import {createPreloadableModule} from '../src/utils/preloadableModule.js';
import {prepareNavigationModule,navigationIntentTab} from '../src/utils/navigationModuleIntent.js';

test('the requested import starts while data readiness is pending; unrelated modules stay lazy',async()=>{
 let finishImport,imports=0,otherImports=0;
 const module=createPreloadableModule(()=>{imports++;return new Promise(resolve=>{finishImport=resolve;});});
 const modules={orders:module,messages:createPreloadableModule(()=>{otherImports++;})};
 assert.equal(imports,0);let dataReady=false;
 assert.equal(prepareNavigationModule('orders',{modules,canAccess:()=>true}),true);
 await Promise.resolve();assert.equal(imports,1);assert.equal(dataReady,false);
 prepareNavigationModule('orders',{modules,canAccess:()=>true});
 finishImport({default:()=>null});await module.preload();
 dataReady=true;assert.equal(imports,1);assert.equal(otherImports,0);
 assert.equal(typeof module.getResolved().default,'function');
});
test('current permission is checked on every intent, including a revoked or unvisited route',async()=>{
 let allowed=false,calls=0;const modules={orders:createPreloadableModule(()=>{calls++;return {default:()=>null};})};
 const policy={modules,canAccess:()=>allowed};
 assert.equal(prepareNavigationModule('orders',policy),false);
 assert.equal(prepareNavigationModule('__proto__',policy),false);
 assert.equal(prepareNavigationModule('unknown',policy),false);
 allowed=true;assert.equal(prepareNavigationModule('orders',policy),true);await modules.orders.preload();
 allowed=false;assert.equal(prepareNavigationModule('orders',policy),false);assert.equal(calls,1);
 assert.equal(prepareNavigationModule('orders',{modules,canAccess:()=> 'owner'}),false);
});
test('a rejected chunk does not cause an unhandled rejection, automatic retry or reload',async()=>{
 let calls=0;const module=createPreloadableModule(()=>{calls++;throw Error('chunk offline');});
 prepareNavigationModule('orders',{modules:{orders:module},canAccess:()=>true});
 await new Promise(resolve=>setImmediate(resolve));assert.equal(calls,1);
 assert.equal(module.getResolved(),undefined);
 await new Promise(resolve=>setImmediate(resolve));assert.equal(calls,1);
 await assert.rejects(module.preload(),/chunk offline/);assert.equal(calls,2);
});
test('icons resolve to their route button; disabled controls and unrelated content do not preload',()=>{
 const attributes={'data-home-module':'orders'};
 const button={getAttribute:name=>attributes[name]||null};
 const icon={closest:()=>button};
 assert.equal(navigationIntentTab(icon),'orders');
 button.disabled=true;assert.equal(navigationIntentTab(icon),null);
 button.disabled=false;attributes['aria-disabled']='true';assert.equal(navigationIntentTab(icon),null);
 assert.equal(navigationIntentTab({closest:()=>null}),null);
 assert.equal(navigationIntentTab(null),null);
});
