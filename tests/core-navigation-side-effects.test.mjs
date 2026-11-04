import test from 'node:test';import assert from 'node:assert/strict';import{appFunction}from'./helpers/app-source-function.mjs';
test('transport metadata keeps ordered object and functional updates without allocating unused React state',()=>{
 const original=Object.freeze({state:'idle',collection:'',lastAt:'',error:''}),realtimeStatusRef={current:original};
 const set=appFunction('setRealtimeStatus',{realtimeStatusRef},{memoCallback:true});
 const online={state:'online',collection:'orders',lastAt:'2026-11-01T00:00:00.000Z',error:''};assert.equal(set(online),undefined);
 assert.equal(realtimeStatusRef.current,online);set(previous=>({...previous,state:'recovering',error:'offline'}));
 assert.deepEqual(realtimeStatusRef.current,{...online,state:'recovering',error:'offline'});assert.equal(online.error,'');assert.equal(original.state,'idle');
});
test('route restoration saves once outside navigation, flushes on hide, and cancelled identity cannot resurrect a session',()=>{
 const queue=new Map(),saved=[];let id=0;const win=new EventTarget(),doc=new EventTarget();doc.visibilityState='visible';
 const pendingAppSessionPersistence={cancel:null};
 const persist=appFunction('persistAppSessionLater',{window:win,document:doc,pendingAppSessionPersistence,saveAppSession:value=>saved.push(value),saveAppSessionPreference:value=>saved.push(value),scheduleMaintenanceWork:fn=>{queue.set(++id,fn);return id},cancelMaintenanceWork:key=>queue.delete(key)});
 const old={currentUser:{id:'a',companyId:'one'},activeTab:'orders'};
 const cancel=persist(old);const stale=[...queue.values()][0];assert.deepEqual(saved,[]);cancel();stale();win.dispatchEvent(new Event('pagehide'));assert.deepEqual(saved,[]);
 const next={currentUser:{id:'b',companyId:'two'},activeTab:'finance'};persist(next);doc.visibilityState='hidden';doc.dispatchEvent(new Event('visibilitychange'));assert.deepEqual(saved,[next]);assert.equal(queue.size,0);
 win.dispatchEvent(new Event('pagehide'));assert.deepEqual(saved,[next],'hide and pagehide cannot duplicate writes');
 doc.visibilityState='visible';persist(old);for(const job of [...queue.values()])job();assert.deepEqual(saved,[next,old]);
 assert.equal(persist({currentUser:null}),undefined);assert.deepEqual(saved.at(-1),{currentUser:null},'logout clears immediately');
 const writes=[];win.localStorage={setItem:(key,value)=>writes.push(JSON.parse(value)),removeItem:()=>writes.push('cleared')};
 const appSessionStorageBaseline={current:null}, APP_SESSION_NAVIGATION_KEY='fixture-navigation';
 const save=appFunction('saveAppSession',{window:win,pendingAppSessionPersistence,appSessionStorageBaseline,APP_SESSION_NAVIGATION_KEY,APP_SESSION_KEY:'fixture-session'});
 const clear=appFunction('clearAppSession',{window:win,pendingAppSessionPersistence,appSessionStorageBaseline,APP_SESSION_NAVIGATION_KEY,APP_SESSION_KEY:'fixture-session'});
 persist(old);const beforeLogin=[...queue.values()].at(-1);save(next);beforeLogin();assert.equal(saved.length,3);assert.equal(writes[0].currentUser.id,'b','explicit login wins before React effect cleanup');
 persist(next);const beforeLogout=[...queue.values()].at(-1);clear();beforeLogout();win.dispatchEvent(new Event('pagehide'));assert.equal(saved.length,3);assert.equal(writes.at(-1),'cleared','explicit logout cancels old deferred persistence immediately');
});
test('optional navigation preferences write only in maintenance work and cancelled scopes never persist',()=>{
 const queue=new Map(),writes=[];let id=0;
 const persist=appFunction('persistFooterUsageLater',{scheduleMaintenanceWork:fn=>{queue.set(++id,fn);return id},cancelMaintenanceWork:key=>queue.delete(key),window:{localStorage:{setItem:(key,value)=>writes.push([key,JSON.parse(value)])}}});
 const cancel=persist('company-one:user-one',{orders:3});assert.deepEqual(writes,[]);cancel();assert.equal(queue.size,0);
 persist('company-two:user-two',{finance:1});for(const job of queue.values())job();
 assert.deepEqual(writes,[['company-two:user-two',{finance:1}]]);
 const blocked=appFunction('persistFooterUsageLater',{scheduleMaintenanceWork:fn=>{fn();return 1},cancelMaintenanceWork(){},window:{localStorage:{setItem(){throw Error('storage unavailable')}}}});
 assert.doesNotThrow(()=>blocked('key',{}));
});

