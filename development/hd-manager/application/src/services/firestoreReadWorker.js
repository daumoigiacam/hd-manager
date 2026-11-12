import {transferWithWindow} from './streamTransferWindow.js';
import './legacyRuntime.js';
import { initializeApp } from 'firebase/app';
import { initializeAuth, connectAuthEmulator, getIdTokenResult, onIdTokenChanged } from 'firebase/auth';
import { initializeFirestore, connectFirestoreEmulator, collection, query, where, orderBy, limit, doc, onSnapshot, snapshotEqual,persistentLocalCache,persistentSingleTabManager } from 'firebase/firestore';
import { createWorkerAuthPersistence, assertWorkerIdentity } from './workerAuthSession.js';
import { encodeFirestoreNativeValue as encodeFirestoreWorkerValue } from './firestoreNativeWireValues.js';
import { getFirestoreTransportOptions } from './firestoreTransport.js';
import { createInitialReadAdmission } from './initialReadAdmission.js';
import { createBudgetedTransferChunks,getWorkerTransferPolicy } from './workerTransferBudget.js';
import {getReadWorkerCacheAppName,canPersistReadCollection} from './readWorkerPersistence.js';

let scopeId = null, scope, db, authAdapter, removeTokenListener, closed = false, initialized = false, packetId = 0;
let volatileDb=null,volatileAuthAdapter=null,removeVolatileTokenListener=null;
const streams = new Map(), acknowledgements = new Map();
const serverBaselines = new Map();
const workerEnvironment=import.meta.env||{};
const initialAdmission = createInitialReadAdmission({concurrency:workerEnvironment.VITE_WORKER_INITIAL_CONCURRENCY==='4'?4:2});
let baselineSequence = 0, diagnostics=false,diagnosticProfile=null,transferWindow=1;
const diagnostic=(event,fields={})=>{if(diagnostics)post({type:'source-timing',event,atEpochMs:performance.timeOrigin+performance.now(),...fields})};
const abort = () => Object.assign(new Error('Read-worker stream closed.'), { name: 'AbortError' });
const post = message => { if (!closed) self.postMessage({ ...message, scopeId }); };
const retainClosedBaseline=stream=>{
  serverBaselines.delete(stream.collectionName);
  if(stream.confirmedBaseline){
    serverBaselines.set(stream.collectionName,stream.confirmedBaseline);
    if(serverBaselines.size>8)serverBaselines.delete(serverBaselines.keys().next().value);
  }
  stream.initialBaseline=null;stream.confirmedBaseline=null;
};
const stopStream = id => {
  const stream = streams.get(id);if (!stream) return;
  retainClosedBaseline(stream);
  stream.active = false;stream.pending = null;stream.unsubscribe?.();streams.delete(id);
  for (const [id, ack] of acknowledgements) if (ack.stream === stream) {
    clearTimeout(ack.timer);ack.reject(abort());acknowledgements.delete(id);
  }
  initialAdmission.settle(id);
};
const stopAll = () => { initialAdmission.close();for (const id of [...streams.keys()]) stopStream(id);serverBaselines.clear();removeTokenListener?.();authAdapter?.clear();removeVolatileTokenListener?.();volatileAuthAdapter?.clear(); };
const send = (stream, message) => new Promise((resolve, reject) => {
  if (!stream.active || closed) { reject(abort());return; }
  const id = ++packetId;
  const timer = setTimeout(() => {
    acknowledgements.delete(id);reject(new Error('Read-worker chunk acknowledgement timeout.'));
  }, 45000);
  acknowledgements.set(id,{ resolve,reject,timer,stream });
  const sentAt=diagnostics?performance.now():0;
  if(diagnostics){const prior=resolve;resolve=()=>{stream.ackWaitMs+=(performance.now()-sentAt);prior()};acknowledgements.get(id).resolve=resolve;}
  post({ ...message, packetId:id,streamId:stream.id });
});
const normalize = data => Object.fromEntries(Object.entries(data).map(([key,value]) => [
  key,value && typeof value.toDate === 'function' ? value.toDate().toISOString() : value,
]));
const equalServerDocuments=(left,right)=>{
  if(left.size!==right.size)return false;
  const previous=left.docs,next=right.docs;
  // QuerySnapshot equality also compares docChanges, which differs after a
  // listener reopens. Compare the complete ordered public document snapshots.
  return previous.every((document,index)=>snapshotEqual(document,next[index]));
};

