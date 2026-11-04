import {createRequestAdmission} from './requestAdmission.js';

const emptyItems = Object.freeze([]);
const closedSnapshot = Object.freeze({
  status: 'closed',
  items: emptyItems,
  hasMore: null,
  cursor: null,
  nextCursor: null,
  dataSource: null,
  error: null,
  updatedAt: null
});
const deniedSnapshot = Object.freeze({
  ...closedSnapshot,
  status: 'error',
  error: Object.freeze({
    code: 'permission-denied',
    message: 'Không còn quyền xem dữ liệu này.'
  })
});
const abortError = () => Object.assign(new Error('Data request cancelled.'), {
  name: 'AbortError',
  code: 'cancelled'
});
const failure = (code, message) => Object.assign(new Error(message), {
  code
});
const denied = error => /(?:^|\/)(?:permission-denied|unauthenticated)$/.test(error?.code || '');
const transient = error => /(?:^|\/)(?:unavailable|deadline-exceeded|resource-exhausted)$/.test(error?.code || '') || [408, 429, 502, 503, 504].includes(error?.status);

// Query keys are collision-free canonical values, never JSON of SDK/Auth objects.
export function canonicalQueryValue(value, ancestors = new Set(), depth = 0) {
  if (depth > 20) throw new TypeError('Query descriptor is too deep.');
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return Object.is(value, -0) ? '-0' : JSON.stringify(value);
  if (!value || typeof value !== 'object' || ancestors.has(value) || !Array.isArray(value) && ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new TypeError('Query descriptors require plain finite JSON values.');
  if (Array.isArray(value) && Array.from({
    length: value.length
  }, (_, index) => !Object.hasOwn(value, index)).some(Boolean)) throw new TypeError('Sparse query arrays are not supported.');
  ancestors.add(value);
  const result = Array.isArray(value) ? '[' + value.map(item => canonicalQueryValue(item, ancestors, depth + 1)).join(',') + ']' : '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonicalQueryValue(value[key], ancestors, depth + 1)).join(',') + '}';
  ancestors.delete(value);
  return result;
}
export function normalizeDataPageSize(value = 20) {
  if (value !== 15 && value !== 20) throw new RangeError('Operational pages must contain 15 or 20 records.');
  return value;
}
function freezeDescriptor(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freezeDescriptor);
    Object.freeze(value);
  }
  return value;
}

