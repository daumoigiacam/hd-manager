import './legacyRuntime.js';
import { initializeApp } from 'firebase/app';
import { initializeAuth, connectAuthEmulator, getIdTokenResult, onIdTokenChanged } from 'firebase/auth';
import { initializeFirestore, connectFirestoreEmulator, collection, query, where, onSnapshot } from 'firebase/firestore';
import { createWorkerAuthPersistence, assertWorkerIdentity } from './workerAuthSession.js';
import { encodeFirestoreNativeValue as encodeFirestoreWorkerValue } from './firestoreNativeWireValues.js';
import { getFirestoreTransportOptions } from './firestoreTransport.js';

let scopeId = null, scope, db, authAdapter, removeTokenListener, closed = false, initialized = false, packetId = 0;
const streams = new Map(), acknowledgements = new Map();
const abort = () => Object.assign(new Error('Read-worker stream closed.'), { name: 'AbortError' });
const post = message => { if (!closed) self.postMessage({ ...message, scopeId }); };
const stopStream = id => {
  const stream = streams.get(id);if (!stream) return;
  stream.active = false;stream.pending = null;stream.unsubscribe?.();streams.delete(id);
  for (const [id, ack] of acknowledgements) if (ack.stream === stream) {
    clearTimeout(ack.timer);ack.reject(abort());acknowledgements.delete(id);
  }
};
const stopAll = () => { for (const id of [...streams.keys()]) stopStream(id);removeTokenListener?.();authAdapter?.clear(); };
const send = (stream, message) => new Promise((resolve, reject) => {
  if (!stream.active || closed) { reject(abort());return; }
  const id = ++packetId;
  const timer = setTimeout(() => {
    acknowledgements.delete(id);reject(new Error('Read-worker chunk acknowledgement timeout.'));
  }, 45000);
  acknowledgements.set(id,{ resolve,reject,timer,stream });
  post({ ...message, packetId:id,streamId:stream.id });
});
const normalize = data => Object.fromEntries(Object.entries(data).map(([key,value]) => [
  key,value && typeof value.toDate === 'function' ? value.toDate().toISOString() : value,
]));

async function pump(stream) {
  if (stream.busy || !stream.active) return;
  stream.busy = true;
  try {
    while (stream.active && stream.pending) {
      const snapshot = stream.pending;stream.pending = null;
      if (snapshot.metadata.fromCache) {
        stream.forceFull = true;
        await send(stream,{type:'cache',metadata:{fromCache:true,hasPendingWrites:snapshot.metadata.hasPendingWrites}});
        continue;
      }
      const fullRequired = stream.forceFull || stream.revision === 0;stream.forceFull = false;
      const changes = fullRequired ? null : snapshot.docChanges({includeMetadataChanges:false});
      const mode = fullRequired || changes.length > Math.max(64,snapshot.size / 4)
        ? 'full' : changes.length === 0 ? 'metadata' : 'delta';
      const revision = ++stream.revision;
      await send(stream,{type:'begin',revision,mode,count:snapshot.size,changeCount:changes?.length ?? null,
        metadata:{fromCache:snapshot.metadata.fromCache,hasPendingWrites:snapshot.metadata.hasPendingWrites}});
      const rows = mode === 'full' ? snapshot.docs : mode === 'delta' ? changes : [];
      let chunks = 0;
      for (let index = 0; index < rows.length; index += 64) {
        const payload = rows.slice(index,index+64).map(row => {
          if (mode === 'full') return {id:row.id,type:'full',value:encodeFirestoreWorkerValue(normalize(row.data()),db)};
          return {id:row.doc.id,type:row.type,oldIndex:row.oldIndex,newIndex:row.newIndex,
            ...(row.type === 'removed' ? {} : {value:encodeFirestoreWorkerValue(normalize(row.doc.data()),db)})};
        });
        await send(stream,{type:'chunk',revision,index:chunks++,rows:payload});
      }
      await send(stream,{type:'complete',revision,chunks});
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
    try {
      if (typeof scopeId !== 'string' || !scopeId || scope?.accountType !== 'employee'
        || !scope.appId || scope.appId.includes('/') || message.config?.apiKey !== scope.apiKey
        || message.config?.projectId !== scope.projectId) throw new Error('Invalid worker initialization.');
      const app = initializeApp(message.config,scope.appName);
      authAdapter = createWorkerAuthPersistence(message.envelope,scope);
      const auth = initializeAuth(app,{persistence:authAdapter.Persistence});
      if (message.emulator) {
        if (!scope.projectId.startsWith('demo-') || message.emulator.host !== '127.0.0.1') throw new Error('Invalid worker emulator scope.');
        connectAuthEmulator(auth,`http://127.0.0.1:${message.emulator.authPort}`,{disableWarnings:true});
      }
      await auth.authStateReady();
      assertWorkerIdentity(auth.currentUser,(await getIdTokenResult(auth.currentUser)).claims,scope);
      db = initializeFirestore(app,{experimentalAutoDetectLongPolling:false,...getFirestoreTransportOptions()});
      if (message.emulator) connectFirestoreEmulator(db,'127.0.0.1',message.emulator.firestorePort);
      if (closed) return;
      initialized = true;
      removeTokenListener = onIdTokenChanged(auth,async user => {
        if (closed) return;
        try { assertWorkerIdentity(user,(await getIdTokenResult(user)).claims,scope); }
        catch { post({type:'auth-invalid',code:'worker-auth-scope'});stopAll();closed=true; }
      });
      post({type:'ready'});
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
    || !/^[A-Za-z_]+$/.test(col) || ['companies','employees','messages'].includes(col)) {
    post({type:'data-error',streamId:message.streamId,code:'invalid-argument'});return;
  }
  const stream = {id:message.streamId,active:true,busy:false,pending:null,forceFull:true,revision:0,unsubscribe:null};
  streams.set(stream.id,stream);
  try {
    const source = query(collection(db,'artifacts',scope.appId,'public','data',col),where('companyId','==',scope.companyId));
    stream.unsubscribe = onSnapshot(source,{includeMetadataChanges:true},snapshot => {
      if (!stream.active || closed) return;
      if (stream.pending) stream.forceFull = true;
      stream.pending = snapshot;void pump(stream);
    },error => {
      if (!stream.active) return;
      post({type:'data-error',streamId:stream.id,code:error.code || 'unknown'});stopStream(stream.id);
    });
  } catch { post({type:'data-error',streamId:stream.id,code:'invalid-argument'});stopStream(stream.id); }
};
