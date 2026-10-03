import test from 'node:test';
import assert from 'node:assert/strict';
import { collectTenantRestQuery, normalizeRestPageSize } from '../src/services/firestoreRestPagination.js';

const parent = 'projects/unit-only/databases/(default)/documents/artifacts/test-app/public/data';
const companyId = 'tenant-a';
const readTime = '2026-10-03T01:02:03.123456Z';
const laterTime = '2026-10-03T01:02:04.123456Z';
const context = { parent, companyId, accountType: 'employee', sessionId: 'employee-a' };
const queryBody = {
  structuredQuery: {
    from: [{ collectionId: 'orders', allDescendants: false }],
    where: { fieldFilter: { field: { fieldPath: 'companyId' }, op: 'EQUAL', value: { stringValue: companyId } } },
  },
};
const fixture = size => Array.from({ length: size }, (_, index) => ({
  name: `${parent}/orders/order-${String(index).padStart(4, '0')}`,
  fields: {
    companyId: { stringValue: companyId },
    amount: { integerValue: String(index * 17) },
    archived: { booleanValue: index % 7 === 0 },
    createdAt: { timestampValue: '2020-01-01T00:00:00Z' },
  },
}));
const decodeFields = fields => Object.fromEntries(Object.entries(fields).map(([key, value]) => [
  key,
  'integerValue' in value ? Number(value.integerValue) : Object.values(value)[0],
]));
const options = overrides => ({ queryBody, context, decodeFields, ...overrides });
const rows = (documents, time = readTime) => documents.length
  ? documents.map(document => ({ document, readTime: time }))
  : [{ readTime: time }];
const fixtureTransport = documents => {
  const calls = [];
  return {
    calls,
    async runQuery(body, scope) {
      calls.push({ body: structuredClone(body), scope });
      const cursor = body.structuredQuery.startAt?.values[0].referenceValue;
      const start = cursor ? documents.findIndex(document => document.name === cursor) + 1 : 0;
      return rows(documents.slice(start, start + body.structuredQuery.limit));
    },
  };
};
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

for (const size of [0, 49, 50, 51, 100]) {
  test(`complete fixture equality and exclusive bounded cursors for ${size} records`, async () => {
    const documents = fixture(size);
    const transport = fixtureTransport(documents);
    const result = await collectTenantRestQuery(options(transport));
    assert.deepEqual(result.items, documents.map(document => ({
      id: document.name.split('/').at(-1), data: decodeFields(document.fields),
    })));
    assert.equal(result.exhausted, true);
    assert.equal(result.documentsRead, size);
    assert.equal(result.pageSize, 50);
    assert.equal(result.pageCount, Math.floor(size / 50) + 1);
    assert.equal(result.requests, result.pageCount);
    assert.equal(result.readTime, readTime);
    assert.equal(new Set(result.items.map(item => item.id)).size, size);
    for (const [index, call] of transport.calls.entries()) {
      assert.deepEqual(call.body.structuredQuery.from, queryBody.structuredQuery.from);
      assert.deepEqual(call.body.structuredQuery.where, queryBody.structuredQuery.where);
      assert.deepEqual(call.body.structuredQuery.orderBy, [{ field: { fieldPath: '__name__' }, direction: 'ASCENDING' }]);
      assert.equal(call.body.structuredQuery.limit, 50);
      assert.deepEqual(call.scope, { ...context, signal: undefined });
      if (index === 0) {
        assert.equal(call.body.readTime, undefined);
        assert.equal(call.body.structuredQuery.startAt, undefined);
      } else {
        assert.equal(call.body.readTime, readTime);
        assert.deepEqual(call.body.structuredQuery.startAt, {
          values: [{ referenceValue: documents[index * 50 - 1].name }], before: false,
        });
      }
    }
    assert.equal(result.items.reduce((sum, item) => sum + item.data.amount, 0),
      documents.reduce((sum, document) => sum + decodeFields(document.fields).amount, 0));
  });
}

test('page sizes default to 50, cap at 200, and do not truncate complete scans', async () => {
  for (const value of [undefined, 0, -1, 1.5, NaN, Infinity, 'bad']) assert.equal(normalizeRestPageSize(value), 50);
  assert.equal(normalizeRestPageSize('25'), 25);
  assert.equal(normalizeRestPageSize(5000), 200);
  const transport = fixtureTransport(fixture(201));
  const result = await collectTenantRestQuery(options({ ...transport, pageSize: 5000 }));
  assert.equal(result.items.length, 201);
  assert.deepEqual(transport.calls.map(call => call.body.structuredQuery.limit), [200, 200]);
});

