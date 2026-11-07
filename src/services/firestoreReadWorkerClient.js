import { createFirestoreReadWorker } from '@hd/firestore-read-worker';
import { decodeFirestoreWorkerValue, decodeFirestoreNativeValue, retainFirestoreWorkerValue } from '@hd/firestore-worker-values';
import { createWorkerAuthEnvelope } from './workerAuthSession.js';
import { createReadWorkerSnapshotAssembler } from './readWorkerSnapshotAssembler.js';
import {createProjectionScheduler} from './cooperativeProjection.js';
import {getReadWorkerCacheAppName,clearReadWorkerPersistentCache} from './readWorkerPersistence.js';

export { canUseFirestoreReadWorker } from './readWorkerPolicy.js';

// Test-injectable transport; factory/codec remain real in the cloud build.
export function createFirestoreReadWorkerClient({ user, config, appId, companyId, accountType, db, emulator,
  isCurrent = () => true, onAuthInvalid = () => {}, onFallback = () => {}, onPending = () => {}, onCommitted = () => {},
  workerFactory = createFirestoreReadWorker, decode = wire => wire?.kind === 'hd-firestore-native-value-v1'
    ? decodeFirestoreNativeValue(wire,db) : decodeFirestoreWorkerValue(wire,db),
  retain = retainFirestoreWorkerValue, yieldWork, now, activity, getCommittedStates = () => ({}),
  retainedSnapshotLimit = 8,
  persistentCache = false,
}) {
  if (!Number.isInteger(retainedSnapshotLimit) || retainedSnapshotLimit < 1 || retainedSnapshotLimit > 8)
    throw new TypeError('Invalid read-worker reopen snapshot limit.');
  const diagnosticParams=typeof location==='undefined'?null:new URLSearchParams(location.search);
  const diagnostics=diagnosticParams?.get('hd_home_sources')==='1';
  const diagnostic=(event,fields={})=>{if(diagnostics)console.info('HD_SOURCE_PERF '+JSON.stringify({event,atMs:performance.now(),...fields}))};
  diagnostic('client-init-start');
  const scope = {uid:user?.uid,apiKey:config?.apiKey,appName:user?.auth?.app?.name || '[DEFAULT]',
    projectId:config?.projectId,appId,companyId,accountType};
  const scopeId = `${Date.now()}-${crypto.randomUUID()}`;
  let worker, disposed = false, ready = false, failed = false, nextId = 0, initTimer;
  let persistentCacheConfigured=false;
  // Create task ports only if decoding actually exhausts its 4 ms budget.
  // One scheduler per authenticated client; closing releases pending yields.
  let decodeScheduler;
  const yieldDecode=yieldWork||(()=>{
    decodeScheduler??=createProjectionScheduler();
    return decodeScheduler.yieldTask();
  });
  const subscriptions = new Map(), committed = new Map(), baselineIds = new Map();
  // Only CLOSED subscriptions use this bounded cache. Active assemblers and
  // application state own their references independently. Eviction changes no
  // data/readiness; a later reopen must receive a complete authoritative transfer.
  const retainCompletedSnapshot = (collectionName, items, baselineId) => {
    committed.delete(collectionName);baselineIds.delete(collectionName);
    if (!items.length) return;
    committed.set(collectionName,items);
    if (typeof baselineId === 'string' && baselineId) baselineIds.set(collectionName,baselineId);
    while (committed.size > retainedSnapshotLimit) {
      const oldest = committed.keys().next().value;
      committed.delete(oldest);baselineIds.delete(oldest);
    }
  };
  const unset = Symbol('uncommitted');
  const setPending = (entry,value) => {
    entry.pending=value;
    if(value&&entry.active&&valid())onPending({collectionName:entry.collectionName,generation:entry.generation});
    activity?.setPending(`${scopeId}:${entry.id}`,value);
  };
  const confirmCommitted = states => {
    if (!valid()) return;
    for (const entry of subscriptions.values()) if (entry.active && entry.pending && entry.expected !== unset
      && states[entry.collectionName] === entry.expected) {
      diagnostic('react-committed',{collection:entry.collectionName,rows:entry.expectedRows,decodeMs:entry.decodeMs,publishMs:entry.publishMs,chunks:entry.chunkCount});
      setPending(entry,false);entry.phase='committed';onCommitted({collectionName:entry.collectionName,generation:entry.generation});
    }
  };
  const afterPublication = entry => {
    confirmCommitted(getCommittedStates());clearTimeout(entry.commitTimer);
    entry.commitTimer=setTimeout(()=>confirmCommitted(getCommittedStates()),0);
  };
  const valid = () => !disposed && isCurrent();
  const post = message => { if (valid() && worker) worker.postMessage({...message,scopeId}); };
  const fallback = (entry, code) => {
    if (!valid() || !entry.active || entry.fallbackStarted) return;
    entry.fallbackStarted = true;entry.phase='fallback';entry.assembler.close();
    post({type:'unsubscribe',streamId:entry.id});
    onFallback({collection:entry.collectionName,code});
    try { entry.fallbackStop = entry.fallback(); }
    catch (error) { entry.error(error); }
  };
  const fail = code => {
    if (!valid() || failed) return;
    failed = true;clearTimeout(initTimer);worker?.terminate();worker = null;decodeScheduler?.close();
    for (const entry of subscriptions.values()) fallback(entry,code);
  };
  const subscribeWorker = entry => {
    if (!valid() || !entry.active || entry.fallbackStarted) return;
    if (failed) fallback(entry,'worker-unavailable');
    else if (ready) { entry.phase='queued';post({type:'subscribe',streamId:entry.id,collectionName:entry.collectionName,baselineId:entry.initialBaselineId}); }
  };
  const handle = async message => {
    if (!valid() || !message || message.scopeId !== scopeId) return;
    if(message.type==='source-timing'){diagnostic(message.event,{...Object.fromEntries(Object.entries(message).filter(([key])=>!['type','scopeId','event'].includes(key)))});return;}
    if (message.type === 'ready') {
      if (ready || failed) return;
      diagnostic('client-worker-ready');ready = true;clearTimeout(initTimer);for (const entry of subscriptions.values()) subscribeWorker(entry);return;
    }
    if (message.type === 'init-failed') { fail('worker-auth-init-failed');return; }
    if (message.type === 'auth-invalid') { close();onAuthInvalid();return; }
    const entry = subscriptions.get(message.streamId);
    if (!entry?.active || entry.fallbackStarted) return;
    entry.lastPacketAfterMs=Date.now()-entry.startedAt;
    try {
      if (message.type === 'source-started') {
        if (entry.phase==='queued' || entry.phase==='subscribing') entry.phase='subscribing';
        return;
      }
      if (message.type === 'fallback') { fallback(entry,message.code);return; }
      if (message.type === 'data-error') {
        entry.phase='error';
        const error = new Error('Firestore read-worker listener failed.');error.code = message.code;
        entry.error(error);return;
      }
      if (message.type === 'cache') {
        entry.phase='cache';
        entry.cachedRows=Number.isSafeInteger(message.count)&&message.count>=0?message.count:null;
        if (message.metadata?.fromCache !== true || typeof message.metadata.hasPendingWrites !== 'boolean') throw new Error('Invalid worker cache metadata.');
        await entry.publish({kind:'hd-firestore-worker-snapshot-v1',metadata:message.metadata,dataChangeCount:null},[]);
      } else if (message.type === 'begin') {
        entry.phase='receiving';entry.rowsReceived=0;entry.expectedRows=message.count;
        await entry.assembler.begin(message);
      }
      else if (message.type === 'chunk') {const started=diagnostics?performance.now():0;await entry.assembler.chunk(message);if(diagnostics){entry.decodeMs+=performance.now()-started;entry.chunkCount++;}entry.rowsReceived+=message.rows.length; }
      else if (message.type === 'complete') {
        const result = entry.assembler.finish(message);
        if (!valid() || !entry.active) return;
        entry.phase='publishing';
        entry.completedSnapshot={items:result.items,baselineId:message.baselineId};
        const publishStarted=diagnostics?performance.now():0;await entry.publish(result.snapshot,result.items);if(diagnostics){entry.publishMs+=performance.now()-publishStarted;diagnostic('published',{collection:entry.collectionName,rows:entry.expectedRows,decodeMs:entry.decodeMs,publishMs:entry.publishMs,chunks:entry.chunkCount});}
      } else throw new Error('Invalid worker message.');
      if (valid() && entry.active) post({type:'ack',streamId:entry.id,packetId:message.packetId});
    } catch (error) {
      if (error.name !== 'AbortError') fallback(entry,'worker-payload-invalid');
    }
  };
  const close = () => {
    if (disposed) return;
    post({type:'close'});disposed = true;clearTimeout(initTimer);worker?.terminate();worker = null;decodeScheduler?.close();
    for (const entry of subscriptions.values()) {
      entry.active = false;clearTimeout(entry.commitTimer);setPending(entry,false);entry.assembler.close();entry.completedSnapshot=null;entry.fallbackStop?.();
    }
    subscriptions.clear();committed.clear();baselineIds.clear();
  };
  void (async () => {
    try {
      initTimer = setTimeout(() => fail('worker-init-timeout'),20000);
      const authStarted=diagnostics?performance.now():0;await user.getIdToken();diagnostic('main-token-ready',{elapsedMs:diagnostics?performance.now()-authStarted:0});
      if (!valid() || failed) return;
      const envelope = createWorkerAuthEnvelope(user,scope);
      let workerScope=scope,cacheEnabled=false;
      if(persistentCache && typeof globalThis.indexedDB!=='undefined' && globalThis.crypto?.subtle){
        const appName=await getReadWorkerCacheAppName(scope);
        workerScope={...scope,sourceAppName:scope.appName,appName};envelope.appName=appName;cacheEnabled=true;
      }
      if(!valid()||failed)return;
      worker = workerFactory();
      persistentCacheConfigured=cacheEnabled;
      worker.onmessage = event => { void handle(event.data); };
      worker.onerror = () => fail('worker-unavailable');
      post({type:'init',scope:workerScope,config,envelope,persistentCache:cacheEnabled,diagnostics,transferProfile:diagnostics&&diagnosticParams?.get('hd_source_profile')==='balanced'?'balanced-64k':null,...(emulator ? {emulator} : {})});
    } catch { fail('worker-unavailable'); }
  })();
  return {
    subscribe(collectionName,{publish,error,fallback:subscribeFallback}) {
      if (!valid()) return () => {};
      const id = `${++nextId}`;
      const initialItems=committed.get(collectionName)||[],initialBaselineId=baselineIds.get(collectionName)||null;
      // Transfer ownership to the live assembler; active source ACKs must not
      // evict the small cache of routes which are actually closed.
      committed.delete(collectionName);baselineIds.delete(collectionName);
      const entry = {id,collectionName,publish,error,fallback:subscribeFallback,active:true,fallbackStarted:false,fallbackStop:null,
        decodeMs:0,publishMs:0,chunkCount:0,startedAt:Date.now(),phase:'subscribing',rowsReceived:0,expectedRows:null,lastPacketAfterMs:null,
        generation:0,expected:unset,pending:true,commitTimer:null,
        initialBaselineId,completedSnapshot:initialItems.length?{items:initialItems,baselineId:initialBaselineId}:null,
        assembler:createReadWorkerSnapshotAssembler({decode,retain,initialItems,
          initialBaselineId,yieldWork:yieldDecode,now})};
      subscriptions.set(id,entry);setPending(entry,true);subscribeWorker(entry);
      return () => {
        if (!entry.active) return;
        if(entry.completedSnapshot)retainCompletedSnapshot(collectionName,entry.completedSnapshot.items,entry.completedSnapshot.baselineId);
        entry.completedSnapshot=null;
        entry.active = false;clearTimeout(entry.commitTimer);setPending(entry,false);entry.assembler.close();entry.fallbackStop?.();subscriptions.delete(id);
        post({type:'unsubscribe',streamId:id});
      };
    },
    beginPublication(collectionName,unchanged=false) {
      const entry=[...subscriptions.values()].find(entry=>entry.active&&entry.collectionName===collectionName);
      if (!entry || !valid()) return null;
      if (!unchanged) { entry.generation++;entry.expected=unset;setPending(entry,true); }
      else afterPublication(entry);
      return entry.generation;
    },
    expectCommit(collectionName,generation,value) {
      if (!valid() || generation === null || generation === undefined) return;
      const entry=[...subscriptions.values()].find(entry=>entry.active&&entry.collectionName===collectionName);
      if (entry?.generation === generation) entry.expected=value;
    },
    isPublicationCurrent(collectionName,generation) {
      if (!valid()) return false;
      return [...subscriptions.values()].some(entry=>entry.active&&entry.collectionName===collectionName&&entry.generation===generation);
    },
    publicationScheduled(collectionName) {
      const entry=[...subscriptions.values()].find(entry=>entry.active&&entry.collectionName===collectionName);
      if (entry && valid()) afterPublication(entry);
    },
    // On-demand diagnostic metadata only: no rows, account IDs or credentials.
    // Do not clear pending based on this view; only actual committed references
    // satisfy the publication witness above.
    getReadinessDiagnostics() {
      const states=getCommittedStates();
      return {ready,failed,disposed,persistentCacheRequested:persistentCache,persistentCacheConfigured,streams:[...subscriptions.values()].map(entry=>({
        collection:entry.collectionName,pending:entry.pending,generation:entry.generation,
        fallback:entry.fallbackStarted,expectedSet:entry.expected!==unset,
        expectedCommitted:entry.expected!==unset && states[entry.collectionName]===entry.expected,
        phase:entry.phase,rowsReceived:entry.rowsReceived,expectedRows:entry.expectedRows,lastPacketAfterMs:entry.lastPacketAfterMs,
        cachedRows:entry.cachedRows??null,
      }))};
    },
    clearPersistentCache() {
      close();
      return persistentCache ? clearReadWorkerPersistentCache(config,scope) : Promise.resolve();
    },
    confirmCommitted,close,
  };
}