async function pump(stream) {
  if (stream.busy || !stream.active) return;
  stream.busy = true;
  try {
    while (stream.active && stream.pending) {
      const snapshot = stream.pending;stream.pending = null;
      if(diagnostics)diagnostic('snapshot',{collection:stream.collectionName,fromCache:snapshot.metadata.fromCache,rows:snapshot.size,queryWaitMs:performance.now()-stream.admittedAt});
      if (snapshot.metadata.fromCache) {
        stream.forceFull = true;
        await send(stream,{type:'cache',count:snapshot.size,metadata:{fromCache:true,hasPendingWrites:snapshot.metadata.hasPendingWrites}});
        continue;
      }
      const baseline=stream.initialBaseline;
      const reuseBaseline=stream.revision===0 && typeof stream.initialBaselineId==='string'
        && baseline?.id===stream.initialBaselineId && !snapshot.metadata.hasPendingWrites
        && equalServerDocuments(baseline.snapshot,snapshot);
      const fullRequired = stream.documentTarget || stream.forceFull || stream.revision === 0;stream.forceFull = false;
      const changes = fullRequired ? null : snapshot.docChanges({includeMetadataChanges:false});
      const mode = reuseBaseline ? 'metadata' : fullRequired || changes.length > Math.max(64,snapshot.size / 4)
        ? 'full' : changes.length === 0 ? 'metadata' : 'delta';
      const revision = ++stream.revision;
      await send(stream,{type:'begin',revision,mode,count:snapshot.size,changeCount:reuseBaseline?0:changes?.length ?? null,
        ...(reuseBaseline?{baselineId:baseline.id}:{}),
        metadata:{fromCache:snapshot.metadata.fromCache,hasPendingWrites:snapshot.metadata.hasPendingWrites}});
      const rows = mode === 'full' ? snapshot.docs : mode === 'delta' ? changes : [];
      let chunks = 0;
      // Bound both row count and estimated clone work. Four rows per ACK for
      // every tiny record caused thousands of round trips at startup; large
      // records must not be combined into an unbounded main-thread message.
      const transferPolicy=getWorkerTransferPolicy(stream.collectionName,diagnosticProfile?{...workerEnvironment,VITE_WORKER_TRANSFER_PROFILE:diagnosticProfile}:workerEnvironment);
      const transferStarted=diagnostics?performance.now():0;let encodingMs=0,bytes=0,diagnosticCpuMs=0;stream.ackWaitMs=0;
      const packets=createBudgetedTransferChunks(rows,row => {
          const encodeStarted=diagnostics?performance.now():0;
          if (mode === 'full'){const encoded={id:row.id,type:'full',value:encodeFirestoreWorkerValue(normalize(row.data()),stream.firestore)};if(diagnostics)encodingMs+=performance.now()-encodeStarted;return encoded;}
          return {id:row.doc.id,type:row.type,oldIndex:row.oldIndex,newIndex:row.newIndex,
            ...(row.type === 'removed' ? {} : {value:encodeFirestoreWorkerValue(normalize(row.doc.data()),stream.firestore)})};
        },transferPolicy);
      await transferWithWindow(packets,async payload=>{
        if(diagnostics){const t=performance.now();bytes+=new TextEncoder().encode(JSON.stringify(payload)).byteLength;diagnosticCpuMs+=performance.now()-t;}
        await send(stream,{type:'chunk',revision,index:chunks++,rows:payload});
      },{size:['companies','employees','messages'].includes(stream.collectionName)?1:transferWindow,isCurrent:()=>stream.active&&!closed});
      // An empty full transfer carries no rows to reuse. Keeping its token in
      // the eight-entry cache evicted large unchanged histories when visiting
      // modules with empty queues/catalogues, forcing thousands of row ACKs.
      const baselineId=snapshot.metadata.hasPendingWrites || snapshot.size===0 ? null
        : reuseBaseline?baseline.id:`server-${++baselineSequence}`;
      await send(stream,{type:'complete',revision,chunks,baselineId});
      diagnostic('transferred',{collection:stream.collectionName,mode,rows:snapshot.size,chunks,serializedBytes:bytes,encodingMs,diagnosticCpuMs,transferMs:diagnostics?performance.now()-transferStarted:0,ackWaitMs:stream.ackWaitMs,initialQueueMs:stream.admittedAt-stream.queuedAt});
      // Cache only a server-confirmed snapshot whose transfer was acknowledged.
      // The next subscription must present the exact decoded baseline token.
      if(stream.active){
        stream.initialBaseline=null;
        if(baselineId)stream.confirmedBaseline={id:baselineId,snapshot};
        else if(!snapshot.metadata.hasPendingWrites)stream.confirmedBaseline=null;
      }
      // Do not flood the old SDK/renderer with all histories at once. A cache
      // notification does not release this initial slot. This ACK releases
      // admission only; the main client's React commit witness owns readiness.
      if(stream.active && !snapshot.metadata.hasPendingWrites) initialAdmission.settle(stream.id);
    }
  } catch (error) {
    if (stream.active && error.name !== 'AbortError') {
      post({type:'fallback',streamId:stream.id,code:error instanceof TypeError?'worker-value-unsupported':'worker-transfer-failed'});
      stopStream(stream.id);
    }
  } finally { stream.busy = false; }
}