// Readonly page DTOs cannot be edited through a nested draft reference shared
// with another consumer. Preserve SDK atoms (Timestamp/Reference/etc.) without
// traversing or freezing their private internals.
function immutableReadValue(value, seen = new WeakMap(), depth = 0) {
  if (!value || typeof value !== 'object') return value;
  if (!Array.isArray(value) && ![Object.prototype, null].includes(Object.getPrototypeOf(value))) return value;
  if (depth > 40) throw failure('invalid-page', 'Page record nesting exceeds the supported depth.');
  if (seen.has(value)) return seen.get(value);
  const clone = Array.isArray(value) ? new Array(value.length) : Object.create(Object.getPrototypeOf(value));
  seen.set(value, clone);
  for (const key of Object.keys(value)) Object.defineProperty(clone, key, {
    value: immutableReadValue(value[key], seen, depth + 1),
    enumerable: true,
    configurable: true,
    writable: true
  });
  return Object.freeze(clone);
}
function abortableDelay(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(abortError());
      return;
    }
    const finish = () => {
      signal.removeEventListener('abort', cancel);
      resolve();
    };
    const timer = setTimeout(finish, ms);
    const cancel = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', cancel);
      reject(abortError());
    };
    signal.addEventListener('abort', cancel, {
      once: true
    });
  });
}
export function createInstantDataEngine({
  scope,
  transport,
  isCurrent = () => true,
  now = () => performance.now(),
  wallNow = () => Date.now(),
  maxConcurrent = 2,
  maxQueued = 100,
  maxCachePages = 80,
  maxResources = 100,
  maxRealtimeQueries = 2,
  staleMs = 30000,
  maxAttempts = 3,
  retryBaseMs = 150,
  random = Math.random,
  onMetric = () => {},
  delay = abortableDelay
} = {}) {
  if (!scope || !['principalId', 'tenantId', 'permissionRevision'].every(key => typeof scope[key] === 'string' && scope[key])) throw new TypeError('A verified principal, tenant and permission revision are required.');
  if (!transport || typeof transport.readPage !== 'function') throw new TypeError('A page transport is required.');
  if (![maxConcurrent, maxQueued, maxCachePages, maxResources, maxAttempts, maxRealtimeQueries].every(value => Number.isSafeInteger(value) && value > 0) || maxAttempts > 5 || !Number.isFinite(staleMs) || staleMs < 0) throw new RangeError('Invalid engine bounds.');
  const identity = Object.freeze({
      principalId: scope.principalId,
      tenantId: scope.tenantId,
      permissionRevision: scope.permissionRevision
    }),
    cache = new Map(),
    jobs = new Map(),
    resources = new Map(),
    mutations = new Map(),
    watches = new Map();
  let activeWatches = 0,
    closed = false,
    accessDenied = false;
  const valid = () => !closed && !accessDenied && isCurrent(identity);
  const assertCurrent = () => {
    if (accessDenied) throw failure('permission-denied', 'The authorization scope must be verified again.');
    if (!valid()) throw abortError();
  };
  const metric = event => {
    try {
      onMetric(Object.freeze(event));
    } catch {/* Diagnostics cannot change data publication. */}
  };
  const admission=createRequestAdmission({maxConcurrent,maxQueued,now,assertCurrent});
  const resourceCeilings=Object.freeze({maxConcurrent,maxCachePages});
  const runBounded=admission.run;
  const getCache = key => {
    const value = cache.get(key);
    if (value) {
      cache.delete(key);
      cache.set(key, value);
    }
    return value;
  };
  const putCache = (key, value) => {
    cache.delete(key);
    cache.set(key, value);
    while (cache.size > maxCachePages) cache.delete(cache.keys().next().value);
  };
  const normalizePage = (response, query, cursor) => {
    if (!response || !Array.isArray(response.items) || response.items.length > query.pageSize || typeof response.hasMore !== 'boolean' || response.coverage !== 'all-query-matches' || response.source !== 'server' || response.hasMore && (!response.items.length || typeof response.nextCursor !== 'string' || !response.nextCursor || response.nextCursor === cursor)) throw failure('invalid-page', 'Incomplete or invalid server page.');
    const seen = new Set();
    for (const item of response.items) {
      if (!item || typeof item.id !== 'string' || !item.id || seen.has(item.id) || item.companyId !== identity.tenantId) throw failure('invalid-page', 'Invalid tenant or record identity.');
      seen.add(item.id);
    }
    return Object.freeze({
      items: Object.freeze(response.items.map(item => immutableReadValue(item))),
      hasMore: response.hasMore,
      nextCursor: response.hasMore ? response.nextCursor : null,
      cursor,
      updatedAt: wallNow(),
      readCount: response.readCount ?? null
    });
  };
  const stopWatch = entry => {
    if (entry.closed) return;
    entry.closed = true;
    entry.generation++;
    if (watches.get(entry.key) === entry) watches.delete(entry.key);
    if (entry.active) {
      entry.active = false;
      activeWatches--;
    }
    entry.controller.abort();
    try {
      entry.off?.();
    } catch (error) {
      metric({
        kind: 'transport-cleanup-error',
        collection: entry.query.collection,
        code: error.code || error.name || 'UNKNOWN'
      });
    }
  };
  const closeWatches = error => {
    for (const entry of [...watches.values()]) {
      stopWatch(entry);
      notifyWatch(entry, error ? 'onError' : 'onStatus', error || 'closed');
      for (const consumer of [...entry.consumers]) consumer.release();
    }
  };
  const revoke = error => {
    accessDenied = true;
    cache.clear();
    closeWatches(error);
    for (const job of jobs.values()) {
      job.controller.abort();
      settle(job, error);
    }
    jobs.clear();
    admission.cancelQueued(error);
    for (const resource of resources.values()) resource.hideDenied();
  };
  const attemptRead = async job => {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await runBounded(async queueMs => {
          if (job.controller.signal.aborted) throw abortError();
          const start = now();
          try {
            const response = await transport.readPage({
              scope: identity,
              query: job.query,
              cursor: job.cursor,
              signal: job.controller.signal
            });
            metric({
              kind: 'transport-read',
              collection: job.query.collection,
              attempt,
              queueMs,
              elapsedMs: now() - start,
              readCount: response?.readCount ?? null,
              source: response?.source || 'UNSPECIFIED'
            });
            assertCurrent();
            if (job.controller.signal.aborted) throw abortError();
            return normalizePage(response, job.query, job.cursor);
          } catch (error) {
            metric({
              kind: 'transport-error',
              collection: job.query.collection,
              attempt,
              queueMs,
              elapsedMs: now() - start,
              code: error.code || error.name || 'UNKNOWN'
            });
            throw error;
          }
        }, job.controller.signal);
      } catch (error) {
        if (denied(error)) {
          revoke(error);
          throw error;
        }
        if (job.controller.signal.aborted || !valid()) throw abortError();
        if (!transient(error) || attempt === maxAttempts) throw error;
        const wait = Math.min(3000, retryBaseMs * 2 ** (attempt - 1)) * (0.5 + random());
        metric({
          kind: 'read-backoff',
          collection: job.query.collection,
          attempt,
          delayMs: wait
        });
        await delay(wait, job.controller.signal);
      }
    }
  };
  const join = (job, signal) => new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }
    const waiter = {
      resolve,
      reject,
      signal,
      cancel: null
    };
    waiter.cancel = () => {
      if (!job.waiters.delete(waiter)) return;
      signal?.removeEventListener('abort', waiter.cancel);
      reject(abortError());
      if (!job.waiters.size) {
        job.controller.abort();
        if (jobs.get(job.key) === job) jobs.delete(job.key);
      }
    };
    job.waiters.add(waiter);
    signal?.addEventListener('abort', waiter.cancel, {
      once: true
    });
  });
  const settle = (job, error, page) => {
    if (jobs.get(job.key) === job) jobs.delete(job.key);
    if (!error && valid() && !job.controller.signal.aborted && job.waiters.size) {
      putCache(job.key, page);
      const key = canonicalQueryValue(job.query);
      for (const resource of resources.values()) if (resource.queryKey === key && valid()) resource.acceptPage(page);
    }
    for (const waiter of job.waiters) {
      waiter.signal?.removeEventListener('abort', waiter.cancel);
      if (error) waiter.reject(error);else waiter.resolve(page);
    }
    job.waiters.clear();
  };
  const read = (query, cursor, signal) => {
    assertCurrent();
    if (signal?.aborted) return Promise.reject(abortError());
    const key = canonicalQueryValue([query, cursor]);
    let job = jobs.get(key);
    if (!job) {
      job = {
        key,
        query,
        cursor,
        controller: new AbortController(),
        waiters: new Set()
      };
      jobs.set(key, job);
      // Join before starting even a synchronous adapter, so cancellation owns it.
      const promise = join(job, signal);
      void attemptRead(job).then(page => settle(job, null, page), error => settle(job, error));
      return promise;
    }
    metric({
      kind: 'read-deduplicated',
      collection: query.collection
    });
    return join(job, signal);
  };
  const makeQuery = spec => {
    if (!spec || typeof spec.collection !== 'string' || !/^[A-Za-z][A-Za-z0-9_]*$/.test(spec.collection)) throw new TypeError('Invalid collection query.');
    const encoded = canonicalQueryValue({
      ...spec,
      pageSize: normalizeDataPageSize(spec.pageSize ?? 20)
    });
    if (encoded.length > 16384) throw new RangeError('Query descriptor exceeds the supported size.');
    const normalized = JSON.parse(encoded);
    if (Object.hasOwn(normalized, '_authorization')) throw new TypeError('Authorization bindings are owned by the transport.');
    if (transport.getAuthorizationKey) normalized._authorization = transport.getAuthorizationKey({
      scope: identity,
      query: normalized
    });
    freezeDescriptor(normalized);
    if (normalized.search?.text && transport.capabilities?.globalSearch !== true) throw failure('search-not-configured', 'Global search requires a server search adapter; a loaded-page filter is not a substitute.');
    return Object.freeze(normalized);
  };
  const notifyWatch = (entry, method, value) => {
    if (method === 'onStatus') entry.status = value;
    for (const consumer of entry.consumers) {
      try {
        consumer[method]?.(value);
      } catch (error) {
        metric({
          kind: 'consumer-error',
          collection: entry.query.collection,
          code: error.code || error.name || 'UNKNOWN'
        });
      }
    }
  };
  const drainWatches = () => {
    if (!valid()) return;
    for (const entry of [...watches.values()]) {
      if (activeWatches >= maxRealtimeQueries) break;
      if (entry.active || entry.closed || !entry.consumers.size) continue;
      entry.active = true;
      activeWatches++;
      const generation = ++entry.generation;
      notifyWatch(entry, 'onStatus', 'connecting');
      const failWatch = error => {
        if (entry.closed || entry.generation !== generation) return;
        stopWatch(entry);
        if (denied(error)) revoke(error);
        notifyWatch(entry, 'onError', error);
        for (const consumer of [...entry.consumers]) consumer.release();
        drainWatches();
      };
      try {
        const off = transport.subscribePage({
          scope: identity,
          query: entry.query,
          cursor: entry.cursor,
          signal: entry.controller.signal,
          onError: failWatch,
          onData: response => {
            if (entry.closed || entry.generation !== generation || !valid()) return;
            try {
              const page = normalizePage(response, entry.query, entry.cursor);
              // A getDocs request begun before this newer live publication must
              // not restore an older snapshot when its physical RPC returns.
              const oldRead = jobs.get(entry.key);
              if (oldRead) {
                oldRead.controller.abort();
                settle(oldRead, abortError());
              }
              putCache(entry.key, page);
              entry.latest = page;
              for (const resource of resources.values()) if (resource.queryKey === entry.queryKey) resource.acceptPage(page, 'server-realtime');
              metric({
                kind: 'realtime-publication',
                collection: entry.query.collection,
                rows: page.items.length
              });
              notifyWatch(entry, 'onStatus', 'live');
              notifyWatch(entry, 'onData', page);
            } catch (error) {
              failWatch(error);
            }
          }
        });
        entry.off = off;
        if (entry.closed) off?.();
      } catch (error) {
        failWatch(error);
      }
    }
  };
  const close = () => {
    if (closed) return;
    closed = true;
    cache.clear();
    mutations.clear();
    closeWatches();
    for (const job of jobs.values()) {
      job.controller.abort();
      settle(job, abortError());
    }
    jobs.clear();
    admission.close();
    for (const resource of resources.values()) resource.hideClosed();
    resources.clear();
  };
  return {
    scope: identity,
    observePage(spec, {
      cursor = null,
      signal,
      onData,
      onError,
      onStatus
    } = {}) {
      assertCurrent();
      if (signal?.aborted) throw abortError();
      if (typeof transport.subscribePage !== 'function') throw failure('realtime-not-configured', 'A bounded realtime adapter is required.');
      if (cursor !== null && (typeof cursor !== 'string' || !cursor || cursor.length > 65536)) throw new TypeError('An opaque keyset cursor is required.');
      const query = makeQuery(spec),
        queryKey = canonicalQueryValue(query),
        key = canonicalQueryValue([query, cursor]);
      let entry = watches.get(key);
      if (!entry) {
        if (watches.size >= maxQueued + maxRealtimeQueries) throw failure('realtime-capacity', 'Realtime subscription queue is full.');
        entry = {
          key,
          queryKey,
          query,
          cursor,
          consumers: new Set(),
          active: false,
          closed: false,
          status: 'queued',
          latest: null,
          generation: 0,
          controller: new AbortController(),
          off: null
        };
        watches.set(key, entry);
      }
      const consumer = {
        onData,
        onError,
        onStatus
      };
      entry.consumers.add(consumer);
      const off = () => {
        signal?.removeEventListener('abort', off);
        entry.consumers.delete(consumer);
        if (!entry.consumers.size) {
          stopWatch(entry);
          drainWatches();
        }
      };
      consumer.release = off;
      signal?.addEventListener('abort', off, {
        once: true
      });
      try {
        onStatus?.(entry.status);
        if (entry.latest) onData?.(entry.latest);
        drainWatches();
      } catch (error) {
        off();
        throw error;
      }
      return off;
    },
    openQuery(spec, {
      viewKey = 'default'
    } = {}) {
      assertCurrent();
      const query = makeQuery(spec),
        queryKey = canonicalQueryValue(query);
      if (typeof viewKey !== 'string' || !viewKey || viewKey.length > 256) throw new TypeError('A stable view key is required.');
      const resourceKey = canonicalQueryValue([queryKey, viewKey]);
      if (resources.has(resourceKey)) return resources.get(resourceKey).api;
      if (resources.size >= maxResources) {
        const unused = [...resources].find(([, entry]) => !entry.listeners.size && !entry.loading());
        if (!unused) throw failure('resource-limit', 'Close unused query resources before opening more.');
        unused[1].api.dispose();
      }
      let state = Object.freeze({
          ...closedSnapshot,
          status: 'idle'
        }),
        generation = 0,
        pending = 0,
        disposed = false,
        currentPage = null;
      let requestedCursor = null;
      const ownedReads = new Set();
      const listeners = new Set();
      const queryAllowed = () => {
        try {
          return valid() && (!transport.getAuthorizationKey || transport.getAuthorizationKey({
            scope: identity,
            query
          }) === query._authorization);
        } catch {
          return false;
        }
      };
      const emit = next => {
        if (Object.keys(next).every(key => Object.is(next[key], state[key]))) return;
        state = Object.freeze(next);
        for (const listener of listeners) listener();
      };
      const publish = (page, source, pendingRead) => {
        if (currentPage === page && state.status === (pendingRead ? 'refreshing' : 'ready') && state.dataSource === source) return;
        currentPage = page;
        emit({
          ...page,
          status: pendingRead ? 'refreshing' : 'ready',
          dataSource: source,
          error: null
        });
      };
      const load = async ({
        cursor = null,
        signal,
        force = false
      } = {}) => {
        assertCurrent();
        if (disposed || signal?.aborted) throw abortError();
        if (!queryAllowed()) throw failure('permission-denied', 'The read policy changed.');
        if (cursor !== null && (typeof cursor !== 'string' || !cursor || cursor.length > 65536)) throw new TypeError('An opaque keyset cursor is required.');
        if (force || cursor !== requestedCursor) {
          generation++;
          for (const controller of ownedReads) controller.abort();
          requestedCursor = cursor;
        }
        if (force) {
          for (const job of jobs.values()) if (canonicalQueryValue(job.query) === queryKey) {
            job.controller.abort();
            settle(job, abortError());
          }
          for (const key of cache.keys()) if (key.startsWith('[' + queryKey + ',')) cache.delete(key);
        }
        const revision = generation,
          key = canonicalQueryValue([query, cursor]),
          cached = getCache(key);
        if (cached) {
          const fresh = wallNow() >= cached.updatedAt && wallNow() - cached.updatedAt < staleMs;
          publish(cached, 'cache', !fresh || force);
          metric({
            kind: 'cache-display',
            collection: query.collection,
            fresh
          });
          assertCurrent();
          if (fresh && !force) return state;
        } else emit({
          ...state,
          status: state.items.length ? 'refreshing' : 'loading',
          error: null,
          dataSource: state.items.length ? state.dataSource : null
        });
        pending++;
        const controller = new AbortController(),
          cancel = () => controller.abort();
        ownedReads.add(controller);
        signal?.addEventListener('abort', cancel, {
          once: true
        });
        if (signal?.aborted) cancel();
        try {
          const page = await read(query, cursor, controller.signal);
          assertCurrent();
          if (disposed || revision !== generation || controller.signal.aborted) throw abortError();
          if (!queryAllowed()) throw failure('permission-denied', 'The read policy changed.');
          publish(page, 'server', false);
          assertCurrent();
          return state;
        } catch (error) {
          if (!disposed && valid() && revision === generation && error.name !== 'AbortError') emit({
            ...state,
            status: 'error',
            error: {
              code: error.code || 'read-failed',
              message: 'Không tải được dữ liệu. Vui lòng thử lại.'
            }
          });
          throw error;
        } finally {
          pending--;
          ownedReads.delete(controller);
          signal?.removeEventListener('abort', cancel);
          if (!pending && !disposed && valid() && revision === generation && ['loading', 'refreshing'].includes(state.status)) emit({
            ...state,
            status: state.items.length ? 'ready' : 'idle'
          });
        }
      };
      const api = {
        getSnapshot: () => valid() && !disposed ? queryAllowed() ? state : deniedSnapshot : accessDenied ? deniedSnapshot : closedSnapshot,
        subscribe(listener) {
          if (disposed || closed) return () => {};
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
        load,
        refresh: options => load({
          ...options,
          cursor: state.cursor,
          force: true
        }),
        next: options => state.hasMore ? load({
          ...options,
          cursor: state.nextCursor
        }) : Promise.resolve(state),
        dispose() {
          if (disposed) return;
          disposed = true;
          generation++;
          for (const controller of ownedReads) controller.abort();
          ownedReads.clear();
          listeners.clear();
          state = closedSnapshot;
          currentPage = null;
          if (resources.get(resourceKey)?.api === api) resources.delete(resourceKey);
        }
      };
      resources.set(resourceKey, {
        api,
        listeners,
        queryKey,
        loading: () => pending > 0,
        acceptPage: (page, source = 'server') => {
          if (!disposed && queryAllowed() && requestedCursor === page.cursor) publish(page, source, false);
        },
        hideDenied: () => {
          generation++;
          currentPage = null;
          emit({
            ...deniedSnapshot
          });
        },
        hideClosed: () => {
          generation++;
          currentPage = null;
          emit(closedSnapshot);
        },
        invalidate: () => {
          if (disposed) return;
          emit({
            ...state,
            isStale: true
          });
          if (listeners.size) void load({
            cursor: requestedCursor
          }).catch(error => {
            if (error.name !== 'AbortError') metric({
              kind: 'post-write-refresh-error',
              collection: query.collection,
              code: error.code || error.name
            });
          });
        }
      });
      const cached = getCache(canonicalQueryValue([query, null]));
      if (cached) publish(cached, 'cache', wallNow() < cached.updatedAt || wallNow() - cached.updatedAt >= staleMs);
      return api;
    },
    // Writes remain server-authoritative. No local financial balances are guessed.
    mutate(command) {
      assertCurrent();
      if (typeof transport.write !== 'function' || transport.capabilities?.idempotentWrites !== true) return Promise.reject(failure('write-not-configured', 'An idempotent server write adapter is required.'));
      if (!command || typeof command.operationId !== 'string' || !/^[A-Za-z0-9_.:-]{1,128}$/.test(command.operationId) || !(command.expectedVersion === null || Number.isSafeInteger(command.expectedVersion) && command.expectedVersion >= 0 || typeof command.expectedVersion === 'string' && command.expectedVersion.length > 0 && command.expectedVersion.length <= 256)) return Promise.reject(failure('invalid-write', 'Operation ID and expected version are required.'));
      const fingerprint = canonicalQueryValue(command),
        existing = mutations.get(command.operationId);
      if (existing) {
        if (existing.fingerprint !== fingerprint) return Promise.reject(failure('operation-id-conflict', 'Operation ID was already used for another command.'));
        if (existing.status !== 'failed') return existing.promise;
      }
      if (mutations.size >= 1000 && !existing) {
        const settled = [...mutations].find(([, entry]) => entry.status === 'confirmed');
        if (!settled) return Promise.reject(failure('write-limit', 'Too many unresolved operation IDs.'));
        mutations.delete(settled[0]);
      }
      const immutableCommand = freezeDescriptor(JSON.parse(fingerprint)),
        entry = {
          fingerprint,
          promise: null,
          status: 'pending'
        };
      const promise = runBounded(() => {
        assertCurrent();
        return transport.write({
          scope: identity,
          command: immutableCommand
        });
      }, new AbortController().signal).then(receipt => {
        assertCurrent();
        if (!receipt || receipt.confirmed !== true || receipt.operationId !== immutableCommand.operationId) throw failure('unconfirmed-write', 'No matching server acknowledgement.');
        // Retire old reads/listens before refreshing. A delayed pre-ACK response
        // cannot restore old data over this operation or another writer's change.
        for (const job of [...jobs.values()]) {
          job.controller.abort();
          settle(job, abortError());
        }
        cache.clear();
        for (const watch of [...watches.values()]) {
          stopWatch(watch);
          watch.closed = false;
          watch.latest = null;
          watch.status = 'queued';
          watch.off = null;
          watch.controller = new AbortController();
          watches.set(watch.key, watch);
        }
        for (const resource of resources.values()) resource.invalidate();
        drainWatches();
        entry.status = 'confirmed';
        return receipt;
      });
      entry.promise = promise;
      mutations.set(command.operationId, entry);
      promise.catch(() => {
        entry.status = 'failed';
      });
      return promise;
    },
    setResourceBudget({readConcurrency,cachePages}){
      assertCurrent();
      if(!Number.isSafeInteger(readConcurrency)||readConcurrency<1||readConcurrency>resourceCeilings.maxConcurrent
        ||!Number.isSafeInteger(cachePages)||cachePages<1||cachePages>resourceCeilings.maxCachePages)throw new RangeError('Resource budget exceeds engine configuration.');
      admission.setConcurrency(readConcurrency);maxCachePages=cachePages;
      // Only completed readonly cache pages are evicted. Active resource
      // snapshots, in-flight ACKs, drafts and unresolved writes remain owned.
      while(cache.size>maxCachePages)cache.delete(cache.keys().next().value);
    },
    getDiagnostics: () => Object.freeze({
      closed,
      activeRequests: admission.getDiagnostics().activeRequests,
      queuedRequests: admission.getDiagnostics().queuedRequests,
      sharedReads: jobs.size,
      cachedPages: cache.size,
      resources: resources.size,
      activeRealtimeQueries: activeWatches,
      queuedRealtimeQueries: watches.size - activeWatches
    }),
    close
  };
}