test('no result is published before full enumeration and a middle error discards the scan', async () => {
  const gate = deferred();
  const failure = Object.assign(new Error('permission denied'), { code: 'PERMISSION_DENIED' });
  const publications = [];
  let requests = 0;
  const scan = collectTenantRestQuery(options({ runQuery: async () => {
    requests += 1;
    return requests === 1 ? rows(fixture(50)) : gate.promise;
  } })).then(result => publications.push(result));
  const rejected = assert.rejects(scan, error => error === failure);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(requests, 2);
  assert.deepEqual(publications, []);
  gate.reject(failure);
  await rejected;
  assert.deepEqual(publications, []);
});

test('missing readTime cannot start or complete a continued scan', async () => {
  let requests = 0;
  await assert.rejects(collectTenantRestQuery(options({ runQuery: async () => {
    requests += 1;
    return fixture(50).map(document => ({ document }));
  } })), /Missing readTime/);
  assert.equal(requests, 1);
  for (const terminal of [[{ document: fixture(51)[50] }], [{ done: true }]]) {
    let page = 0;
    await assert.rejects(collectTenantRestQuery(options({ runQuery: async () => (
      page++ === 0 ? rows(fixture(50)) : terminal
    ) })), /Missing readTime/);
  }
});

test('a complete single page can resolve without continuation readTime', async () => {
  const result = await collectTenantRestQuery(options({ runQuery: async () => [{ document: fixture(1)[0] }] }));
  assert.equal(result.items.length, 1);
  assert.equal(result.readTime, null);
  assert.equal(result.requests, 1);
});

test('continued requests never switch snapshot time, including the terminal empty query', async () => {
  let page = 0;
  await assert.rejects(collectTenantRestQuery(options({ runQuery: async body => {
    if (page++ === 0) return rows(fixture(50));
    assert.equal(body.readTime, readTime);
    return [{ readTime: laterTime }];
  } })), /Inconsistent readTime/);
});

test('transport body mutation cannot suppress fixed-time validation', async () => {
  let requests = 0;
  await assert.rejects(collectTenantRestQuery(options({ runQuery: async body => {
    if (++requests === 1) return rows(fixture(50));
    assert.equal(body.readTime, readTime);
    delete body.readTime;
    return [{ readTime: laterTime }];
  } })), /Inconsistent readTime/);
  assert.equal(requests, 2);
});

test('equivalent zero-padded timestamp precision retains the original request readTime', async () => {
  const transport = fixtureTransport(fixture(51));
  const result = await collectTenantRestQuery(options({ runQuery: async (body, scope) => {
    const response = await transport.runQuery(body, scope);
    return body.readTime ? response.map(row => ({ ...row, readTime: '2026-10-03T01:02:03.123456000Z' })) : response;
  } }));
  assert.equal(result.readTime, readTime);
  assert.equal(result.items.length, 51);
});

test('advancing first-response timestamps replay page one at the first pinned readTime', async () => {
  const original = fixture(51);
  const snapshot = fixture(49);
  const calls = [];
  const result = await collectTenantRestQuery(options({ runQuery: async body => {
    calls.push(structuredClone(body));
    if (calls.length === 1) return [
      ...rows(original.slice(0, 49)), { document: original[49], readTime: laterTime },
    ];
    assert.equal(body.readTime, readTime);
    assert.equal(body.structuredQuery.startAt, undefined);
    return rows(snapshot);
  } }));
  assert.deepEqual(result.items, snapshot.map(document => ({ id: document.name.split('/').at(-1), data: decodeFields(document.fields) })));
  assert.equal(result.requests, 2);
  assert.equal(result.pageCount, 1);
  assert.equal(result.documentsRead, 99);
});

test('metadata readTime without document timestamps triggers a fixed-time replay', async () => {
  let requests = 0;
  const result = await collectTenantRestQuery(options({ runQuery: async body => {
    requests += 1;
    if (requests === 1) return [{ document: fixture(1)[0] }, { readTime }];
    assert.equal(body.readTime, readTime);
    return rows(fixture(1));
  } }));
  assert.equal(result.requests, 2);
  assert.equal(result.items.length, 1);
});