self.onmessage = async event => {
  const message = event.data;
  if (!message || typeof message !== 'object' || closed) return;
  if (message.type === 'ping' && scopeId === null) {
    self.postMessage({type:'pong',nonce:message.nonce,classicWorker:true});return;
  }
  if (message.type === 'init') {
    if (scopeId !== null) return;
    scopeId = message.scopeId;scope = message.scope;
    diagnostics=message.diagnostics===true;diagnosticProfile=diagnostics&&message.transferProfile==='balanced-64k'?'balanced-64k':null;transferWindow=diagnosticProfile?(message.transferWindow===4?4:1):workerEnvironment.VITE_WORKER_TRANSFER_PROFILE==='balanced-64k'?4:1;
    diagnostic('worker-init-start');
    try {
      if (typeof scopeId !== 'string' || !scopeId || scope?.accountType !== 'employee'
        || typeof scope.appId !== 'string' || !scope.appId || scope.appId.includes('/')
        || typeof scope.companyId !== 'string' || !scope.companyId || scope.companyId.includes('/')
        || ['.','..'].includes(scope.companyId) || message.config?.apiKey !== scope.apiKey
        || message.config?.projectId !== scope.projectId) throw new Error('Invalid worker initialization.');
      if(message.persistentCache && (typeof indexedDB==='undefined'||scope.appName!==await getReadWorkerCacheAppName(scope)))
        throw new Error('Invalid persistent read cache scope.');
      const app = initializeApp(message.config,scope.appName);
      authAdapter = createWorkerAuthPersistence(message.envelope,scope);
      const auth = initializeAuth(app,{persistence:authAdapter.Persistence});
      if (message.emulator) {
        if (!scope.projectId.startsWith('demo-') || message.emulator.host !== '127.0.0.1') throw new Error('Invalid worker emulator scope.');
        connectAuthEmulator(auth,`http://127.0.0.1:${message.emulator.authPort}`,{disableWarnings:true});
      }
      await auth.authStateReady();
      assertWorkerIdentity(auth.currentUser,(await getIdTokenResult(auth.currentUser)).claims,scope);
      db = initializeFirestore(app,{experimentalAutoDetectLongPolling:false,...getFirestoreTransportOptions(),
        ...(message.persistentCache?{localCache:persistentLocalCache({cacheSizeBytes:40*1024*1024,
          tabManager:persistentSingleTabManager({forceOwnership:true})})}:{})});
      if (message.emulator) connectFirestoreEmulator(db,'127.0.0.1',message.emulator.firestorePort);
      if(message.persistentCache){
        // Core identity/settings, personnel and customer directories may carry
        // private credentials/configuration. They NEVER enter persistent IDB.
        // Keep their SDK work off the UI thread using a separate memory client.
        const volatileScope={...scope,appName:scope.sourceAppName};
        const volatileApp=initializeApp(message.config,volatileScope.appName);
        volatileAuthAdapter=createWorkerAuthPersistence({...message.envelope,appName:volatileScope.appName},volatileScope);
        const volatileAuth=initializeAuth(volatileApp,{persistence:volatileAuthAdapter.Persistence});
        if(message.emulator)connectAuthEmulator(volatileAuth,`http://127.0.0.1:${message.emulator.authPort}`,{disableWarnings:true});
        await volatileAuth.authStateReady();assertWorkerIdentity(volatileAuth.currentUser,(await getIdTokenResult(volatileAuth.currentUser)).claims,scope);
        volatileDb=initializeFirestore(volatileApp,{experimentalAutoDetectLongPolling:false,...getFirestoreTransportOptions()});
        if(message.emulator)connectFirestoreEmulator(volatileDb,'127.0.0.1',message.emulator.firestorePort);
        removeVolatileTokenListener=onIdTokenChanged(volatileAuth,async user=>{
          if(closed)return;
          try{assertWorkerIdentity(user,(await getIdTokenResult(user)).claims,scope)}catch{post({type:'auth-invalid',code:'worker-auth-scope'});stopAll();closed=true}
        });
      }
      if (closed) return;
      initialized = true;
      removeTokenListener = onIdTokenChanged(auth,async user => {
        if (closed) return;
        try { assertWorkerIdentity(user,(await getIdTokenResult(user)).claims,scope); }
        catch { post({type:'auth-invalid',code:'worker-auth-scope'});stopAll();closed=true; }
      });
      diagnostic('worker-auth-ready');post({type:'ready'});
    } catch { post({type:'init-failed',code:'worker-auth-init-failed'});stopAll();closed=true; }
    return;
  }
  if (message.scopeId !== scopeId) return;
  if (message.type === 'close') { stopAll();closed=true;self.close();return; }
  if (message.type === 'ack') {
    const ack = acknowledgements.get(message.packetId);
    if (ack && ack.stream.id === message.streamId) { clearTimeout(ack.timer);acknowledgements.delete(message.packetId);ack.resolve(); }
    return;
  }
  if (!initialized) return;
  if (message.type === 'unsubscribe') { stopStream(message.streamId);return; }
  if (message.type !== 'subscribe') return;
  const col = message.collectionName;
  if (typeof message.streamId !== 'string' || streams.has(message.streamId) || typeof col !== 'string'
    || !/^[A-Za-z_]+$/.test(col)) {
    post({type:'data-error',streamId:message.streamId,code:'invalid-argument'});return;
  }
  const initialBaseline=serverBaselines.get(col)||null;serverBaselines.delete(col);
  const stream = {id:message.streamId,collectionName:col,initialBaselineId:message.baselineId,initialBaseline,confirmedBaseline:initialBaseline,
    documentTarget:col==='companies',active:true,busy:false,pending:null,forceFull:true,revision:0,unsubscribe:null};
  stream.queuedAt=diagnostics?performance.now():0;stream.ackWaitMs=0;
  streams.set(stream.id,stream);diagnostic('queued',{collection:col});
  try {
    initialAdmission.enqueue(stream.id,{start:()=>{
    // Company bootstrap has always read one exact tenant document, never the
    // companies collection query. All other admitted sources keep companyId ==.
    const sourceDb=volatileDb&&!canPersistReadCollection(col)?volatileDb:db;
    stream.firestore=sourceDb;
    const tenantCollection = collection(sourceDb,'artifacts',scope.appId,'public','data',col);
    const source = stream.documentTarget
      ? doc(sourceDb,'artifacts',scope.appId,'public','data','companies',scope.companyId)
      : col === 'messages'
        // Only the single-source manager inbox is admitted by the caller.
        // The assigned-employee two-query inbox stays on its existing path.
        ? query(tenantCollection,where('companyId','==',scope.companyId),orderBy('createdAt','desc'),limit(200))
        : query(tenantCollection,where('companyId','==',scope.companyId));
    stream.admittedAt=diagnostics?performance.now():0;diagnostic('query-start',{collection:col,initialQueueMs:stream.admittedAt-stream.queuedAt,logicalQueries:1});
    post({type:'source-started',streamId:stream.id});
    stream.unsubscribe = onSnapshot(source,{includeMetadataChanges:true},snapshot => {
      if (!stream.active || closed) return;
      if (stream.pending) stream.forceFull = true;
      stream.pending = stream.documentTarget ? {
        metadata:snapshot.metadata,size:snapshot.exists()?1:0,docs:snapshot.exists()?[snapshot]:[],
      } : snapshot;
      void pump(stream);
    },error => {
      if (!stream.active) return;
      post({type:'data-error',streamId:stream.id,code:error.code || 'unknown'});stopStream(stream.id);
    });
    },onError:error=>{
      if(!stream.active || closed)return;
      post({type:'data-error',streamId:stream.id,code:error.code || 'invalid-argument'});stopStream(stream.id);
    }});
  } catch(error) { post({type:'data-error',streamId:stream.id,code:error.code || 'invalid-argument'});stopStream(stream.id); }
};
