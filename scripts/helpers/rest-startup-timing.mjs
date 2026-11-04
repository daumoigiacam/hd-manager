// Inject with `(${armRestStartupTiming.toString()})({ownedSyntheticApk:true})`.
// The driver must verify APK ownership/identity first, and call restore() in
// finally on success or failure. pagehide and a bounded watchdog also restore.
// Raw ES2019: no imports, optional chaining, application hooks, or payload logs.
export function armRestStartupTiming(options) {
  options = options || {};
  var scope = window;
  if (options.ownedSyntheticApk !== true || scope.location.hostname !== 'localhost') {
    throw new Error('REST timing requires an explicitly verified owned synthetic APK.');
  }
  var maxPages = options.maxPages === undefined ? 256 : options.maxPages;
  var timeoutMs = options.timeoutMs === undefined ? 60000 : options.timeoutMs;
  if (!Number.isSafeInteger(maxPages) || maxPages < 1 || maxPages > 512
    || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120000) {
    throw new TypeError('Invalid REST diagnostic bounds.');
  }
  if (scope.__upgradeRestStartupTiming) scope.__upgradeRestStartupTiming.restore();
  var endpoint = 'http://127.0.0.1:8185/v1/projects/demo-hdm-perf-verification/databases/(default)/documents/artifacts/verification-fixture/public/data:runQuery';
  var originalFetch = scope.fetch, OriginalWorker = scope.Worker;
  var pages = [], jobs = [], candidates = [], workers = [], undos = [];
  var droppedPages = 0, droppedJobs = 0, ambiguousJobs = 0, stopped = false, timer;
  var now = function () { return scope.performance.now(); };
  var start = now();
  function number(value) { return Number.isSafeInteger(value) && value >= 0 ? value : 0; }
  function patch(object, key, value) {
    var descriptor = Object.getOwnPropertyDescriptor(object, key);
    Object.defineProperty(object, key, { configurable: true, writable: true, value: value });
    undos.push(function () {
      if (object[key] !== value) return;
      if (descriptor) Object.defineProperty(object, key, descriptor);
      else delete object[key];
    });
  }
  function read() {
    // Copy numeric/boolean metadata; never expose live internal structures.
    return JSON.parse(JSON.stringify({ startedAt: start, stopped: stopped,
      droppedPages: droppedPages, droppedJobs: droppedJobs, ambiguousJobs: ambiguousJobs,
      pages: pages, jobs: jobs }));
  }
  function restore() {
    if (!stopped) {
      stopped = true;
      scope.clearTimeout(timer);
      scope.removeEventListener('pagehide', restore);
      workers.forEach(function (entry) {
        entry.worker.removeEventListener('message', entry.message);
        entry.worker.removeEventListener('error', entry.error);
        entry.active.clear();
      });
      undos.reverse().forEach(function (undo) { undo(); });
      undos.length = 0; workers.length = 0; candidates.length = 0;
    }
    return read();
  }
  function wrappedFetch(input, init) {
    var page = null;
    // Exact string match intentionally excludes Request objects, lookalike
    // hosts, other projects/apps, query strings and production endpoints.
    if (!stopped && input === endpoint && init && init.method === 'POST' && typeof init.body === 'string') {
      try {
        var body = JSON.parse(init.body), query = body.structuredQuery;
        var name = query && query.from && query.from.length === 1 && query.from[0].collectionId;
        if (typeof name === 'string' && /^[A-Za-z][A-Za-z_]{0,63}$/.test(name)) {
          if (pages.length >= maxPages) droppedPages++;
          else {
            page = { page: pages.length + 1, collection: name, limit: number(query.limit),
              hasCursor: !!query.startAt, hasReadTime: !!body.readTime, fetchAt: now() };
            pages.push(page);
          }
        }
      } catch (ignored) { /* Malformed/unrelated requests pass through. */ }
    }
    var pending;
    try { pending = originalFetch.apply(this, arguments); }
    catch (error) { if (page && !stopped) { page.fetchFailed = true; page.failedAt = now(); } throw error; }
    if (!page) return pending;
    return pending.then(function (response) {
      if (stopped) return response;
      page.headersAt = now(); page.headersMs = page.headersAt - page.fetchAt;
      page.status = number(response.status);
      var text = response.text;
      patch(response, 'text', function () {
        if (stopped) return text.apply(this, arguments);
        var textAt = now(), result;
        page.textAt = textAt;
        try { result = text.apply(this, arguments); }
        catch (error) { page.textFailed = true; throw error; }
        return result.then(function (value) {
          if (!stopped) {
            page.textCompleteAt = now(); page.textMs = page.textCompleteAt - textAt;
            page.bodySinceHeadersMs = page.textCompleteAt - page.headersAt;
            page.textLength = typeof value === 'string' ? value.length : 0;
            if (typeof value === 'string' && page.status >= 200 && page.status < 300
              && !page.bodyRecorded) { page.bodyRecorded = true; candidates.push(page); }
          }
          return value;
        }, function (error) {
          if (!stopped) { page.textFailed = true; page.failedAt = now(); }
          throw error;
        });
      });
      return response;
    }, function (error) {
      if (!stopped) { page.fetchFailed = true; page.failedAt = now(); }
      throw error;
    });
  }
  function InstrumentedWorker() {
    var worker = Reflect.construct(OriginalWorker, Array.prototype.slice.call(arguments));
    var url = String(arguments[0]);
    // Only the emitted JSON-parser asset, never SDK or other workers.
    if (stopped || !/(?:^|\/)jsonParseWorker(?:-[A-Za-z0-9_-]+)?\.js(?:\?.*)?$/.test(url) || workers.length >= 8) return worker;
    var post = worker.postMessage, active = new Map();
    var entry = { worker: worker, active: active };
    function closeJob(job, phase) { job[phase] = now(); active.delete(job.id); }
    entry.message = function (event) {
      var message = event.data, job = message && active.get(message.id);
      if (stopped || !job) return;
      if (message.type === 'parsed-json-start') { job.startAt = now(); job.expectedRows = number(message.count); }
      else if (message.type === 'parsed-json-chunk') {
        job.lastChunkAt = now(); job.chunks++;
        job.rows += Array.isArray(message.rows) ? message.rows.length : 0;
      } else if (message.type === 'parsed-json-complete' || message.type === 'parsed-json') closeJob(job, 'completeAt');
      else if (message.type === 'invalid-json') closeJob(job, 'invalidAt');
    };
    entry.error = function () { active.forEach(function (job) { job.errorAt = now(); }); active.clear(); };
    workers.push(entry);
    worker.addEventListener('message', entry.message);
    worker.addEventListener('error', entry.error);
    patch(worker, 'postMessage', function (message) {
      var job, matches;
      if (!stopped && message && Number.isSafeInteger(message.id)) {
        job = active.get(message.id);
        if (typeof message.text === 'string' && !job) {
          matches = candidates.filter(function (page) { return page.textLength === message.text.length; });
          // Length is the only payload-derived correlation key. Never guess
          // between equal-length bodies; consume ambiguous candidates instead.
          candidates = candidates.filter(function (page) { return matches.indexOf(page) === -1; });
          if (jobs.length >= maxPages) droppedJobs++;
          else {
            job = { id: message.id, worker: workers.indexOf(entry) + 1,
              page: matches.length === 1 ? matches[0].page : 0, textLength: message.text.length,
              dispatchAt: now(), chunks: 0, rows: 0, acks: 0, ackDelayMs: 0, maxAckDelayMs: 0 };
            if (matches.length > 1) ambiguousJobs++;
            jobs.push(job); active.set(message.id, job);
          }
        } else if (job && message.type === 'ack-json') {
          job.acks++;
          if (job.lastChunkAt !== undefined) {
            var delay = now() - job.lastChunkAt;
            job.ackDelayMs += delay; job.maxAckDelayMs = Math.max(job.maxAckDelayMs, delay);
            delete job.lastChunkAt;
          }
        } else if (job && message.type === 'cancel-json') closeJob(job, 'cancelAt');
      }
      try { return post.apply(this, arguments); }
      catch (error) { if (job && !stopped) closeJob(job, 'postFailedAt'); throw error; }
    });
    return worker;
  }
  // ACK delay is chunk observation -> outgoing ACK, including receiver work
  // and task scheduling. It is not exclusive scheduler or worker CPU time.
  try {
    InstrumentedWorker.prototype = OriginalWorker.prototype;
    Object.setPrototypeOf(InstrumentedWorker, OriginalWorker);
    patch(scope, 'fetch', wrappedFetch);
    patch(scope, 'Worker', InstrumentedWorker);
    scope.addEventListener('pagehide', restore);
    timer = scope.setTimeout(restore, timeoutMs);
    scope.__upgradeRestStartupTiming = { read: read, restore: restore };
    return scope.__upgradeRestStartupTiming;
  } catch (error) { restore(); throw error; }
}