for (const size of [0, 49, 50, 51, 100]) {
  test(`nanosecond bootstrap is discarded before complete pinned fixture equality for ${size} records`, async () => {
    const snapshot = fixture(size);
    const original = fixture(Math.max(1, Math.min(size, 50))).map(document => ({
      ...document, fields: { ...document.fields, amount: { integerValue: '987654' } },
    }));
    const transport = fixtureTransport(snapshot);
    let requests = 0;
    let decoded = 0;
    const result = await collectTenantRestQuery(options({
      runQuery: async (body, scope) => {
        if (requests++ === 0) {
          assert.equal(body.readTime, undefined);
          return rows(original, '2026-10-03T01:02:03.123456789Z');
        }
        assert.equal(body.readTime, readTime);
        if (requests === 2) assert.equal(body.structuredQuery.startAt, undefined);
        return transport.runQuery(body, scope);
      },
      decodeFields: fields => { decoded += 1; return decodeFields(fields); },
    }));
    assert.deepEqual(result.items, snapshot.map(document => ({
      id: document.name.split('/').at(-1), data: decodeFields(document.fields),
    })));
    assert.equal(decoded, size, 'Discarded bootstrap records must not reach the caller decoder');
    assert.equal(result.readTime, readTime);
    assert.equal(result.requests, Math.floor(size / 50) + 2);
    assert.equal(result.pageCount, Math.floor(size / 50) + 1);
    assert.equal(result.documentsRead, size + original.length);
  });
}

test('an empty nanosecond bootstrap still replays page one at the truncated snapshot', async () => {
  let requests = 0;
  const result = await collectTenantRestQuery(options({ maxPages: 1, runQuery: async body => {
    requests += 1;
    if (requests === 1) return [{ readTime: '2026-10-03T01:02:03.000000001Z', done: false }];
    assert.equal(body.readTime, '2026-10-03T01:02:03.000000Z');
    assert.equal(body.structuredQuery.startAt, undefined);
    return rows(fixture(1), body.readTime);
  } }));
  assert.equal(result.items.length, 1);
  assert.equal(result.requests, 2);
  assert.equal(result.pageCount, 1);
});

test('zero nanodigits retain the original readTime without a bootstrap replay', async () => {
  const documents = fixture(51);
  const transport = fixtureTransport(documents);
  const padded = '2026-10-03T01:02:03.123456000Z';
  let requests = 0;
  const result = await collectTenantRestQuery(options({ runQuery: async (body, scope) => {
    const response = await transport.runQuery(body, scope);
    if (requests++ === 0) return response.map(row => ({ ...row, readTime: padded }));
    assert.equal(body.readTime, padded);
    return response;
  } }));
  assert.equal(result.readTime, padded);
  assert.equal(result.requests, 2);
  assert.equal(result.documentsRead, 51);
});

test('significant nanoseconds on a pinned replay reject even within the same microsecond', async () => {
  let requests = 0;
  let decoded = 0;
  await assert.rejects(collectTenantRestQuery(options({
    runQuery: async body => {
      requests += 1;
      if (requests > 1) {
        assert.equal(body.readTime, readTime);
        assert.equal(body.structuredQuery.startAt, undefined);
      }
      return rows(fixture(1), requests === 1
        ? '2026-10-03T01:02:03.123456789Z' : '2026-10-03T01:02:03.123456001Z');
    },
    decodeFields: fields => { decoded += 1; return decodeFields(fields); },
  })), /Inconsistent readTime/);
  assert.equal(requests, 2, 'Inconsistent pinned responses must not trigger repeated restarts');
  assert.equal(decoded, 0);
});

