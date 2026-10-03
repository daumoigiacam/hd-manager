export const DEFAULT_REST_PAGE_SIZE = 50;
export const MAX_REST_PAGE_SIZE = 200;

const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const hasOnlyKeys = (value, keys) => isObject(value) && Object.keys(value).every(key => keys.includes(key));
const encoder = new TextEncoder();

const compareNames = (left, right) => {
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return a.length - b.length;
};

export const normalizeRestPageSize = (value = DEFAULT_REST_PAGE_SIZE) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0
    ? Math.min(parsed, MAX_REST_PAGE_SIZE)
    : DEFAULT_REST_PAGE_SIZE;
};

const parseReadTime = value => {
  const match = typeof value === 'string'
    && /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,9}))?Z$/.exec(value);
  if (!match) throw new Error('Malformed readTime; a valid UTC timestamp is required.');
  const millis = Date.parse(`${match[1]}Z`);
  const fraction = match[2] || '';
  if (!Number.isFinite(millis) || new Date(millis).toISOString() !== `${match[1]}.000Z`) {
    throw new Error('Malformed readTime; a valid UTC timestamp is required.');
  }
  const microFraction = fraction.padEnd(6, '0').slice(0, 6);
  return {
    value,
    nanos: BigInt(millis) * 1_000_000n + BigInt(fraction.padEnd(9, '0')),
    pinnedValue: /[1-9]/.test(fraction.slice(6)) ? `${match[1]}.${microFraction}Z` : value,
    pinnedNanos: (BigInt(millis) * 1000n + BigInt(microFraction)) * 1000n,
  };
};

const abortError = () => Object.assign(new Error('REST collection scan aborted or generation invalidated.'), {
  name: 'AbortError',
});

const validateQuery = (queryBody, context) => {
  if (!isObject(context) || context.accountType !== 'employee'
    || typeof context.companyId !== 'string' || !context.companyId.trim()
    || typeof context.parent !== 'string'
    || !/^projects\/[^/]+\/databases\/[^/]+\/documents(?:\/[^/]+\/[^/]+)*$/.test(context.parent)) {
    throw new Error('An employee session, tenant companyId and full REST parent are required.');
  }
  const query = queryBody?.structuredQuery;
  const selector = query?.from?.[0];
  const filter = query?.where?.fieldFilter;
  if (!hasOnlyKeys(queryBody, ['structuredQuery']) || !hasOnlyKeys(query, ['from', 'where', 'orderBy'])
    || !Array.isArray(query.from) || query.from.length !== 1
    || !hasOnlyKeys(selector, ['collectionId', 'allDescendants'])
    || typeof selector.collectionId !== 'string' || !selector.collectionId.trim()
    || selector.collectionId.includes('/') || ['.', '..'].includes(selector.collectionId)
    || (selector.allDescendants !== undefined && selector.allDescendants !== false)
    || !hasOnlyKeys(query.where, ['fieldFilter'])
    || !hasOnlyKeys(filter, ['field', 'op', 'value'])
    || !hasOnlyKeys(filter.field, ['fieldPath']) || filter.field.fieldPath !== 'companyId'
    || filter.op !== 'EQUAL' || !hasOnlyKeys(filter.value, ['stringValue'])
    || filter.value.stringValue !== context.companyId) {
    throw new Error('Only complete tenant-only queries with companyId EQUAL to the employee tenant are supported.');
  }
  if (['companies', 'customer_accounts'].includes(selector.collectionId)) {
    throw new Error('companies requires an exact tenant document read; customer_accounts is excluded from employee scans.');
  }
  if (query.orderBy !== undefined) {
    const order = query.orderBy?.[0];
    if (!Array.isArray(query.orderBy) || query.orderBy.length !== 1
      || !hasOnlyKeys(order, ['field', 'direction']) || !hasOnlyKeys(order.field, ['fieldPath'])
      || order.field.fieldPath !== '__name__'
      || (order.direction !== undefined && order.direction !== 'ASCENDING')) {
      throw new Error('Only ascending __name__ ordering is supported.');
    }
  }
  return structuredClone(query);
};

const parsePage = (response, { prefix, companyId, cursor, pageSize }) => {
  if (!Array.isArray(response) || response.length === 0) throw new Error('Malformed runQuery response.');
  const documents = [];
  const readTimes = [];
  const documentReadTimes = [];
  let previousName = cursor;
  let done = false;
  for (const row of response) {
    const hasDone = isObject(row) && Object.hasOwn(row, 'done');
    const hasExplainMetrics = isObject(row) && Object.hasOwn(row, 'explainMetrics');
    if (!hasOnlyKeys(row, ['document', 'readTime', 'done', 'skippedResults', 'explainMetrics'])
      || done || (row.skippedResults !== undefined && row.skippedResults !== 0)
      || (hasDone && typeof row.done !== 'boolean')
      || (hasExplainMetrics && !isObject(row.explainMetrics))
      || (row.document === undefined && row.readTime === undefined && !hasDone && !hasExplainMetrics)) {
      throw new Error('Malformed runQuery response row or skipped results.');
    }
    const rowReadTime = row.readTime === undefined ? null : parseReadTime(row.readTime);
    if (rowReadTime) readTimes.push(rowReadTime);
    if (row.document !== undefined) {
      const document = row.document;
      const name = document?.name;
      const id = typeof name === 'string' && name.startsWith(prefix) ? name.slice(prefix.length) : '';
      if (!id || id.includes('/') || !isObject(document.fields)) throw new Error('Malformed or out-of-scope document.');
      if (!hasOnlyKeys(document.fields.companyId, ['stringValue'])
        || document.fields.companyId.stringValue !== companyId) throw new Error('Foreign tenant document rejected.');
      if (previousName !== null && compareNames(name, previousName) <= 0) {
        throw new Error('Non-advancing cursor, duplicate or unordered document.');
      }
      previousName = name;
      documents.push(document);
      documentReadTimes.push(rowReadTime?.nanos ?? null);
    }
    // REST defines stream completion by presence of the boolean field.
    done = hasDone;
  }
  if (documents.length === 0 && readTimes.length === 0 && !done) {
    throw new Error('Explain metrics alone cannot confirm an authoritative query result.');
  }
  if (documents.length > pageSize) throw new Error('runQuery exceeded the bounded page size.');
  return { documents, readTimes, documentReadTimes };
};

