import { createFirestoreReadWorker } from '@hd/firestore-read-worker';
import { decodeFirestoreWorkerValue, decodeFirestoreNativeValue, retainFirestoreWorkerValue } from '@hd/firestore-worker-values';
import { createWorkerAuthEnvelope } from './workerAuthSession.js';
import { createReadWorkerSnapshotAssembler } from './readWorkerSnapshotAssembler.js';

export { canUseFirestoreReadWorker } from './readWorkerPolicy.js';

// Test-injectable transport; factory/codec remain real in the cloud build.
export function createFirestoreReadWorkerClient({ user, config, appId, companyId, accountType, db, emulator,
  isCurrent = () => true, onAuthInvalid = () => {}, onFallback = () => {}, onCommitted = () => {},
  workerFactory = createFirestoreReadWorker, decode = wire => wire?.kind === 'hd-firestore-native-value-v1'
    ? decodeFirestoreNativeValue(wire,db) : decodeFirestoreWorkerValue(wire,db),
  retain = retainFirestoreWorkerValue, yieldWork, now, activity, getCommittedStates = () => ({}),
}) {
  const scope = {uid:user?.uid,apiKey:config?.apiKey,appName:user?.auth?.app?.name || '[DEFAULT]',
    projectId:config?.projectId,appId,companyId,accountType};
  const scopeId = `${Date.now()}-${crypto.randomUUID()}`;
  let worker, disposed = false, ready = false, failed = false, nextId = 0, initTimer;
  const subscriptions = new Map(), committed = new Map();
  const unset = Symbol('uncommitted');
  const setPending = (entry,value) => { entry.pending=value;activity?.setPending(`${scopeId}:${entry.id}`,value); };
  const confirmCommitted = states => {
    if (!valid()) return;
    for (const entry of subscriptions.values()) if (entry.active && entry.pending && entry.expected !== unset
      && states[entry.collectionName] === entry.expected) {
      setPending(entry,false);onCommitted({collectionName:entry.collectionName,generation:entry.generation});
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
    entry.fallbackStarted = true;entry.assembler.close();
    post({type:'unsubscribe',streamId:entry.id});
    onFallback({collection:entry.collectionName,code});
    try { entry.fallbackStop = entry.fallback(); }
    catch (error) { entry.error(error); }
  };
  const fail = code => {
    if (!valid() || failed) return;
    failed = true;clearTimeout(initTimer);worker?.terminate();worker = null;
    for (const entry of subscriptions.values()) fallback(entry,code);
  };
  const subscribeWorker = entry => {
    if (!valid() || !entry.active || entry.fallbackStarted) return;
    if (failed) fallback(entry,'worker-unavailable');
    else if (ready) post({type:'subscribe',streamId:entry.id,collectionName:entry.collectionName});
  };
  const handle = async message => {
    if (!valid() || !message || message.scopeId !== scopeId) return;
    if (message.type === 'ready') {
      if (ready || failed) return;
      ready = true;clearTimeout(initTimer);for (const entry of subscriptions.values()) subscribeWorker(entry);return;
    }
    if (message.type === 'init-failed') { fail('worker-auth-init-failed');return; }
    if (message.type === 'auth-invalid') { close();onAuthInvalid();return; }
    const entry = subscriptions.get(message.streamId);
    if (!entry?.active || entry.fallbackStarted) return;
    try {
      if (message.type === 'fallback') { fallback(entry,message.code);return; }
      if (message.type === 'data-error') {
        const error = new Error('Firestore read-worker listener failed.');error.code = message.code;
        entry.error(error);return;
      }
      if (message.type === 'cache') {
        if (message.metadata?.fromCache !== true || typeof message.metadata.hasPendingWrites !== 'boolean') throw new Error('Invalid worker cache metadata.');
        await entry.publish({kind:'hd-firestore-worker-snapshot-v1',metadata:message.metadata,dataChangeCount:null},[]);
      } else if (message.type === 'begin') await entry.assembler.begin(message);
      else if (message.type === 'chunk') await entry.assembler.chunk(message);
      else if (message.type === 'complete') {
        const result = entry.assembler.finish(message);
        if (!valid() || !entry.active) return;
        committed.set(entry.collectionName,result.items);
        await entry.publish(result.snapshot,result.items);
      } else throw new Error('Invalid worker message.');
      if (valid() && entry.active) post({type:'ack',streamId:entry.id,packetId:message.packetId});
    } catch (error) {
      if (error.name !== 'AbortError') fallback(entry,'worker-payload-invalid');
    }
  };
  const close = () => {
    if (disposed) return;
    post({type:'close'});disposed = true;clearTimeout(initTimer);worker?.terminate();worker = null;
    for (const entry of subscriptions.values()) {
      entry.active = false;clearTimeout(entry.commitTimer);setPending(entry,false);entry.assembler.close();entry.fallbackStop?.();
    }
    subscriptions.clear();committed.clear();
  };
  void (async () => {
    try {
      initTimer = setTimeout(() => fail('worker-init-timeout'),20000);
      await user.getIdToken();
      if (!valid() || failed) return;
      const envelope = createWorkerAuthEnvelope(user,scope);
      worker = workerFactory();
      worker.onmessage = event => { void handle(event.data); };
      worker.onerror = () => fail('worker-unavailable');
      post({type:'init',scope,config,envelope,...(emulator ? {emulator} : {})});
    } catch { fail('worker-unavailable'); }
  })();
  return {
    subscribe(collectionName,{publish,error,fallback:subscribeFallback}) {
      if (!valid()) return () => {};
      const id = `${++nextId}`;
      const entry = {id,collectionName,publish,error,fallback:subscribeFallback,active:true,fallbackStarted:false,fallbackStop:null,
        generation:0,expected:unset,pending:true,commitTimer:null,
        assembler:createReadWorkerSnapshotAssembler({decode,retain,initialItems:committed.get(collectionName)||[],yieldWork,now})};
      subscriptions.set(id,entry);setPending(entry,true);subscribeWorker(entry);
      return () => {
        if (!entry.active) return;
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
    confirmCommitted,close,
  };
}