test('failure or cancellation during the nanosecond replay never decodes the original page', async () => {
  let requests = 0;
  let decoded = 0;
  await assert.rejects(collectTenantRestQuery(options({
    runQuery: async () => {
      if (requests++ === 0) return rows(fixture(1), '2026-10-03T01:02:03.123456789Z');
      throw new Error('Replay failed');
    },
    decodeFields: fields => { decoded += 1; return decodeFields(fields); },
  })), /Replay failed/);
  assert.equal(decoded, 0);

  const controller = new AbortController();
  const started = deferred();
  const pending = deferred();
  requests = 0;
  const scan = collectTenantRestQuery(options({
    signal: controller.signal,
    runQuery: async () => {
      if (requests++ === 0) return rows(fixture(1), '2026-10-03T01:02:03.123456789Z');
      started.resolve();
      return pending.promise;
    },
    decodeFields: fields => { decoded += 1; return decodeFields(fields); },
  }));
  await started.promise;
  controller.abort();
  await assert.rejects(scan, { name: 'AbortError' });
  pending.resolve(rows(fixture(1)));
  assert.equal(requests, 2);
  assert.equal(decoded, 0);
});

test('companies and customer_accounts cannot enter generic employee or backup scans', async () => {
  for (const collectionId of ['companies', 'customer_accounts']) {
    let called = false;
    const body = structuredClone(queryBody);
    body.structuredQuery.from[0].collectionId = collectionId;
    await assert.rejects(collectTenantRestQuery(options({
      queryBody: body, runQuery: async () => { called = true; return [{ readTime }]; },
    })), /exact tenant document read|excluded from employee scans/);
    assert.equal(called, false);
  }
});

test('explain metrics on document rows and terminal metadata preserve the complete fixture', async () => {
  const documents = fixture(51);
  const transport = fixtureTransport(documents);
  let requests = 0;
  const result = await collectTenantRestQuery(options({ runQuery: async (body, scope) => {
    const response = await transport.runQuery(body, scope);
    if (requests++ === 0) {
      Object.assign(response.at(-1), { explainMetrics: { planSummary: { indexesUsed: [] } }, done: true });
    } else {
      response.push({ explainMetrics: { executionStats: { resultsReturned: String(response.length) } }, done: false });
    }
    return response;
  } }));
  assert.deepEqual(result.items, documents.map(document => ({
    id: document.name.split('/').at(-1), data: decodeFields(document.fields),
  })));
  assert.equal(result.documentsRead, 51);
  assert.equal(result.requests, 2);
});

test('boolean done presence completes document and empty metadata responses for either value', async () => {
  for (const done of [true, false]) {
    const populated = await collectTenantRestQuery(options({
      runQuery: async () => [{ ...rows(fixture(1))[0], done, explainMetrics: {} }],
    }));
    assert.equal(populated.items.length, 1);
    const empty = await collectTenantRestQuery(options({
      runQuery: async () => [{ readTime, done, explainMetrics: {} }],
    }));
    assert.deepEqual(empty.items, []);
    let requests = 0;
    const boundary = await collectTenantRestQuery(options({ runQuery: async () => (
      requests++ === 0 ? rows(fixture(50)) : [{ readTime, done, explainMetrics: {} }]
    ) }));
    assert.equal(boundary.items.length, 50);
    assert.equal(boundary.requests, 2);
  }
});

test('final explain metadata without done is accepted without changing the cursor or snapshot', async () => {
  const result = await collectTenantRestQuery(options({ runQuery: async () => [
    ...rows(fixture(1)), { explainMetrics: {} },
  ] }));
  assert.equal(result.items.length, 1);
  assert.equal(result.readTime, readTime);
});

test('invalid explain metrics, nonboolean done, and rows after completion reject', async () => {
  for (const explainMetrics of [null, [], 'metrics', 1, true, undefined]) {
    await assert.rejects(collectTenantRestQuery(options({
      runQuery: async () => [{ readTime, explainMetrics }],
    })), /Malformed/);
  }
  for (const done of [null, 'false', 0, {}, undefined]) {
    await assert.rejects(collectTenantRestQuery(options({
      runQuery: async () => [{ readTime, done }],
    })), /Malformed/);
  }
  for (const done of [true, false]) {
    await assert.rejects(collectTenantRestQuery(options({
      runQuery: async () => [{ readTime, done }, { explainMetrics: {} }],
    })), /Malformed/);
    let requests = 0;
    await assert.rejects(collectTenantRestQuery(options({ runQuery: async () => (
      requests++ === 0 ? rows(fixture(50)) : [{ done, explainMetrics: {} }]
    ) })), /Missing readTime/);
  }
  await assert.rejects(collectTenantRestQuery(options({
    runQuery: async () => [{ explainMetrics: {} }],
  })), /cannot confirm/);
});