/**
 * Collect a complete employee tenant-only REST query without publishing pages.
 * runQuery(body, context) must return the fully consumed JSON response array,
 * reject HTTP/transport errors, and retain the user's Firebase ID-token auth.
 * context requires { parent, companyId, accountType: 'employee' }; it is scope
 * metadata, not proof of authorization. The transport remains responsible for
 * authenticating that scope. decodeFields is the caller's existing REST decoder.
 * companies requires an exact tenant document read; customer_accounts is excluded.
 * At most one first-page replay pins advancing/sub-microsecond response times;
 * discarded documents are never decoded. App owns page and whole-scan deadlines.
 * Returns { items: [{ id, data }], readTime, pageCount, requests, documentsRead,
 * pageSize, exhausted: true }. Apply only after resolution and a current check.
 */
export async function collectTenantRestQuery({
  queryBody,
  context,
  runQuery,
  decodeFields,
  pageSize = DEFAULT_REST_PAGE_SIZE,
  maxPages = 10_000,
  signal,
  isCurrent = () => true,
} = {}) {
  if (typeof runQuery !== 'function' || typeof decodeFields !== 'function' || typeof isCurrent !== 'function') {
    throw new TypeError('runQuery, decodeFields and isCurrent must be functions.');
  }
  if (!Number.isSafeInteger(maxPages) || maxPages < 1) throw new TypeError('maxPages must be a positive safe integer.');
  const baseQuery = validateQuery(queryBody, context);
  const scope = { ...context };
  const normalizedSize = normalizeRestPageSize(pageSize);
  const prefix = `${scope.parent}/${baseQuery.from[0].collectionId}/`;
  const checkCurrent = () => {
    if (signal?.aborted || !isCurrent()) throw abortError();
  };
  const read = async body => {
    checkCurrent();
    let onAbort;
    const aborted = signal && new Promise((_, reject) => {
      onAbort = () => reject(abortError());
      signal.addEventListener('abort', onAbort, { once: true });
    });
    try {
      const pending = Promise.resolve().then(() => {
        checkCurrent();
        return runQuery(body, { ...scope, signal });
      });
      const response = await (aborted ? Promise.race([pending, aborted]) : pending);
      checkCurrent();
      return response;
    } catch (error) {
      checkCurrent();
      throw error;
    } finally {
      if (onAbort) signal.removeEventListener('abort', onAbort);
    }
  };

  const items = [];
  let cursor = null;
  let readTime = null;
  let fixedNanos = null;
  let pageCount = 0;
  let requests = 0;
  let documentsRead = 0;
  while (true) {
    checkCurrent();
    if (pageCount >= maxPages) throw new Error('REST scan exceeded the safe page limit before exhaustion.');
    const requestedReadTime = readTime;
    const body = {
      structuredQuery: {
        ...structuredClone(baseQuery),
        orderBy: [{ field: { fieldPath: '__name__' }, direction: 'ASCENDING' }],
        limit: normalizedSize,
        ...(cursor ? { startAt: { values: [{ referenceValue: cursor }], before: false } } : {}),
      },
      ...(readTime ? { readTime } : {}),
    };
    requests += 1;
    const page = parsePage(await read(body), { prefix, companyId: scope.companyId, cursor, pageSize: normalizedSize });
    documentsRead += page.documents.length;
    if (requestedReadTime !== null) {
      if (page.readTimes.length === 0) throw new Error('Missing readTime on a continued snapshot query.');
      if (page.readTimes.some(time => time.nanos !== fixedNanos)) throw new Error('Inconsistent readTime on a snapshot query.');
    } else if (page.readTimes.length > 0) {
      readTime = page.readTimes[0].pinnedValue;
      fixedNanos = page.readTimes[0].pinnedNanos;
      // Truncation changes the snapshot. Discard the original page and replay
      // from page one. With readTime now set, later mismatches reject, not replay.
      if (page.readTimes.some(time => time.nanos !== fixedNanos)
        || page.documentReadTimes.some(time => time !== fixedNanos)) continue;
    }
    if (page.documents.length === normalizedSize && readTime === null) {
      throw new Error('Missing readTime; cannot continue an authoritative collection scan.');
    }
    for (const document of page.documents) {
      checkCurrent();
      const data = decodeFields(document.fields);
      if (!isObject(data) || data.companyId !== scope.companyId) throw new Error('Decoded document tenant mismatch.');
      items.push({ id: document.name.slice(prefix.length), data });
    }
    pageCount += 1;
    checkCurrent();
    if (page.documents.length < normalizedSize) {
      return { items, readTime, pageCount, requests, documentsRead, pageSize: normalizedSize, exhausted: true };
    }
    cursor = page.documents.at(-1).name;
  }
}