test('small route preferences cannot override identity, cross context revisions or resurrect cleared sessions',()=>{
 const values=new Map(),writes=[];
 const window={location:{search:''},localStorage:{getItem:key=>values.get(key)??null,setItem:(key,value)=>{values.set(key,value);writes.push([key,value])},removeItem:key=>values.delete(key)}};
 const pendingAppSessionPersistence={cancel:null},appSessionStorageBaseline={current:null};
 const bindings={window,pendingAppSessionPersistence,appSessionStorageBaseline,APP_SESSION_KEY:'session',APP_SESSION_NAVIGATION_KEY:'route',savePreferredLoginMode(){}};
 const clear=appFunction('clearAppSession',bindings);bindings.clearAppSession=clear;
 const save=appFunction('saveAppSession',bindings);bindings.saveAppSession=save;
 const preference=appFunction('saveAppSessionPreference',bindings),load=appFunction('loadAppSession',bindings);
 const company={id:'one',configuration:'x'.repeat(200000)},user={id:'u',companyId:'one',permissions:{orders:true}};
 const session={currentUser:user,currentCompany:company,activeTab:'home'};save(session);
 const full=values.get('session');writes.length=0;
 preference({...session,activeTab:'orders'});preference({...session,activeTab:'finance'});
 assert.equal(writes.length,2);assert(writes.every(([key,value])=>key==='route'&&value.length<300));assert.equal(values.get('session'),full);
 assert.equal(load().activeTab,'finance');assert.deepEqual(load().currentUser,user);assert.deepEqual(load().currentCompany,company);
 values.set('route','{broken');assert.equal(load().activeTab,'home','optional corruption retains valid full context');
 values.set('route',JSON.stringify({revision:'wrong',userId:'u',companyId:'one',activeTab:'orders',currentUser:{id:'attacker'}}));assert.equal(load().activeTab,'home');
 const next={currentUser:{id:'v',companyId:'two'},currentCompany:{id:'two'},activeTab:'home'};const oldRevision=JSON.parse(full).revision;
 save(next);values.set('route',JSON.stringify({revision:oldRevision,userId:'u',companyId:'one',activeTab:'orders'}));assert.equal(load().currentUser.id,'v');assert.equal(load().activeTab,'home');
 // Changing context identity (even with the same user id) must save all new permissions.
 const changed={...next,currentUser:{...next.currentUser,permissions:{finance:false}}};preference(changed);assert.deepEqual(JSON.parse(values.get('session')).currentUser.permissions,{finance:false});
 clear();assert.equal(appSessionStorageBaseline.current,null);assert.equal(values.size,0);assert.equal(load().currentUser,null);
 values.set('session',JSON.stringify(session));assert.equal(load().activeTab,'home','legacy full sessions still restore');
 const restored=load();preference({...restored,activeTab:'orders'});assert(JSON.parse(values.get('session')).revision,'legacy is upgraded by full save before route-only writes');
 window.location.search='?clearSession=1';assert.equal(load().currentUser,null);assert.equal(values.size,0);
});
test('actual native status-bar callback skips same-style navigation, restores modal style, and retries failures safely',async()=>{
 const nativeStatusBarRequestRef={current:null},pending=[],errors=[],doc={documentElement:{dataset:{hdOpenModalCount:'0'}}};
 const SystemBars={setStyle:options=>new Promise((resolve,reject)=>pending.push({options,resolve,reject}))};
 const update=activeTab=>appFunction('updateStatusBar',{activeTab,nativeStatusBarRequestRef,SystemBars,document:doc,recordStartupEvent:(...args)=>errors.push(args)})();
 update('home');update('executive_dashboard');assert.equal(pending.length,1);
 update('more');update('orders');update('settings');assert.equal(pending.length,2);
 doc.documentElement.dataset.hdOpenModalCount='1';update('settings');assert.equal(pending[2].options.style,'LIGHT');
 pending[1].reject({code:'old-request-failed'});await Promise.resolve();assert.equal(nativeStatusBarRequestRef.current.style,'LIGHT','older failure cannot clear newer request');
 pending[2].reject({code:'current-request-failed'});await Promise.resolve();assert.equal(nativeStatusBarRequestRef.current,null);
 update('settings');assert.equal(pending.length,4);pending[3].resolve();
 doc.documentElement.dataset.hdOpenModalCount='0';update('settings');assert.equal(pending[4].options.style,'DARK');
 assert.equal(errors.length,2);for(const request of pending)request.resolve();
});