test('snapshot remains fixed when live fixtures insert, change and delete records between requests', async () => {
  const snapshot = fixture(100);
  let live = structuredClone(snapshot);
  const transport = fixtureTransport(snapshot);
  const result = await collectTenantRestQuery(options({ runQuery: async (body, scope) => {
    if (body.readTime) {
      assert.equal(body.readTime, readTime);
      assert.notDeepEqual(live, snapshot);
    }
    const response = await transport.runQuery(body, scope);
    live = [{ ...live[0], name: `${parent}/orders/inserted-before-cursor` }, ...live.slice(2)];
    live[0].fields.amount.integerValue = '99999';
    return response;
  } }));
  assert.deepEqual(result.items.map(item => item.data.amount), snapshot.map(document => Number(document.fields.amount.integerValue)));
  assert.equal(result.items.length, 100);
});

test('non-advancing, duplicate and unordered names reject instead of reporting exhaustion', async () => {
  let page = 0;
  await assert.rejects(collectTenantRestQuery(options({ runQuery: async () => rows(
    page++ === 0 ? fixture(50) : [fixture(50)[49]],
  ) })), /Non-advancing/);
  for (const documents of [[fixture(2)[0], fixture(2)[0]], fixture(2).reverse()]) {
    await assert.rejects(collectTenantRestQuery(options({ runQuery: async () => rows(documents) })), /Non-advancing/);
  }
});

test('malformed, skipped, foreign-scope and oversized responses reject', async () => {
  const original = fixture(1)[0];
  const badResponses = [
    null, {}, [], [null], [{}], [{ error: { message: 'denied' } }], [{ skippedResults: 1, readTime }],
    [{ readTime: 'not-a-time' }], [{ readTime: '2026-02-30T01:02:03Z' }],
    [{ readTime: '2026-10-03T01:02:03.1234567890Z' }],
    [{ document: { name: original.name }, readTime }],
    rows([{ ...original, name: original.name.replace('unit-only', 'foreign-project') }]),
    rows([{ ...original, name: `${original.name}/nested/document` }]),
    rows([{ ...original, fields: { companyId: { stringValue: 'foreign-tenant' } } }]),
    rows([{ ...original, fields: { companyId: { stringValue: companyId, integerValue: '1' } } }]),
    rows(fixture(51)), [{ readTime, done: true }, { readTime }],
  ];
  for (const response of badResponses) {
    await assert.rejects(collectTenantRestQuery(options({ runQuery: async () => response })));
  }
});

test('valid Unicode names use UTF-8 order and retain authoritative document IDs', async () => {
  const ids = ['z', '\ue000', '\u{10000}'];
  const documents = ids.map(id => ({ ...fixture(1)[0], name: `${parent}/orders/${id}` }));
  const result = await collectTenantRestQuery(options({ ...fixtureTransport(documents), pageSize: 1 }));
  assert.deepEqual(result.items.map(item => item.id), ids);
});

test('invalid scope or query shape never calls transport or weakens the filter', async () => {
  let requests = 0;
  const runQuery = async () => { requests += 1; return rows([]); };
  const unsupported = [
    { queryBody: { structuredQuery: { ...queryBody.structuredQuery, where: undefined } } },
    { queryBody: { structuredQuery: { ...queryBody.structuredQuery, where: { compositeFilter: { op: 'OR', filters: [] } } } } },
    { queryBody: { ...queryBody, readTime } },
    { context: { ...context, accountType: 'customer' } },
    { context: { ...context, companyId: 'different-tenant' } },
    { context: { ...context, parent: 'orders' } },
    { context: { ...context, parent: `${parent}/orders` } },
  ];
  for (const key of ['select', 'offset', 'limit', 'startAt', 'endAt', 'findNearest']) {
    unsupported.push({ queryBody: { structuredQuery: { ...queryBody.structuredQuery, [key]: {} } } });
  }
  unsupported.push({ queryBody: { structuredQuery: { ...queryBody.structuredQuery, from: [{ collectionId: 'orders', allDescendants: true }] } } });
  unsupported.push({ queryBody: { structuredQuery: { ...queryBody.structuredQuery, orderBy: [{ field: { fieldPath: 'createdAt' }, direction: 'DESCENDING' }] } } });
  for (const override of unsupported) await assert.rejects(collectTenantRestQuery(options({ runQuery, ...override })));
  assert.equal(requests, 0);
});

