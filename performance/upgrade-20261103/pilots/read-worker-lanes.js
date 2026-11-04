// QA transport only. Inject before login into the same frozen APK; never ship.
// Self-contained ES2019: callers may inject this function's raw toString().
// REQUIRED: an exclusively owned existing createInitialReadAdmission with
// concurrency matching initialConcurrency and maxPending:16. The intent argument
// cannot introspect/reconfigure that queue: the driver must construct it and
// record its observed getSnapshot() peak. No second queue here.
export function createTwoLaneReadWorker({ createWorker, initialAdmission, maxPending = 64, maxStreams = 16, expenseLane = 0, initialConcurrency = 2 } = {}) {
  if (typeof createWorker !== 'function' || !Number.isSafeInteger(maxPending) || maxPending < 1 || maxPending > 1024
    || !Number.isSafeInteger(maxStreams) || maxStreams < 1 || maxStreams > 1024) throw new TypeError('Invalid QA lane bounds.');
  if (expenseLane !== 0 && expenseLane !== 1) throw new TypeError('Invalid QA expenseLane: expected 0 or 1.');
  if (initialConcurrency !== 2 && initialConcurrency !== 4) throw new TypeError('Invalid QA initialConcurrency: expected 2 or 4.');
  if (!initialAdmission || !['enqueue', 'settle', 'close', 'getSnapshot'].every(key => typeof initialAdmission[key] === 'function'))
    throw new TypeError('Required existing initialAdmission dependency.');
  const initialState = initialAdmission.getSnapshot();
  if (!initialState || initialState.closed !== false || initialState.active !== 0 || initialState.queued !== 0)
    throw new TypeError('QA initialAdmission must be fresh and exclusively owned.');
  const lanes = { companies: 0, employees: 0, orders: 0, expenses: expenseLane, financials: 0,
    customers: 1, payments: 1, attendance: 1, performance: 1, notifications: 1 };
  const children = [], ready = [false, false], lastPacket = [0, 0];
  const streams = new Map(), collections = new Map(), pending = new Map();
  const listeners = { message: new Map(), error: new Map(), messageerror: new Map() };
  let scopeId = null, initialized = false, allReady = false, closed = false, nextPacket = 0, lastStream = 0;
  const proxy = { onmessage: null, onerror: null, onmessageerror: null,
    addEventListener(type, callback, options) {
      if (!Object.prototype.hasOwnProperty.call(listeners, type) || !callback) return;
      if (typeof callback !== 'function' && typeof callback.handleEvent !== 'function') return;
      if (!listeners[type].has(callback) && listeners[type].size >= 32) throw new RangeError('QA instrumentation listener bound.');
      if (!listeners[type].has(callback)) listeners[type].set(callback, !!(options && options.once));
    },
    removeEventListener(type, callback) {
      if (Object.prototype.hasOwnProperty.call(listeners, type)) listeners[type].delete(callback);
    },
    postMessage,
    terminate() { shutdown(); },
  };
  function emit(type, data) {
    const event = type === 'message' ? { type, data, target: proxy, currentTarget: proxy }
      : { type, message: data, code: data, qaRejected: true, target: proxy, currentTarget: proxy, preventDefault() {} };
    const property = proxy['on' + type];
    const callbacks = [...listeners[type].entries()];
    // Instrumentation errors must not prevent the client from seeing failure or
    // accidentally turn a transport error into a successful run.
    if (typeof property === 'function') { try { property.call(proxy, event); } catch {} }
    for (const [callback, once] of callbacks) {
      if (!listeners[type].has(callback)) continue;
      if (once) listeners[type].delete(callback);
      try {
        if (typeof callback === 'function') callback.call(proxy, event);
        else callback.handleEvent(event);
      } catch {}
    }
  }
  function clearListeners() {
    for (const kind of Object.keys(listeners)) listeners[kind].clear();
    proxy.onmessage = null; proxy.onerror = null; proxy.onmessageerror = null;
  }
  function shutdown(preserveFailureListeners) {
    if (closed) return;
    closed = true;
    try { initialAdmission.close(); } catch {}
    streams.clear(); collections.clear(); pending.clear();
    const unique = new Set(children);
    children.length = 0;
    for (const child of unique) {
      if (!child) continue;
      // Termination releases the SDK/auth/listeners even if close cannot post.
      try { child.onmessage = null; child.onerror = null; child.onmessageerror = null; } catch {}
      try { if (typeof child.terminate === 'function') child.terminate(); } catch {}
    }
    if (!preserveFailureListeners) clearListeners();
  }
  function fail(code, type) {
    if (closed) return;
    shutdown(true); // Both children are gone BEFORE the original client's handler.
    if (type) emit('message', { type, scopeId, code, qaRejected: true });
    else emit('error', code);
    clearListeners();
  }
  function send(lane, message) {
    if (closed) return false;
    try { children[lane].postMessage(message); return !closed; } catch { fail('qa-lanes-post-failed'); return false; }
  }
  function settle(streamId) {
    if (closed) return;
    try { initialAdmission.settle(streamId); } catch { fail('qa-lanes-admission-settle-failed'); }
  }
  function receive(lane, message) {
    if (closed || !message || message.scopeId !== scopeId) return;
    if (message.type === 'init-failed' || message.type === 'auth-invalid') {
      fail('qa-lanes-' + message.type, message.type); return;
    }
    if (message.type === 'ready') {
      ready[lane] = true;
      if (!allReady && ready[0] && ready[1]) {
        allReady = true;
        emit('message', { type: 'ready', scopeId, qaTwoLane: true });
      }
      return;
    }
    if (!allReady) { fail('qa-lanes-data-before-ready'); return; }
    const stream = streams.get(message.streamId);
    if (!stream) return; // Late packet after cancellation: never ACK or publish.
    if (stream.lane !== lane) { fail('qa-lanes-wrong-lane'); return; }
    if (!stream.started) { fail('qa-lanes-unadmitted-stream'); return; }
    if (message.type === 'fallback' || message.type === 'data-error') { fail('qa-lanes-child-' + message.type); return; }
    if (message.type === 'source-started') { emit('message', message); return; }
    if (!['cache', 'begin', 'chunk', 'complete'].includes(message.type)) { fail('qa-lanes-message-type'); return; }
    if (!Number.isSafeInteger(message.packetId) || message.packetId <= lastPacket[lane]) { fail('qa-lanes-packet-id'); return; }
    if (pending.size >= maxPending || nextPacket >= Number.MAX_SAFE_INTEGER) { fail('qa-lanes-pending-limit'); return; }
    let releasesInitial = false;
    if (message.type === 'begin') {
      if (stream.transfer || !Number.isSafeInteger(message.revision) || message.revision <= stream.lastRevision
        || !message.metadata || typeof message.metadata.fromCache !== 'boolean' || typeof message.metadata.hasPendingWrites !== 'boolean') {
        fail('qa-lanes-transfer'); return;
      }
      stream.lastRevision = message.revision;
      stream.transfer = { revision: message.revision,
        confirmed: message.metadata.fromCache === false && message.metadata.hasPendingWrites === false };
    } else if (message.type === 'complete') {
      if (!stream.transfer || stream.transfer.revision !== message.revision) { fail('qa-lanes-transfer'); return; }
      releasesInitial = stream.transfer.confirmed;
      stream.transfer = null;
    }
    lastPacket[lane] = message.packetId;
    const packetId = ++nextPacket;
    pending.set(packetId, { lane, streamId: message.streamId, original: message.packetId, releasesInitial });
    emit('message', { ...message, packetId });
  }
  function postMessage(message) {
    if (closed) return;
    if (!message || typeof message !== 'object') { fail('qa-lanes-message-type'); return; }
    if (message.type === 'init') {
      if (initialized) { fail('qa-lanes-reinit'); return; }
      initialized = true;
      if (typeof message.scopeId !== 'string' || !message.scopeId || message.scopeId.length > 512) { fail('qa-lanes-scope', 'init-failed'); return; }
      scopeId = message.scopeId;
      // Refuse rather than silently downgrading two SDK owners of one IDB cache.
      if (message.persistentCache !== false && message.persistentCache !== undefined) { fail('qa-lanes-persistence-refused', 'init-failed'); return; }
      try {
        for (let lane = 0; lane < 2; lane++) {
          const child = createWorker();
          children.push(child);
          if (!child || typeof child.postMessage !== 'function' || typeof child.terminate !== 'function'
            || (lane === 1 && child === children[0])) throw new Error('Invalid QA child worker.');
          child.onmessage = event => receive(lane, event && event.data);
          child.onerror = () => fail('qa-lanes-worker-error');
          child.onmessageerror = () => fail('qa-lanes-worker-message-error');
        }
      } catch { fail('qa-lanes-create-failed', 'init-failed'); return; }
      for (let lane = 0; lane < 2 && !closed; lane++) send(lane, { ...message, persistentCache: false });
      return;
    }
    if (!initialized || message.scopeId !== scopeId) return;
    if (message.type === 'close') { shutdown(); return; }
    if (message.type === 'unsubscribe') {
      const stream = streams.get(message.streamId);
      if (!stream) return;
      streams.delete(message.streamId); collections.delete(stream.collectionName);
      for (const [id, packet] of pending) if (packet.streamId === message.streamId) pending.delete(id);
      // Queued subscriptions never reached a child; do not synthesize a child
      // unsubscribe for them. Stop an active child before releasing its slot.
      if (!stream.started || send(stream.lane, message)) settle(message.streamId);
      return;
    }
    if (message.type === 'ack') {
      const packet = pending.get(message.packetId);
      if (!packet) return; // Cancelled/already-consumed ACKs cannot acquire a lane.
      if (packet.streamId !== message.streamId) { fail('qa-lanes-ack-stream'); return; }
      pending.delete(message.packetId);
      if (send(packet.lane, { ...message, packetId: packet.original }) && packet.releasesInitial) {
        const stream = streams.get(packet.streamId);
        if (stream && !stream.initialSettled) {
          stream.initialSettled = true;
          settle(packet.streamId);
        }
      }
      return;
    }
    if (message.type !== 'subscribe') { fail('qa-lanes-message-type'); return; }
    if (!allReady) { fail('qa-lanes-subscribe-before-ready'); return; }
    if (typeof message.collectionName !== 'string' || !Object.prototype.hasOwnProperty.call(lanes, message.collectionName)) { fail('qa-lanes-unsupported-collection'); return; }
    if (collections.has(message.collectionName)) { fail('qa-lanes-duplicate-collection'); return; }
    // The original client emits increasing canonical numeric strings. This
    // enforces lifetime uniqueness with O(1) history, including after unsubscribe.
    const id = Number(message.streamId);
    if (typeof message.streamId !== 'string' || !Number.isSafeInteger(id) || id <= lastStream || String(id) !== message.streamId) { fail('qa-lanes-stream-id'); return; }
    if (streams.size >= maxStreams) { fail('qa-lanes-stream-limit'); return; }
    lastStream = id;
    const lane = lanes[message.collectionName];
    const stream = { lane, collectionName: message.collectionName, started: false, initialSettled: false, transfer: null, lastRevision: 0 };
    streams.set(message.streamId, stream);
    collections.set(message.collectionName, message.streamId);
    try {
      initialAdmission.enqueue(message.streamId, {
        start() {
          if (closed || streams.get(message.streamId) !== stream) return;
          stream.started = true;
          send(lane, message);
        },
        onError() { fail('qa-lanes-admission-start-failed'); },
      });
    } catch { fail('qa-lanes-admission-enqueue-failed'); }
  }
  return proxy;
}
