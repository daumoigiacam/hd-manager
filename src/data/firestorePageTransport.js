import { collection, documentId, getDocsFromServer, onSnapshot, limit, orderBy, query, startAfter, where } from 'firebase/firestore';
import { canonicalQueryValue, normalizeDataPageSize } from './instantDataEngine.js';
const deny = () => Object.assign(new Error('Query is outside the verified read policy.'), {
  code: 'permission-denied'
});
const invalid = () => Object.assign(new Error('Invalid or expired page cursor.'), {
  code: 'invalid-cursor'
});
const abort = () => Object.assign(new Error('Firestore page publication cancelled.'), {
  name: 'AbortError',
  code: 'cancelled'
});
const segment = value => typeof value === 'string' && value.length > 0 && !value.includes('/') && !['.', '..'].includes(value);
const supported = new Set(['==', 'in', 'array-contains']);
const policyKey = policy => canonicalQueryValue({
  principalId: policy.principalId,
  tenantId: policy.tenantId,
  permissionRevision: policy.permissionRevision,
  filters: policy.filters || [],
  allowedFilterFields: policy.allowedFilterFields || []
});

// SDK cancellation suppresses publication; the physical RPC retains its engine
// concurrency slot until it settles. No partial page becomes an aggregate.
export function createFirestorePageTransport({
  db,
  appId,
  authorize,
  read = getDocsFromServer,
  watch = onSnapshot
} = {}) {
  if (!db || !segment(appId) || typeof authorize !== 'function') throw new TypeError('Firestore, app and verified query authorization are required.');

  // This client policy narrows UI/cache visibility; Firestore Rules and trusted
  // server authorization remain the security boundary.
  const prepare = ({
    scope,
    query: spec,
    cursor = null
  }) => {
    const policy = authorize({
      scope,
      query: spec
    });
    if (!policy || policy.allowed !== true || !['principalId', 'tenantId', 'permissionRevision'].every(key => policy[key] === scope[key]) || !segment(spec.collection) || !segment(scope.tenantId)) throw deny();
    if (spec.search?.text) throw Object.assign(new Error('Full-dataset search needs a search service; filtering a page is not supported.'), {
      code: 'search-not-configured'
    });
    if (spec.sort && spec.sort !== '__name__') throw Object.assign(new Error('This migration adapter supports stable document-ID ordering only.'), {
      code: 'query-not-supported'
    });
    const authorizedPolicy = policyKey(policy);
    if (spec._authorization !== undefined && spec._authorization !== authorizedPolicy) throw deny();
    const size = normalizeDataPageSize(spec.pageSize ?? 20),
      constraints = [where('companyId', '==', scope.tenantId)];
    for (const filter of [...(policy.filters || []), ...(spec.filters || [])]) {
      if (!filter || typeof filter.field !== 'string' || !Array.isArray(policy.allowedFilterFields) || !policy.allowedFilterFields.includes(filter.field) || filter.field === 'companyId') throw deny();
      if (!supported.has(filter.op)) throw Object.assign(new Error('Range queries require a typed sort/cursor adapter.'), {
        code: 'query-not-supported'
      });
      if (filter.op === 'in' && (!Array.isArray(filter.value) || filter.value.length < 1 || filter.value.length > 10)) throw Object.assign(new Error('Larger disjunctions require a server search adapter.'), {
        code: 'query-not-supported'
      });
      constraints.push(where(filter.field, filter.op, filter.value));
    }
    const binding = canonicalQueryValue([scope.principalId, scope.tenantId, scope.permissionRevision, spec]);
    constraints.push(orderBy(documentId(), 'asc'));
    if (cursor !== null) {
      let parsed;
      try {
        parsed = JSON.parse(cursor);
      } catch {
        throw invalid();
      }
      if (!parsed || parsed.version !== 1 || parsed.binding !== binding || !segment(parsed.lastId) || Object.keys(parsed).some(key => !['version', 'binding', 'lastId'].includes(key))) throw invalid();
      constraints.push(startAfter(parsed.lastId));
    }
    constraints.push(limit(size));
    return {
      scope,
      spec,
      cursor,
      size,
      binding,
      authorizedPolicy,
      request: query(collection(db, 'artifacts', appId, 'public', 'data', spec.collection), ...constraints)
    };
  };
  const decode = (snapshot, {
    scope,
    spec,
    size,
    binding,
    authorizedPolicy
  }, signal) => {
    const current = authorize({
      scope,
      query: spec
    });
    if (signal?.aborted) throw abort();
    if (!current || current.allowed !== true || !['principalId', 'tenantId', 'permissionRevision'].every(key => current[key] === scope[key]) || policyKey(current) !== authorizedPolicy) throw deny();
    const items = snapshot.docs.map(document => ({
      ...document.data(),
      id: document.id
    }));
    if (items.some(item => item.companyId !== scope.tenantId)) throw deny();
    const last = snapshot.docs.at(-1),
      hasMore = snapshot.size === size && Boolean(last);
    return {
      items,
      hasMore,
      nextCursor: hasMore ? JSON.stringify({
        version: 1,
        binding,
        lastId: last.id
      }) : null,
      readCount: snapshot.size,
      source: 'server',
      coverage: 'all-query-matches',
      consistency: 'live-keyset'
    };
  };
  return Object.freeze({
    capabilities: Object.freeze({
      globalSearch: false,
      idempotentWrites: false,
      realtime: true,
      cancellation: 'discard-publication-only',
      consistency: 'live-keyset'
    }),
    getAuthorizationKey({
      scope,
      query: spec
    }) {
      const policy = authorize({
        scope,
        query: spec
      });
      if (!policy || policy.allowed !== true || !['principalId', 'tenantId', 'permissionRevision'].every(key => policy[key] === scope[key])) throw deny();
      return policyKey(policy);
    },
    async readPage(input) {
      if (input.signal?.aborted) throw abort();
      const prepared = prepare(input),
        snapshot = await read(prepared.request);
      return decode(snapshot, prepared, input.signal);
    },
    subscribePage(input) {
      if (input.signal?.aborted) throw abort();
      const prepared = prepare(input);
      let closed = false,
        off;
      const stop = () => {
        if (closed) return;
        closed = true;
        input.signal?.removeEventListener('abort', stop);
        off?.();
      };
      const fail = error => {
        if (closed) return;
        stop();
        input.onError?.(error);
      };
      input.signal?.addEventListener('abort', stop, {
        once: true
      });
      try {
        off = watch(prepared.request, {
          includeMetadataChanges: true
        }, snapshot => {
          if (closed || snapshot.metadata?.fromCache || snapshot.metadata?.hasPendingWrites) return;
          try {
            input.onData?.(decode(snapshot, prepared, input.signal));
          } catch (error) {
            fail(error);
          }
        }, fail);
        if (closed) off?.();
      } catch (error) {
        stop();
        throw error;
      }
      return stop;
    }
  });
}