test('caller and transport mutations cannot change the captured tenant/query on later pages', async () => {
  const mutableQuery = structuredClone(queryBody);
  const mutableContext = { ...context };
  const originalQuery = structuredClone(mutableQuery);
  const transport = fixtureTransport(fixture(51));
  const result = await collectTenantRestQuery(options({
    queryBody: mutableQuery, context: mutableContext,
    runQuery: async (body, scope) => {
      assert.deepEqual(body.structuredQuery.where, originalQuery.structuredQuery.where);
      assert.equal(scope.companyId, companyId);
      const response = await transport.runQuery(body, scope);
      mutableQuery.structuredQuery.where.fieldFilter.value.stringValue = 'changed';
      mutableContext.companyId = 'changed';
      body.structuredQuery.where.fieldFilter.value.stringValue = 'changed';
      scope.companyId = 'changed';
      return response;
    },
  }));
  assert.equal(result.items.length, 51);
});

test('AbortSignal promptly rejects an ignored in-flight transport without publishing late data', async () => {
  const controller = new AbortController();
  const gate = deferred();
  const publications = [];
  let requests = 0;
  const scan = collectTenantRestQuery(options({ signal: controller.signal, runQuery: async (_, scope) => {
    requests += 1;
    assert.equal(scope.signal, controller.signal);
    return gate.promise;
  } })).then(result => publications.push(result));
  const rejected = assert.rejects(scan, { name: 'AbortError' });
  await Promise.resolve();
  controller.abort();
  await rejected;
  gate.resolve(rows(fixture(50)));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(requests, 1);
  assert.deepEqual(publications, []);
});

test('generation invalidation after a page or a late error suppresses the entire result', async () => {
  for (const rejectLate of [false, true]) {
    const gate = deferred();
    let current = true;
    let requests = 0;
    const publications = [];
    const scan = collectTenantRestQuery(options({ isCurrent: () => current, runQuery: async () => {
      requests += 1;
      return requests === 1 ? rows(fixture(50)) : gate.promise;
    } })).then(result => publications.push(result));
    const rejected = assert.rejects(scan, { name: 'AbortError' });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(requests, 2);
    current = false;
    if (rejectLate) gate.reject(new Error('late transport failure'));
    else gate.resolve(rows([fixture(51)[50]]));
    await rejected;
    assert.deepEqual(publications, []);
  }
});

test('already aborted or invalidated scans make no transport calls', async () => {
  const controller = new AbortController();
  controller.abort();
  let requests = 0;
  const runQuery = async () => { requests += 1; return rows([]); };
  for (const cancellation of [{ signal: controller.signal }, { isCurrent: () => false }]) {
    await assert.rejects(collectTenantRestQuery(options({ runQuery, ...cancellation })), { name: 'AbortError' });
  }
  assert.equal(requests, 0);
});

test('invalidation during final decoding prevents a complete-but-stale result', async () => {
  let current = true;
  await assert.rejects(collectTenantRestQuery(options({
    ...fixtureTransport(fixture(1)), isCurrent: () => current,
    decodeFields: fields => { current = false; return decodeFields(fields); },
  })), { name: 'AbortError' });
});

test('page limit rejects incomplete scans, invalid limits make no requests', async () => {
  const transport = fixtureTransport(fixture(100));
  await assert.rejects(collectTenantRestQuery(options({ ...transport, maxPages: 1 })), /page limit/);
  assert.equal(transport.calls.length, 1);
  for (const maxPages of [0, -1, 1.5, Infinity, NaN]) {
    await assert.rejects(collectTenantRestQuery(options({ ...transport, maxPages })), /maxPages/);
  }
  assert.equal(transport.calls.length, 1);
});

test('decoder errors or tenant changes never resolve a partial result', async () => {
  const transport = fixtureTransport(fixture(51));
  let decoded = 0;
  await assert.rejects(collectTenantRestQuery(options({ ...transport, decodeFields: fields => {
    if (++decoded === 51) throw new Error('decode failed');
    return decodeFields(fields);
  } })), /decode failed/);
  await assert.rejects(collectTenantRestQuery(options({
    ...fixtureTransport(fixture(1)), decodeFields: () => ({ companyId: 'foreign-tenant' }),
  })), /tenant mismatch/);
});
