import {getAdaptivePerformancePolicy} from './adaptivePerformance.js';
// Immutable source identities isolate cached projections; scopes are bounded per source set.
export function createProjectionCache({maxScopes=8}={}) {
  if(!Number.isSafeInteger(maxScopes)||maxScopes<1||maxScopes>8)throw new RangeError('Invalid projection cache scope bound');
  const root = new WeakMap();
  return (sources, scope) => {
    if (!sources.length || sources.some(source => !source || typeof source !== 'object')) {
      throw new TypeError('Projection cache requires source objects');
    }
    let node = root;
    for (let index = 0; index < sources.length; index++) {
      const source = sources[index];
      if (!node.has(source)) node.set(source, index === sources.length - 1 ? new Map() : new WeakMap());
      node = node.get(source);
    }
    if (!node.has(scope)) {
      if (node.size >= maxScopes) node.delete(node.keys().next().value);
      node.set(scope, { complete: false });
    }
    return node.get(scope);
  };
}

export function createProjectionScheduler() {
  if (typeof MessageChannel === 'undefined') return {
    yieldTask: () => new Promise(resolve => setTimeout(resolve, 0)), close() {},
  };
  const channel = new MessageChannel();
  const pending = [];
  let closed = false;
  channel.port1.onmessage = () => { pending.shift()?.(); };
  return {
    yieldTask: () => closed ? Promise.resolve() : new Promise(resolve => { pending.push(resolve); channel.port2.postMessage(null); }),
    close: () => {
      closed = true; channel.port1.close(); channel.port2.close();
      pending.splice(0).forEach(resolve => resolve());
    },
  };
}

export function* sortProjection(records, compare) {
  let from = records;
  let to = new Array(from.length);
  for (let width = 1; width < from.length; width *= 2) {
    for (let offset = 0; offset < from.length; offset += width * 2) {
      let left = offset;
      const middle = Math.min(offset + width, from.length);
      let right = middle;
      const end = Math.min(offset + width * 2, from.length);
      for (let position = offset; position < end; position++) {
        to[position] = left < middle && (right >= end || compare(from[left], from[right]) <= 0)
          ? from[left++] : from[right++];
        yield;
      }
    }
    [from, to] = [to, from];
  }
  return from;
}

export async function runCooperativeProjection(factory, { signal, yieldTask,
  now = () => performance.now(), budgetMs = getAdaptivePerformancePolicy().workBudgetMs, maxOperations = getAdaptivePerformancePolicy().maxOperations } = {}) {
  if (!(budgetMs > 0) || !Number.isFinite(budgetMs) || !Number.isInteger(maxOperations) || maxOperations < 1) {
    throw new RangeError('Invalid projection budget');
  }
  const iterator = factory();
  const scheduler = yieldTask ? { yieldTask, close() {} } : createProjectionScheduler();
  try {
    while (true) {
      await scheduler.yieldTask();
      if (signal?.aborted) throw new DOMException('Projection cancelled', 'AbortError');
      const start = now();
      for (let count = 0; count < maxOperations; count++) {
        const next = iterator.next();
        if (next.done) return next.value;
        if (now() - start >= budgetMs) break;
      }
    }
  } finally { scheduler.close(); iterator.return?.(); }
}
